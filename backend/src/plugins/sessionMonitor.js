// redis TTL session monitor plugin
// listens for redis key expiration events and atomically terminates expired sessions in PostgreSQL.
async function sessionMonitor(fastify) {
    try {
      await fastify.redis.config('SET', 'notify-keyspace-events', 'Ex');
    } catch (err) {
      fastify.log.warn('[SessionMonitor] Could not run CONFIG SET on Redis. Ensure notify-keyspace-events contains "Ex" in redis.conf');
    }
  
    const redisSub = fastify.redis.duplicate();
  
    const handleSessionExpiration = async (sessionId) => {
      const client = await fastify.pg.connect();
  
      try {
        await client.query('BEGIN');
  
        const sessionRes = await client.query(
          `SELECT s.id, s.station_id, s.status 
           FROM sessions s 
           WHERE s.id = $1 AND s.status = 'ACTIVE' 
           FOR UPDATE`,
          [sessionId]
        );
  
        if (sessionRes.rows.length === 0) {
          await client.query('ROLLBACK');
          return;
        }
  
        const { station_id: stationId } = sessionRes.rows[0];
  
        await client.query(
          `UPDATE sessions 
           SET status = 'CLOSED', closed_at = CURRENT_TIMESTAMP, version = version + 1 
           WHERE id = $1`,
          [sessionId]
        );
  
        await client.query(
          `UPDATE stations 
           SET status = 'AVAILABLE', updated_at = CURRENT_TIMESTAMP 
           WHERE id = $1`,
          [stationId]
        );
  
        await client.query(
          `INSERT INTO session_events (session_id, type, actor, payload)
           VALUES ($1, 'SESSION_ENDED', 'SYSTEM', $2)`,
          [sessionId, { reason: 'Prepaid time limit reached (Redis TTL)', autoClosed: true }]
        );
  
        await client.query('COMMIT');
  
        // Dispatch WebSocket hard lock command to workstation agent
        fastify.sendToStation(stationId, 'SESSION_COMMAND', {
          action: 'LOCK',
          sessionId,
          reason: 'TIME_EXPIRED',
        });
  
        fastify.log.info(`[SessionMonitor] Expired session ${sessionId} on station ${stationId}`);
  
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        fastify.log.error(`[SessionMonitor] Failed to expire session ${sessionId}:`, err);
      } finally {
        client.release();
      }
    };
  
    await redisSub.psubscribe('__keyevent@*__:expired');
  
    redisSub.on('pmessage', async (pattern, channel, expiredKey) => {
      if (expiredKey.startsWith('session:expiry:')) {
        const sessionId = expiredKey.replace('session:expiry:', '');
        fastify.log.info(`[SessionMonitor] Redis TTL triggered for session: ${sessionId}`);
        await handleSessionExpiration(sessionId);
      }
    });
  
    const catchupOverdueSessions = async () => {
      const client = await fastify.pg.connect();
      try {
        const overdueRes = await client.query(
          `SELECT s.id 
           FROM sessions s
           JOIN reservations r ON s.reservation_id = r.id
           WHERE s.status = 'ACTIVE' AND r.end_time <= CURRENT_TIMESTAMP`
        );
  
        for (const row of overdueRes.rows) {
          fastify.log.warn(`[SessionMonitor] Catch-up closing overdue session: ${row.id}`);
          await handleSessionExpiration(row.id);
        }
      } catch (err) {
        fastify.log.error('[SessionMonitor] Startup catch-up failed:', err);
      } finally {
        client.release();
      }
    };
  
    await catchupOverdueSessions();
  
    fastify.addHook('onClose', async () => {
      await redisSub.quit();
    });
  }
  
  module.exports = sessionMonitor;