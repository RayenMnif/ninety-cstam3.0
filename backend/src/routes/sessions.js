// src/routes/sessions.js
async function sessionRoutes(fastify, opts) {

    fastify.post('/start', {
      preHandler: [fastify.authenticate],
    }, async (request, reply) => {
      const customerId = request.user.id;
      const { stationId, tariffId } = request.body || {};
  
      if (!stationId || !tariffId) {
        return reply.code(400).send({ error: 'stationId and tariffId are required' });
      }
  
      const client = await fastify.pg.connect();
  
      try {
        
        const walletRes = await client.query(
          `SELECT balance_millimes FROM wallets WHERE user_id = $1`,
          [customerId]
        );
  
        if (walletRes.rows.length === 0) {
          return reply.code(404).send({ error: 'Wallet not found for this user' });
        }
  
        const balance = BigInt(walletRes.rows[0].balance);
        if (balance <= 0) {
          return reply.code(400).send({ error: 'Insufficient wallet balance to start session' });
        }
  
        const tariffRes = await client.query(
          `SELECT id, price_per_unit_millimes, unit_seconds, rounding_rule,  minimum_charge_millimes FROM tariffs WHERE id = $1`,
          [tariffId]
        );
        if (tariffRes.rows.length === 0) {
          return reply.code(404).send({ error: 'Tariff rate not found' });
        }
  
  
        await client.query('BEGIN');
  
        // Note: unique index (idx_one_active_session_per_station) will 
        // automatically throw error 23505 if PC is already in PENDING/ACTIVE/PAUSED
        const sessionRes = await client.query(
          `INSERT INTO sessions (station_id, customer_id, tariff_id, status, opened_at)
           VALUES ($1, $2, $3, 'ACTIVE', CURRENT_TIMESTAMP)
           RETURNING id, station_id, customer_id, tariff_id, status, opened_at, version`,
          [stationId, customerId, tariffId]
        );
  
        const session = sessionRes.rows[0];
  
  
        const actor = request.user.role === 'ADMIN' ? 'ADMIN' : 'GAMER';
        await client.query(
          `INSERT INTO session_events (session_id, type, actor, payload)
           VALUES ($1, 'SESSION_STARTED', $2, $3)`,
          [session.id, actor, JSON.stringify({ initialBalance: balance, tariffId })]
        );
  
        await client.query('COMMIT');
  
        // Step D: Send WebSocket START command to the C# Agent
        const delivered = fastify.sendToStation(stationId, 'SESSION_COMMAND', {
          action: 'START',
          sessionId: session.id,
          walletBalance: balance,
        });
  
        return reply.code(201).send({
          message: 'Session started successfully',
          session,
          walletBalance: balance,
          delivered,
        });
  
      } catch (error) {
        await client.query('ROLLBACK');
  
        // Unique index constraint violation check (station already active)
        if (error.code === '23505') {
          return reply.code(409).send({ error: 'Station already has an active session' });
        }
  
        request.log.error(error);
        return reply.code(500).send({ error: 'Failed to start session due to server error' });
      } finally {
        client.release();
      }
    });
  
   
    fastify.post('/stop', {
      preHandler: [fastify.authenticate],
    }, async (request, reply) => {
      const customerId = request.user.id;
      const { sessionId, stationId } = request.body || {};
    
      const client = await fastify.pg.connect();
    
      try {
        // Step A: Fetch active session along with ALL tariff billing rules
        let query = `
          SELECT 
            s.id, s.station_id, s.customer_id, s.opened_at, s.version,
            t.price_per_unit_millimes, 
            t.unit_seconds, 
            t.rounding_rule, 
            t.minimum_charge_millimes
          FROM sessions s
          JOIN tariffs t ON s.tariff_id = t.id
          WHERE s.status IN ('ACTIVE', 'PAUSED')
        `;
        const params = [];
    
        if (sessionId) {
          params.push(sessionId);
          query += ` AND s.id = $${params.length}`;
        } else if (stationId) {
          params.push(stationId);
          query += ` AND s.station_id = $${params.length}`;
        } else {
          params.push(customerId);
          query += ` AND s.customer_id = $${params.length}`;
        }
    
        const sessionRes = await client.query(query, params);
        if (sessionRes.rows.length === 0) {
          return reply.code(404).send({ error: 'No active session found' });
        }
    
        const session = sessionRes.rows[0];
    
        if (request.user.role !== 'ADMIN' && session.customer_id !== customerId) {
          return reply.code(403).send({ error: 'Forbidden: You can only stop your own session' });
        }
    
    
        const openedAt = new Date(session.opened_at);
        const now = new Date();
        const elapsedSeconds = Math.max(Math.floor((now - openedAt) / 1000), 1);
    
        const unitSeconds = parseInt(session.unit_seconds, 10);
        const pricePerUnit = BigInt(session.price_per_unit_millimes);
        const minimumCharge = BigInt(session.minimum_charge_millimes);
    
        const rawUnits = elapsedSeconds / unitSeconds;
    
        const rule = (session.rounding_rule ).toUpperCase();

        let rawCostMillimes;
        
        if (rule === 'EXACT') {
          rawCostMillimes = (BigInt(elapsedSeconds) * pricePerUnit) / BigInt(unitSeconds);
        } else {
          let roundedUnits;
        
          switch (rule) {
            case 'NEAREST':
              roundedUnits = Math.round(rawUnits);
              break;
            case 'UP':
            default:
              roundedUnits = Math.ceil(rawUnits);
              break;
          }
        
          rawCostMillimes = BigInt(roundedUnits) * pricePerUnit;
        }

        const totalCostMillimes = rawCostMillimes > minimumCharge ? rawCostMillimes : minimumCharge;
        
        await client.query('BEGIN');
    
    
        const walletRes = await client.query(
          `UPDATE wallets 
           SET balance = balance - $1 
           WHERE user_id = $2 
           RETURNING balance`,
          [totalCostMillimes.toString(), session.customer_id]
        );
    
    
        const updateSessionRes = await client.query(
          `UPDATE sessions 
           SET status = 'SETTLED', 
               closed_at = CURRENT_TIMESTAMP, 
               version = version + 1 
           WHERE id = $1 AND version = $2
           RETURNING id, station_id, customer_id, status, opened_at, closed_at, version`,
          [session.id, session.version]
        );
    
        if (updateSessionRes.rows.length === 0) {
          throw new Error('Concurrent session modification detected');
        }
    
    
        const actor = request.user.role === 'ADMIN' ? 'ADMIN' : 'GAMER';
        await client.query(
          `INSERT INTO session_events (session_id, type, actor, payload)
           VALUES ($1, 'SESSION_ENDED', $2, $3)`,
          [
            session.id, 
            actor, 
            {
              totalCostMillimes: totalCostMillimes.toString(),
              elapsedSeconds,
              roundedUnits,
              unitSeconds,
              remainingBalanceMillimes: walletRes.rows[0]?.balance,
            }
          ]
        );
    
        await client.query('COMMIT');
    
        // Send WebSocket LOCK command
        const delivered = fastify.sendToStation(session.station_id, 'SESSION_COMMAND', {
          action: 'LOCK',
          sessionId: session.id,
        });
    
        return reply.send({
          message: 'Session closed and settled successfully',
          session: updateSessionRes.rows[0],
          totalCostMillimes: totalCostMillimes.toString(),
          remainingBalanceMillimes: walletRes.rows[0]?.balance,
          delivered,
        });
    
      } catch (error) {
        await client.query('ROLLBACK');
        request.log.error(error);
        return reply.code(500).send({ error: error.message || 'Failed to stop session' });
      } finally {
        client.release();
      }
    });
    // session unlock
    fastify.post('/unlock', {
      preHandler: [fastify.authenticate],
    }, async (request, reply) => {
      const customerId = request.user.id;
      const { sessionId, stationId } = request.body || {};

      const client = await fastify.pg.connect();

      try {
        let query = `SELECT id, station_id, customer_id, version FROM sessions WHERE status = 'PAUSED'`;
        const params = [];

        if (sessionId) {
          params.push(sessionId);
          query += ` AND id = $${params.length}`;
        } else if (stationId) {
          params.push(stationId);
          query += ` AND station_id = $${params.length}`;
        } else {
          params.push(customerId);
          query += ` AND customer_id = $${params.length}`;
        }

        const sessionRes = await client.query(query, params);
        if (sessionRes.rows.length === 0) {
          return reply.code(404).send({ error: 'No paused session found to unlock' });
        }

        const session = sessionRes.rows[0];

        if (request.user.role !== 'ADMIN' && session.customer_id !== customerId) {
          return reply.code(403).send({ error: 'Forbidden: You can only unlock your own session' });
        }

        const walletRes = await client.query(
          `SELECT balance_millimes FROM wallets WHERE user_id = $1`,
          [session.customer_id]
        );

        const balance = walletRes.rows[0]?.balance_millimes || '0';

        await client.query('BEGIN');

        const updateRes = await client.query(
          `UPDATE sessions 
          SET status = 'ACTIVE', version = version + 1 
          WHERE id = $1 AND version = $2
          RETURNING id, station_id, customer_id, status, version`,
          [session.id, session.version]
        );

        if (updateRes.rows.length === 0) {
          throw new Error('Concurrent session modification detected');
        }

        const actor = request.user.role === 'ADMIN' ? 'ADMIN' : 'GAMER';
        await client.query(
          `INSERT INTO session_events (session_id, type, actor, payload)
          VALUES ($1, 'SESSION_RESUMED', $2, $3)`,
          [session.id, actor, { unlockedAt: new Date().toISOString() }]
        );

        await client.query('COMMIT');

        let delivered = false;
        try {
          delivered = fastify.sendToStation(session.station_id, 'SESSION_COMMAND', {
            action: 'UNLOCK',
            sessionId: session.id,
            walletBalance: balance.toString(),
          });
        } catch (wsErr) {
          fastify.log.warn(`Station offline: ${wsErr.message}`);
        }

        return reply.send({
          message: 'Session unlocked successfully',
          session: updateRes.rows[0],
          delivered,
        });

      } catch (error) {
        await client.query('ROLLBACK');
        request.log.error(error);
        return reply.code(500).send({ error: error.message || 'Failed to unlock session' });
      } finally {
        client.release();
      }
    });
    // Session lock
    fastify.post('/lock', {
      preHandler: [fastify.authenticate],
    }, async (request, reply) => {
      const customerId = request.user.id;
      const { sessionId, stationId } = request.body || {};
  
      const client = await fastify.pg.connect();
  
      try {
        let query = `SELECT id, station_id, customer_id, version FROM sessions WHERE status = 'ACTIVE'`;
        const params = [];
  
        if (sessionId) {
          params.push(sessionId);
          query += ` AND id = $${params.length}`;
        } else if (stationId) {
          params.push(stationId);
          query += ` AND station_id = $${params.length}`;
        } else {
          params.push(customerId);
          query += ` AND customer_id = $${params.length}`;
        }
  
        const sessionRes = await client.query(query, params);
        if (sessionRes.rows.length === 0) {
          return reply.code(404).send({ error: 'No active session found to lock' });
        }
  
        const session = sessionRes.rows[0];
  
        if (request.user.role !== 'ADMIN' && session.customer_id !== customerId) {
          return reply.code(403).send({ error: 'Forbidden: You can only lock your own session' });
        }
  
        await client.query('BEGIN');
  
        const updateRes = await client.query(
          `UPDATE sessions 
           SET status = 'PAUSED', version = version + 1 
           WHERE id = $1 AND version = $2
           RETURNING id, station_id, customer_id, status, version`,
          [session.id, session.version]
        );
  
        if (updateRes.rows.length === 0) {
          throw new Error('Concurrent session modification detected');
        }
  
        const actor = request.user.role === 'ADMIN' ? 'ADMIN' : 'GAMER';
        await client.query(
          `INSERT INTO session_events (session_id, type, actor, payload)
           VALUES ($1, 'SESSION_PAUSED', $2, $3)`,
          [session.id, actor, { lockedAt: new Date().toISOString() }]
        );
  
        await client.query('COMMIT');
  
        let delivered = false;
        try {
          delivered = fastify.sendToStation(session.station_id, 'SESSION_COMMAND', {
            action: 'LOCK',
            sessionId: session.id,
          });
        } catch (wsErr) {
          fastify.log.warn(`Station offline: ${wsErr.message}`);
        }
  
        return reply.send({
          message: 'Session locked successfully',
          session: updateRes.rows[0],
          delivered,
        });
  
      } catch (error) {
        await client.query('ROLLBACK');
        request.log.error(error);
        return reply.code(500).send({ error: error.message || 'Failed to lock session' });
      } finally {
        client.release();
      }
    });
  }

  module.exports = sessionRoutes;