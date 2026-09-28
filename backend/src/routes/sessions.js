const {
  startSessionSchema,
  stopSessionSchema,
  unlockSessionSchema,
  lockSessionSchema,
} = require('../schemas/sessions.schema');

async function sessionRoutes(fastify, opts) {
  fastify.post('/start', {
    schema: startSessionSchema,
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const customerId = (request.user.role === 'ADMIN' && request.body?.customerId) 
      ? request.body.customerId 
      : request.user.id;
    const { stationId, tariffId } = request.body || {};

    if (!stationId || !tariffId) {
      return reply.code(400).send({ error: 'stationId and tariffId are required' });
    }

    const client = await fastify.pg.connect();

    try {
      await client.query('BEGIN');

      const stationRes = await client.query(
        `SELECT id, status FROM stations WHERE id = $1 FOR UPDATE`,
        [stationId]
      );

      if (stationRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return reply.code(404).send({ error: 'Station not found' });
      }

      const station = stationRes.rows[0];
      if (station.status !== 'AVAILABLE') {
        await client.query('ROLLBACK');
        return reply.code(409).send({ error: `Station is not available (Status: ${station.status})` });
      }

      const activeUserSessionCheck = await client.query(
        `SELECT id, station_id FROM sessions 
         WHERE customer_id = $1 AND status IN ('ACTIVE', 'PAUSED') 
         FOR UPDATE`,
        [customerId]
      );
      
      if (activeUserSessionCheck.rows.length > 0) {
        await client.query('ROLLBACK');
        return reply.code(409).send({ 
          error: 'User already has an active or paused gaming session on another station' 
        });
      }

      const reservationRes = await client.query(
        `SELECT id, start_time, end_time,
                EXTRACT(EPOCH FROM (start_time - CURRENT_TIMESTAMP)) AS seconds_until_start
         FROM reservations 
         WHERE station_id = $1 
           AND status IN ('CONFIRMED', 'CHECKED_IN', 'PENDING')
           AND end_time > CURRENT_TIMESTAMP
         ORDER BY start_time ASC
         LIMIT 1
         FOR UPDATE`,
        [stationId]
      );
  
      let maxAllowedSecondsByReservation = Infinity;

      if (reservationRes.rows.length > 0) {
        const nextRes = reservationRes.rows[0];
        const secondsUntilStart = Math.floor(Number(nextRes.seconds_until_start));
  
        if (secondsUntilStart <= 1800) { // 1800s = 30 mins
          await client.query('ROLLBACK');
          return reply.code(409).send({ 
            error: 'Station is reserved for an active or upcoming reservation starting soon',
            reservationId: nextRes.id,
            startTime: nextRes.start_time,
            endTime: nextRes.end_time,
            startsInSeconds: Math.max(0, secondsUntilStart),
          });
        }
        maxAllowedSecondsByReservation = secondsUntilStart - 300;
        upcomingReservation = {
          startTime: nextRes.start_time,
          startsInSeconds: secondsUntilStart,
        };
      }

      const tariffRes = await client.query(
        `SELECT id, price_per_unit_millimes, unit_seconds, rounding_rule, minimum_charge_millimes 
         FROM tariffs WHERE id = $1`,
        [tariffId]
      );

      if (tariffRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return reply.code(404).send({ error: 'Tariff rate not found' });
      }

      const tariff = tariffRes.rows[0];
      const minCharge = BigInt(tariff.minimum_charge_millimes || 0);
      const unitPrice = BigInt(tariff.price_per_unit_millimes);
      const unitSeconds = BigInt(tariff.unit_seconds || 3600);

      const requiredMinimum = minCharge > 0n ? minCharge : unitPrice;

      const walletRes = await client.query(
        `SELECT balance_millimes FROM wallets WHERE user_id = $1 FOR UPDATE`,
        [customerId]
      );

      if (walletRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return reply.code(404).send({ error: 'Wallet not found for this user' });
      }

      const balance = BigInt(walletRes.rows[0].balance_millimes);

      if (balance < requiredMinimum) {
        await client.query('ROLLBACK');
        return reply.code(400).send({
          error: `Insufficient wallet balance. Minimum required for this tariff is ${requiredMinimum.toString()} millimes.`,
          currentBalanceMillimes: balance.toString(),
          requiredMinimumMillimes: requiredMinimum.toString(),
        });
      }

      const maxPlayableSecondsBigInt = Number((balance * unitSeconds) / unitPrice);
      const maxPlayableSeconds = Math.min(maxPlayableSecondsBigInt, maxAllowedSecondsByReservation);

      const isCappedByReservation = maxPlayableSeconds < maxPlayableSecondsBigInt;

      if (maxPlayableSeconds <= 0) {
        await client.query('ROLLBACK');
        return reply.code(400).send({ error: 'Wallet balance is too low for this tariff rate' });
      }

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
        [
          session.id, 
          actor, 
          { 
            initialBalanceMillimes: balance.toString(), 
            tariffId, 
            maxPlayableSeconds 
          }
        ]
      );

      await client.query(
        `UPDATE stations SET status = 'OCCUPIED' WHERE id = $1`,
        [stationId]
      );

      await client.query('COMMIT');

      await fastify.redis.set(
        `session:expiry:${session.id}`,
        stationId,
        'EX',
        maxPlayableSeconds
      );

      const delivered = fastify.sendToStation(stationId, 'SESSION_COMMAND', {
        action: 'START',
        sessionId: session.id,
        durationSeconds: maxPlayableSeconds,
        walletBalance: balance.toString(),
        isCappedByReservation,
        upcomingReservationTime: isCappedByReservation ? upcomingReservation.startTime : null,
        warningMessage: isCappedByReservation 
          ? `Your session will end early due to an upcoming reservation at ${new Date(upcomingReservation.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`
          : null,
      });

      return reply.code(201).send({
        message: isCappedByReservation 
          ? 'Session started (Capped due to upcoming reservation)' 
          : 'Session started successfully',
        session,
        maxPlayableSeconds,
        walletBalanceMillimes: balance.toString(),
        isCappedByReservation,
        upcomingReservationTime: isCappedByReservation ? upcomingReservation.startTime : null,
        delivered,
      });

    } catch (error) {
      await client.query('ROLLBACK');

      if (error.code === '23505') {
        return reply.code(409).send({ error: 'Station already has an active session' });
      }

      request.log.error(error);
      return reply.code(500).send({ error: 'Failed to start session due to server error' });
    } finally {
      client.release();
    }
  });

  //
  // SESSION STOP
  //

  fastify.post('/stop', {
    schema: stopSessionSchema,
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const customerId = request.user.id;
    const { sessionId, stationId } = request.body || {};
  
    const client = await fastify.pg.connect();
  
    try {
      // 1. Begin transaction at the start
      await client.query('BEGIN');
  
      let query = `
        SELECT 
          s.id, s.station_id, s.customer_id, s.opened_at, s.version, s.reservation_id,
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
      query += ` ORDER BY s.opened_at DESC LIMIT 1 FOR UPDATE OF s`;
  
      const sessionRes = await client.query(query, params);
      if (sessionRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return reply.code(404).send({ error: 'No active session found' });
      }
  
      const session = sessionRes.rows[0];
  
      if (request.user.role !== 'ADMIN' && session.customer_id !== customerId) {
        await client.query('ROLLBACK');
        return reply.code(403).send({ error: 'Forbidden: You can only stop your own session' });
      }
  
      const openedAt = new Date(session.opened_at);
      const now = new Date();
      const elapsedSeconds = Math.max(Math.floor((now - openedAt) / 1000), 1);
  
      let totalCostMillimes = 0n;
      let roundedUnits = null;
      let remainingBalance = null;
  
      if (!session.reservation_id) {
        const unitSeconds = parseInt(session.unit_seconds, 10);
        const pricePerUnit = BigInt(session.price_per_unit_millimes);
        const minimumCharge = BigInt(session.minimum_charge_millimes);
        const rawUnits = elapsedSeconds / unitSeconds;
        const rule = (session.rounding_rule).toUpperCase();
  
        let rawCostMillimes;
        if (rule === 'EXACT') {
          rawCostMillimes = (BigInt(elapsedSeconds) * pricePerUnit) / BigInt(unitSeconds);
        } else {
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
  
        totalCostMillimes = rawCostMillimes > minimumCharge ? rawCostMillimes : minimumCharge;
  
        const walletRes = await client.query(
          `UPDATE wallets 
           SET balance_millimes = balance_millimes - $1 
           WHERE user_id = $2 
           RETURNING balance_millimes`,
          [totalCostMillimes.toString(), session.customer_id]
        );
  
        remainingBalance = walletRes.rows[0]?.balance_millimes || '0';
      } else {
        totalCostMillimes = 0n;
  
        const walletRes = await client.query(
          `SELECT balance_millimes FROM wallets WHERE user_id = $1`,
          [session.customer_id]
        );
        remainingBalance = walletRes.rows[0]?.balance_millimes || '0';
      }
  
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
            isReservation: Boolean(session.reservation_id),
            remainingBalanceMillimes: remainingBalance,
          }
        ]
      );
  
      await client.query(
        `UPDATE stations SET status = 'AVAILABLE' WHERE id = $1`,
        [session.station_id]
      );
  
      await client.query('COMMIT');
  
      // Send WebSocket LOCK Command
      let delivered = false;
      try {
        delivered = fastify.sendToStation(session.station_id, 'SESSION_COMMAND', {
          action: 'LOCK',
          sessionId: session.id,
        });
      } catch (wsErr) {
        fastify.log.warn(`Station offline during lock signal: ${wsErr.message}`);
      }
  
      return reply.send({
        message: 'Session closed and settled successfully',
        session: updateSessionRes.rows[0],
        totalCostMillimes: totalCostMillimes.toString(),
        remainingBalanceMillimes: remainingBalance,
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

    //
    // SESSION UNLOCK
    //

    fastify.post('/unlock', {
      schema: unlockSessionSchema,
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
        query += ` ORDER BY opened_at DESC LIMIT 1`;
        
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

    //
    // SESSION LOCK
    //

    fastify.post('/lock', {
      schema: lockSessionSchema,
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
        query += ` ORDER BY opened_at DESC LIMIT 1`;
  
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