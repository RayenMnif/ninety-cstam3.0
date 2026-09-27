async function reservationRoutes(fastify, opts) {
    fastify.get('/available', {
      schema: {
        summary: 'Query booked slots for a date',
        description: 'Returns all confirmed or checked-in reservations for a specific date to identify occupied time slots.',
        tags: ['Reservations'],
        querystring: {
          type: 'object',
          required: ['date'],
          properties: {
            date: { type: 'string', format: 'date', description: 'Target date in YYYY-MM-DD format' },
            stationId: { type: 'string', format: 'uuid', description: 'Optional workstation UUID to filter slots' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              date: { type: 'string', example: '2026-10-15' },
              bookedSlots: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', format: 'uuid' },
                    station_id: { type: 'string', format: 'uuid' },
                    start_time: { type: 'string', format: 'date-time' },
                    end_time: { type: 'string', format: 'date-time' },
                    status: { type: 'string', example: 'CONFIRMED' },
                  },
                },
              },
            },
          },
          400: {
            type: 'object',
            properties: { error: { type: 'string', example: 'date (YYYY-MM-DD) is required' } },
          },
        },
      },
    }, async (request, reply) => {
      const { date, stationId } = request.query || {};
  
      if (!date) {
        return reply.code(400).send({ error: 'date (YYYY-MM-DD) is required' });
      }
  
      const dayStart = `${date}T00:00:00Z`;
      const dayEnd = `${date}T23:59:59Z`;
  
      let query = `
        SELECT 
          r.id, r.station_id, r.start_time, r.end_time, r.status
        FROM reservations r
        WHERE r.status IN ('CONFIRMED', 'CHECKED_IN')
          AND r.start_time < $2 AND r.end_time > $1
      `;
      const params = [dayStart, dayEnd];
  
      if (stationId) {
        params.push(stationId);
        query += ` AND r.station_id = $${params.length}`;
      }
  
      query += ` ORDER BY r.start_time ASC`;
  
      const res = await fastify.pg.query(query, params);
  
      return reply.send({
        date,
        bookedSlots: res.rows,
      });
    });
  
    // RESERVE & PAY UPFRONT (NO CANCELLATION)
    fastify.post('/', {
      schema: {
        summary: 'Reserve & pay upfront',
        description: 'Reserves a workstation for a specific duration and deducts the total cost upfront from the wallet. Non-cancelable.',
        tags: ['Reservations'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['stationId', 'tariffId', 'startTime', 'durationMinutes'],
          properties: {
            stationId: { type: 'string', format: 'uuid', description: 'Target workstation UUID' },
            tariffId: { type: 'string', format: 'uuid', description: 'Selected tariff UUID' },
            startTime: { type: 'string', format: 'date-time', example: '2026-10-15T14:00:00Z', description: 'Future ISO timestamp' },
            durationMinutes: { type: 'integer', minimum: 1, example: 120, description: 'Duration in minutes' },
          },
        },
        response: {
          201: {
            type: 'object',
            properties: {
              message: { type: 'string', example: 'Reservation created and fully paid upfront. No cancellations allowed.' },
              reservation: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  station_id: { type: 'string', format: 'uuid' },
                  customer_id: { type: 'string', format: 'uuid' },
                  start_time: { type: 'string', format: 'date-time' },
                  end_time: { type: 'string', format: 'date-time' },
                  total_cost_millimes: { type: 'string', example: '10000' },
                  status: { type: 'string', example: 'CONFIRMED' },
                },
              },
              remainingBalanceMillimes: { type: 'string', example: '5000' },
            },
          },
          400: {
            type: 'object',
            properties: { error: { type: 'string', example: 'Insufficient wallet balance for upfront booking' } },
          },
          404: {
            type: 'object',
            properties: { error: { type: 'string', example: 'Tariff rate not found' } },
          },
          409: {
            type: 'object',
            properties: { error: { type: 'string', example: 'Station is already booked during this time slot' } },
          },
          500: {
            type: 'object',
            properties: { error: { type: 'string', example: 'Failed to complete upfront reservation' } },
          },
        },
      },
      preHandler: [fastify.authenticate],
    }, async (request, reply) => {
      const customerId = request.user.id;
      const { stationId, tariffId, startTime, durationMinutes } = request.body || {};
  
      if (!stationId || !tariffId || !startTime || !durationMinutes) {
        return reply.code(400).send({ 
          error: 'stationId, tariffId, startTime, and durationMinutes are required' 
        });
      }
  
      const start = new Date(startTime);
      const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
  
      if (start <= new Date()) {
        return reply.code(400).send({ error: 'Reservation start time must be in the future' });
      }
  
      const client = await fastify.pg.connect();
  
      try {
        await client.query('BEGIN');
  
        const tariffRes = await client.query(
          `SELECT price_per_unit_millimes, unit_seconds, rounding_rule, minimum_charge_millimes 
           FROM tariffs WHERE id = $1`,
          [tariffId]
        );
  
        if (tariffRes.rows.length === 0) {
          await client.query('ROLLBACK');
          return reply.code(404).send({ error: 'Tariff rate not found' });
        }
  
        const tariff = tariffRes.rows[0];
        const elapsedSeconds = durationMinutes * 60;
        const unitSeconds = parseInt(tariff.unit_seconds, 10) || 3600;
        const pricePerUnit = BigInt(tariff.price_per_unit_millimes);
        const minCharge = BigInt(tariff.minimum_charge_millimes || 0);
  
        const rawUnits = elapsedSeconds / unitSeconds;
        const rule = (tariff.rounding_rule || 'EXACT').toUpperCase();
        let rawCost;
  
        if (rule === 'EXACT') {
          rawCost = (BigInt(elapsedSeconds) * pricePerUnit) / BigInt(unitSeconds);
        } else {
          let roundedUnits = rule === 'NEAREST' ? Math.round(rawUnits) : Math.ceil(rawUnits);
          rawCost = BigInt(roundedUnits) * pricePerUnit;
        }
  
        const totalCostMillimes = rawCost > minCharge ? rawCost : minCharge;
  
        const overlapCheck = await client.query(
          `SELECT id FROM reservations
           WHERE station_id = $1 
             AND status IN ('CONFIRMED', 'CHECKED_IN')
             AND tsrange(start_time, end_time) && tsrange($2::timestamptz, $3::timestamptz)
           FOR UPDATE`,
          [stationId, start.toISOString(), end.toISOString()]
        );
  
        if (overlapCheck.rows.length > 0) {
          await client.query('ROLLBACK');
          return reply.code(409).send({ error: 'Station is already booked during this time slot' });
        }
  
        // Upfront Wallet Deduction
        const walletRes = await client.query(
          `UPDATE wallets 
           SET balance_millimes = balance_millimes - $1,
               updated_at = CURRENT_TIMESTAMP
           WHERE user_id = $2 AND balance_millimes >= $1
           RETURNING balance_millimes`,
          [totalCostMillimes.toString(), customerId]
        );
  
        if (walletRes.rows.length === 0) {
          await client.query('ROLLBACK');
          return reply.code(400).send({ error: 'Insufficient wallet balance for upfront booking' });
        }
  
        const reservationRes = await client.query(
          `INSERT INTO reservations (station_id, customer_id, tariff_id, start_time, end_time, total_cost_millimes, status)
           VALUES ($1, $2, $3, $4, $5, $6, 'CONFIRMED')
           RETURNING id, station_id, customer_id, start_time, end_time, total_cost_millimes, status`,
          [stationId, customerId, tariffId, start.toISOString(), end.toISOString(), totalCostMillimes.toString()]
        );
  
        await client.query('COMMIT');
  
        return reply.code(201).send({
          message: 'Reservation created and fully paid upfront. No cancellations allowed.',
          reservation: reservationRes.rows[0],
          remainingBalanceMillimes: walletRes.rows[0].balance_millimes,
        });
  
      } catch (err) {
        await client.query('ROLLBACK');
        request.log.error(err);
        return reply.code(500).send({ error: 'Failed to complete upfront reservation' });
      } finally {
        client.release();
      }
    });
  

    fastify.post('/:id/check-in', {
      schema: {
        summary: 'Check in to reservation',
        description: 'Converts a confirmed upfront reservation into an active workstation gaming session and issues a WebSocket start signal.',
        tags: ['Reservations'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid', description: 'Target reservation UUID' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              message: { type: 'string', example: 'Reservation converted to active session successfully' },
              session: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  station_id: { type: 'string', format: 'uuid' },
                  customer_id: { type: 'string', format: 'uuid' },
                  tariff_id: { type: 'string', format: 'uuid' },
                  status: { type: 'string', example: 'ACTIVE' },
                  opened_at: { type: 'string', format: 'date-time' },
                  version: { type: 'integer', example: 1 },
                },
              },
              delivered: { type: 'boolean', example: true },
            },
          },
          403: {
            type: 'object',
            properties: { error: { type: 'string', example: 'Forbidden: You can only check in to your own reservation' } },
          },
          404: {
            type: 'object',
            properties: { error: { type: 'string', example: 'Valid confirmed reservation not found' } },
          },
          409: {
            type: 'object',
            properties: { error: { type: 'string', example: 'Station currently has an active session' } },
          },
          500: {
            type: 'object',
            properties: { error: { type: 'string', example: 'Failed to convert reservation to active session' } },
          },
        },
      },
      preHandler: [fastify.authenticate],
    }, async (request, reply) => {
      const reservationId = request.params.id;
      const customerId = request.user.id;
  
      const client = await fastify.pg.connect();
  
      try {
        await client.query('BEGIN');
  
        const resResult = await client.query(
          `SELECT id, station_id, customer_id, tariff_id, start_time, end_time, status
           FROM reservations 
           WHERE id = $1 AND status = 'CONFIRMED'
           FOR UPDATE`,
          [reservationId]
        );
  
        if (resResult.rows.length === 0) {
          await client.query('ROLLBACK');
          return reply.code(404).send({ error: 'Valid confirmed reservation not found' });
        }
  
        const reservation = resResult.rows[0];
  
        if (request.user.role !== 'ADMIN' && reservation.customer_id !== customerId) {
          await client.query('ROLLBACK');
          return reply.code(403).send({ error: 'Forbidden: You can only check in to your own reservation' });
        }
  
        await client.query(
          `UPDATE reservations SET status = 'CHECKED_IN' WHERE id = $1`,
          [reservationId]
        );
  
        const sessionRes = await client.query(
          `INSERT INTO sessions (station_id, customer_id, tariff_id, reservation_id, status, opened_at)
           VALUES ($1, $2, $3, $4, 'ACTIVE', CURRENT_TIMESTAMP)
           RETURNING id, station_id, customer_id, tariff_id, status, opened_at, version`,
          [reservation.station_id, reservation.customer_id, reservation.tariff_id, reservationId]
        );
  
        const session = sessionRes.rows[0];
  
        await client.query(
          `UPDATE stations SET status = 'OCCUPIED' WHERE id = $1`,
          [reservation.station_id]
        );
  
        await client.query(
          `INSERT INTO session_events (session_id, type, actor, payload)
           VALUES ($1, 'SESSION_STARTED', 'GAMER', $2)`,
          [session.id, JSON.stringify({ reservationId, prepaidEndTime: reservation.end_time })]
        );
  
        await client.query('COMMIT');
  
        // Send WebSocket START signal to PC workstation agent
        const delivered = fastify.sendToStation(reservation.station_id, 'SESSION_COMMAND', {
          action: 'START',
          sessionId: session.id,
          prepaidEndTime: reservation.end_time,
        });
  
        return reply.send({
          message: 'Reservation converted to active session successfully',
          session,
          delivered,
        });
  
      } catch (err) {
        await client.query('ROLLBACK');
        
        if (err.code === '23505') {
          return reply.code(409).send({ error: 'Station currently has an active session' });
        }
  
        request.log.error(err);
        return reply.code(500).send({ error: 'Failed to convert reservation to active session' });
      } finally {
        client.release();
      }
    });
  }
  
  module.exports = reservationRoutes;