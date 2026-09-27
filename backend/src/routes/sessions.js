async function sessionRoutes(fastify, opts) {

  fastify.post('/start', {
    schema: {
      summary: 'Start Gaming Session',
      description: 'Initiates an active gaming session on a target workstation after checking wallet minimum balance.',
      tags: ['Sessions'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['stationId', 'tariffId'],
        properties: {
          stationId: { type: 'string', format: 'uuid', description: 'Target station UUID', examples: ['e3f4a5b6-c7d8-9e0f-1a2b-3c4d5e6f7a8b'] },
          tariffId: { type: 'string', format: 'uuid', description: 'Selected tariff rate UUID', examples: ['c1d2e3f4-a5b6-7c8d-9e0f-1a2b3c4d5e6f'] },
          customerId: { type: 'string', format: 'uuid', description: 'Target gamer UUID (Admin override only)', examples: ['a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d'] },
        },
      },
      response: {
        201: {
          description: 'Session started successfully.',
          type: 'object',
          properties: {
            message: { type: 'string', example: 'Session started successfully' },
            session: {
              type: 'object',
              properties: {
                id: { type: 'string', format: 'uuid', example: 'd4e5f6a7-b8c9-0d1e-2f3a-4b5c6d7e8f9a' },
                station_id: { type: 'string', format: 'uuid', example: 'e3f4a5b6-c7d8-9e0f-1a2b-3c4d5e6f7a8b' },
                customer_id: { type: 'string', format: 'uuid', example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d' },
                tariff_id: { type: 'string', format: 'uuid', example: 'c1d2e3f4-a5b6-7c8d-9e0f-1a2b3c4d5e6f' },
                status: { type: 'string', example: 'ACTIVE' },
                opened_at: { type: 'string', format: 'date-time', example: '2026-09-27T10:00:00.000Z' },
                version: { type: 'integer', example: 1 },
              },
            },
            walletBalanceMillimes: { type: 'string', example: '15000' },
            delivered: { type: 'boolean', example: true },
          },
        },
        400: {
          description: 'Validation error or insufficient wallet balance.',
          type: 'object',
          properties: {
            error: { type: 'string', example: 'Insufficient wallet balance.' },
            currentBalanceMillimes: { type: 'string', example: '1000' },
            requiredMinimumMillimes: { type: 'string', example: '5000' },
            message: { type: 'string', example: 'Validation error' },
            statusCode: { type: 'integer', example: 400 },
          },
        },
        401: {
          description: 'Unauthorized: Missing or invalid token.',
          type: 'object',
          properties: {
            error: { type: 'string', example: 'Unauthorized: Missing token header' },
          },
        },
        404: {
          description: 'Tariff rate or user wallet not found.',
          type: 'object',
          properties: {
            error: { type: 'string', example: 'Tariff rate not found' },
          },
        },
        409: {
          description: 'Station already has an active session.',
          type: 'object',
          properties: {
            error: { type: 'string', example: 'Station already has an active session' },
          },
        },
        500: {
          description: 'Failed to start session due to server error.',
          type: 'object',
          properties: {
            error: { type: 'string', example: 'Failed to start session due to server error' },
          },
        },
      },
    },
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const customerId = (request.user.role === 'ADMIN' && request.body?.customerId) ? request.body.customerId : request.user.id;
    const { stationId, tariffId } = request.body || {};
  
    if (!stationId || !tariffId) {
      return reply.code(400).send({ error: 'stationId and tariffId are required' });
    }
  
    const client = await fastify.pg.connect();
  
    try {
      
      const tariffRes = await client.query(
        `SELECT id, price_per_unit_millimes, unit_seconds, rounding_rule, minimum_charge_millimes 
         FROM tariffs WHERE id = $1`,
        [tariffId]
      );
  
      if (tariffRes.rows.length === 0) {
        return reply.code(404).send({ error: 'Tariff rate not found' });
      }
  
      const tariff = tariffRes.rows[0];
      const minCharge = BigInt(tariff.minimum_charge_millimes);
      const unitPrice = BigInt(tariff.price_per_unit_millimes);
  
      const requiredMinimum = minCharge > 0n ? minCharge : unitPrice;
  
      const walletRes = await client.query(
        `SELECT balance_millimes FROM wallets WHERE user_id = $1`,
        [customerId]
      );
  
      if (walletRes.rows.length === 0) {
        return reply.code(404).send({ error: 'Wallet not found for this user' });
      }
  
      const balance = BigInt(walletRes.rows[0].balance_millimes);
  
      if (balance < requiredMinimum) {
        return reply.code(400).send({
          error: `Insufficient wallet balance. Minimum required for this tariff is ${requiredMinimum.toString()} millimes.`,
          currentBalanceMillimes: balance.toString(),
          requiredMinimumMillimes: requiredMinimum.toString(),
        });
      }
  
      await client.query('BEGIN');
  
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
        [session.id, actor, JSON.stringify({ initialBalance: balance.toString(), tariffId })]
      );
  
      await client.query(
        `UPDATE stations SET status = 'OCCUPIED' WHERE id = $1`,
        [stationId]
      );
  
      await client.query('COMMIT');
  
      const delivered = fastify.sendToStation(stationId, 'SESSION_COMMAND', {
        action: 'START',
        sessionId: session.id,
        walletBalance: balance.toString(),
      });
  
      return reply.code(201).send({
        message: 'Session started successfully',
        session,
        walletBalanceMillimes: balance.toString(),
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
   
    fastify.post('/stop', {
      schema: {
        summary: 'Stop Gaming Session',
        description: 'Terminates an active or paused session, calculates total millimes charge according to tariff rules, deducts the cost atomically from the wallet, marks station available, and locks workstation agent.',
        tags: ['Sessions'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', format: 'uuid', description: 'Session UUID (optional if stationId provided)', examples: ['d4e5f6a7-b8c9-0d1e-2f3a-4b5c6d7e8f9a'] },
            stationId: { type: 'string', format: 'uuid', description: 'Station UUID (optional if sessionId provided)', examples: ['e3f4a5b6-c7d8-9e0f-1a2b-3c4d5e6f7a8b'] },
          },
        },
        response: {
          200: {
            description: 'Session settled and closed successfully.',
            type: 'object',
            properties: {
              message: { type: 'string', example: 'Session closed and settled successfully' },
              session: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid', example: 'd4e5f6a7-b8c9-0d1e-2f3a-4b5c6d7e8f9a' },
                  station_id: { type: 'string', format: 'uuid', example: 'e3f4a5b6-c7d8-9e0f-1a2b-3c4d5e6f7a8b' },
                  customer_id: { type: 'string', format: 'uuid', example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d' },
                  status: { type: 'string', example: 'SETTLED' },
                  opened_at: { type: 'string', format: 'date-time', example: '2026-09-27T10:00:00.000Z' },
                  closed_at: { type: 'string', format: 'date-time', example: '2026-09-27T11:00:00.000Z' },
                  version: { type: 'integer', example: 2 },
                },
              },
              totalCostMillimes: { type: 'string', example: '5000' },
              remainingBalanceMillimes: { type: 'string', nullable: true, example: '10000' },
              delivered: { type: 'boolean', example: true },
            },
          },
          400: {
            description: 'Validation error.',
            type: 'object',
            properties: {
              error: { type: 'string', example: 'Bad Request' },
              message: { type: 'string', example: 'Validation failed' },
              statusCode: { type: 'integer', example: 400 },
            },
          },
          403: {
            description: 'Forbidden: Cannot stop another customer session.',
            type: 'object',
            properties: {
              error: { type: 'string', example: 'Forbidden: You can only stop your own session' },
            },
          },
          404: {
            description: 'No active session found.',
            type: 'object',
            properties: {
              error: { type: 'string', example: 'No active session found' },
            },
          },
          500: {
            description: 'Failed to stop session.',
            type: 'object',
            properties: {
              error: { type: 'string', example: 'Failed to stop session' },
            },
          },
        },
      },
      preHandler: [fastify.authenticate],
    }, async (request, reply) => {
      const customerId = request.user.id;
      const { sessionId, stationId } = request.body || {};
    
      const client = await fastify.pg.connect();
    
      try {
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
        query += ` ORDER BY s.opened_at DESC LIMIT 1`;
    
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
        let roundedUnits = null;
        
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

        const totalCostMillimes = rawCostMillimes > minimumCharge ? rawCostMillimes : minimumCharge;
        
        await client.query('BEGIN');
    
    
        const walletRes = await client.query(
          `UPDATE wallets 
           SET balance_millimes = balance_millimes - $1 
           WHERE user_id = $2 
           RETURNING balance_millimes`,
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

        await client.query(
          `UPDATE stations SET status = 'AVAILABLE' WHERE id = $1`,
          [stationId]
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
      schema: {
        summary: 'Unlock / Resume Gaming Session',
        description: 'Resumes a paused session back to ACTIVE, records an audit event, and signals the workstation agent to unlock.',
        tags: ['Sessions'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', format: 'uuid', description: 'Session UUID (optional if stationId provided)', examples: ['d4e5f6a7-b8c9-0d1e-2f3a-4b5c6d7e8f9a'] },
            stationId: { type: 'string', format: 'uuid', description: 'Station UUID (optional if sessionId provided)', examples: ['e3f4a5b6-c7d8-9e0f-1a2b-3c4d5e6f7a8b'] },
          },
        },
        response: {
          200: {
            description: 'Session unlocked and resumed successfully.',
            type: 'object',
            properties: {
              message: { type: 'string', example: 'Session unlocked successfully' },
              session: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid', example: 'd4e5f6a7-b8c9-0d1e-2f3a-4b5c6d7e8f9a' },
                  station_id: { type: 'string', format: 'uuid', example: 'e3f4a5b6-c7d8-9e0f-1a2b-3c4d5e6f7a8b' },
                  customer_id: { type: 'string', format: 'uuid', example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d' },
                  status: { type: 'string', example: 'ACTIVE' },
                  version: { type: 'integer', example: 2 },
                },
              },
              delivered: { type: 'boolean', example: true },
            },
          },
          403: {
            description: 'Forbidden: Cannot unlock another user session.',
            type: 'object',
            properties: {
              error: { type: 'string', example: 'Forbidden: You can only unlock your own session' },
            },
          },
          404: {
            description: 'No paused session found to unlock.',
            type: 'object',
            properties: {
              error: { type: 'string', example: 'No paused session found to unlock' },
            },
          },
          500: {
            description: 'Failed to unlock session.',
            type: 'object',
            properties: {
              error: { type: 'string', example: 'Failed to unlock session' },
            },
          },
        },
      },
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
      schema: {
        summary: 'Lock / Pause Gaming Session',
        description: 'Pauses an active session (status PAUSED), records an audit event, and dispatches a LOCK command to the desktop agent.',
        tags: ['Sessions'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', format: 'uuid', description: 'Session UUID (optional if stationId provided)', examples: ['d4e5f6a7-b8c9-0d1e-2f3a-4b5c6d7e8f9a'] },
            stationId: { type: 'string', format: 'uuid', description: 'Station UUID (optional if sessionId provided)', examples: ['e3f4a5b6-c7d8-9e0f-1a2b-3c4d5e6f7a8b'] },
          },
        },
        response: {
          200: {
            description: 'Session locked and paused successfully.',
            type: 'object',
            properties: {
              message: { type: 'string', example: 'Session locked successfully' },
              session: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid', example: 'd4e5f6a7-b8c9-0d1e-2f3a-4b5c6d7e8f9a' },
                  station_id: { type: 'string', format: 'uuid', example: 'e3f4a5b6-c7d8-9e0f-1a2b-3c4d5e6f7a8b' },
                  customer_id: { type: 'string', format: 'uuid', example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d' },
                  status: { type: 'string', example: 'PAUSED' },
                  version: { type: 'integer', example: 2 },
                },
              },
              delivered: { type: 'boolean', example: true },
            },
          },
          400: {
            description: 'Validation error.',
            type: 'object',
            properties: {
              error: { type: 'string', example: 'Bad Request' },
              message: { type: 'string', example: 'Validation failed' },
              statusCode: { type: 'integer', example: 400 },
            },
          },
          401: {
            description: 'Unauthorized: Missing or invalid token.',
            type: 'object',
            properties: {
              error: { type: 'string', example: 'Unauthorized: Missing token header' },
            },
          },
          403: {
            description: 'Forbidden: Cannot lock another user session.',
            type: 'object',
            properties: {
              error: { type: 'string', example: 'Forbidden: You can only lock your own session' },
            },
          },
          404: {
            description: 'No active session found to lock.',
            type: 'object',
            properties: {
              error: { type: 'string', example: 'No active session found to lock' },
            },
          },
          500: {
            description: 'Failed to lock session.',
            type: 'object',
            properties: {
              error: { type: 'string', example: 'Failed to lock session' },
            },
          },
        },
      },
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
        query += ` ORDER BY s.opened_at DESC LIMIT 1`;
  
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