const { stationCommandSchema , getStationsSchema} = require('../schemas/stations.schema');

async function stationRoutes(fastify, opts) {
    fastify.post('/:stationId/session-command', {
        schema: stationCommandSchema,
        preHandler: [fastify.authenticate, fastify.adminOnly],
    }, async (request, reply) => {
        const { stationId } = request.params;
        const { action, sessionId = null } = request.body || {};
    
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
    
        const currentStationStatus = stationRes.rows[0].status;
    
        const sessionRes = await client.query(
            `SELECT s.id, s.status, w.balance_millimes
            FROM sessions s
            INNER JOIN wallets w ON s.customer_id = w.user_id
            WHERE ${sessionId ? 's.id = $1' : 's.station_id = $1 AND s.status IN (\'ACTIVE\', \'PAUSED\')'}
            ORDER BY s.opened_at DESC LIMIT 1 FOR UPDATE`,
            [sessionId || stationId]
        );
    
        const activeSession = sessionRes.rows[0] || null;
        const targetSessionId = activeSession?.id || null;
    
        let newStationStatus = currentStationStatus;
        let eventType;

        switch (action) {
            case 'PAUSE':
            case 'LOCK':
            eventType = 'SESSION_PAUSED';
            if (targetSessionId) {
                await client.query(
                `UPDATE sessions SET status = 'PAUSED', version = version + 1 WHERE id = $1 AND status = 'ACTIVE'`,
                [targetSessionId]
                );
                newStationStatus = 'OCCUPIED';
            } else {
                newStationStatus = 'MAINTENANCE';
            }
            break;
    
            case 'UNLOCK':
            eventType = 'SESSION_RESUMED';
            if (targetSessionId) {
                await client.query(
                `UPDATE sessions SET status = 'ACTIVE', version = version + 1 WHERE id = $1 AND status = 'PAUSED'`,
                [targetSessionId]
                );
                newStationStatus = 'OCCUPIED';
            } else {
                newStationStatus = 'AVAILABLE';
            }
            break;
    
            case 'START':
            if (targetSessionId) {
                await client.query(
                `UPDATE sessions SET status = 'ACTIVE', version = version + 1 WHERE id = $1`,
                [targetSessionId]
                );
            }
            newStationStatus = 'OCCUPIED';
            break;
        }
    
        if (newStationStatus !== currentStationStatus) {
    await client.query(
    `UPDATE stations SET status = $1 WHERE id = $2`,
    [newStationStatus, stationId]
    );
            }
    
        if (targetSessionId && action != 'START') {
            await client.query(
            `INSERT INTO session_events (session_id, type, actor, payload)
            VALUES ($1, $2, 'ADMIN', $3)`,
            [targetSessionId, eventType, { action }]
            );
        }
    
        await client.query('COMMIT');
    
        const wsPayload = {
            Action: action,
            action: action,
            ...(sessionId ? { SessionId: sessionId, sessionId: sessionId } : {}),
            State: action === 'UNLOCK' || action === 'START' ? 'ACTIVE_SESSION' : 'LOCKED_IDLE',
            state: action === 'UNLOCK' || action === 'START' ? 'ACTIVE_SESSION' : 'LOCKED_IDLE',
        };
        const delivered = fastify.sendToStation(stationId, 'SESSION_COMMAND', wsPayload);
    
        return reply.send({
            delivered,
            stationId,
            type: 'SESSION_COMMAND',
            action,
            stationStatus: delivered ? 'UPDATED' : 'OFFLINE',
        });
    
        } catch (error) {
        await client.query('ROLLBACK');
        request.log.error(error);
        return reply.code(500).send({ error: error.message || 'Failed to dispatch station command' });
        } finally {
        client.release();
        }
    });
    fastify.get('/stations', {
        schema : getStationsSchema,
}, async (request, reply) => {
  const { status } = request.query || {};

  try {
    let query = `
      SELECT 
        id, 
        hostname, 
        ip_address, 
        mac_address, 
        status 
      FROM stations
    `;
    const queryParams = [];

    if (status) {
      query += ` WHERE status = $1`;
      queryParams.push(status.toUpperCase());
    }

    query += ` ORDER BY hostname ASC`;

    const { rows } = await fastify.pg.query(query, queryParams);

    return reply.send({
      count: rows.length,
      stations: rows,
    });
  } catch (error) {
    request.log.error(error);
    return reply.code(500).send({ error: 'Failed to fetch stations' });
  }
});
 
}

module.exports = stationRoutes;