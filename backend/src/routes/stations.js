async function stationRoutes(fastify, opts) {
    fastify.post('/:stationId/session-command', {
        schema: {
        summary: 'Send Remote Command to Station Agent',
        description: 'Dispatches a remote control command to a workstation agent over WebSocket and syncs DB state. Admin only.',
        tags: ['Stations'],
        security: [{ bearerAuth: [] }],
        params: {
            type: 'object',
            required: ['stationId'],
            properties: {
            stationId: { type: 'string', format: 'uuid', description: 'Target workstation UUID' },
            },
        },
        body: {
            type: 'object',
            required: ['action'],
            properties: {
            action: {
                type: 'string',
                enum: ['START', 'PAUSE', 'LOCK', 'UNLOCK'],
                description: 'Control command action',
            },
            sessionId: {
                type: 'string',
                format: 'uuid',
                nullable: true,
                description: 'Optional target session UUID',
            },
            },
        },
        response: {
            200: {
            type: 'object',
            properties: {
                delivered: { type: 'boolean' },
                stationId: { type: 'string', format: 'uuid' },
                type: { type: 'string' },
                action: { type: 'string' },
                stationStatus: { type: 'string' },
            },
            },
            404: { type: 'object', properties: { error: { type: 'string' } } },
            500: { type: 'object', properties: { error: { type: 'string' } } },
        },
        },
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
            `SELECT s.id, s.status, u.wallet_balance
            FROM sessions s
            LEFT JOIN users u ON s.customer_id = u.id
            WHERE ${sessionId ? 's.id = $1' : 's.station_id = $1 AND s.status IN (\'ACTIVE\', \'PAUSED\')'}
            ORDER BY s.opened_at DESC LIMIT 1 FOR UPDATE`
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
            `UPDATE stations SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
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
            action,
            ...(targetSessionId ? { sessionId: targetSessionId } : {}),
            ...(activeSession?.wallet_balance !== undefined ? { walletBalance: String(activeSession.wallet_balance) } : {}),
        };
    
        const delivered = fastify.sendToStation(stationId, 'SESSION_COMMAND', wsPayload);
    
        return reply.send({
            delivered,
            stationId,
            type: 'SESSION_COMMAND',
            action,
            stationStatus: newStationStatus,
        });
    
        } catch (error) {
        await client.query('ROLLBACK');
        request.log.error(error);
        return reply.code(500).send({ error: error.message || 'Failed to dispatch station command' });
        } finally {
        client.release();
        }
    });
}

module.exports = stationRoutes;