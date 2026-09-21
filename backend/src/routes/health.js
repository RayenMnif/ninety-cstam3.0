async function healthRoutes(fastify, opts){
    fastify.get('/health', async (request, reply) => {
        let pgStatus = 'down';
        let redisStatus = 'down';
        // check postgreSQL connection 
        try {
           const dbRes = await fastify.pg.query('SELECT 1 + 1 AS result');
           if (dbRes.rows[0].result === 2){
            pgStatus = 'up'; 
           }
        } catch (error) {
           fastify.log.error(error, 'PostgreSQL ping failed');
        }
        // check redis connection
        try {
        const ping = await fastify.redis.ping();
        if (ping === 'PONG'){
            redisStatus = 'up';
        }
        } catch (error) {
           fastify.log.error(err, 'Redis ping failed');
        }
        
        const isHealthy = (pgStatus === 'up') && (redisStatus === 'up');

        return reply.status(isHealthy ? 200 : 503).send({
            status: isHealthy ? 'ok' : 'degraded',
            postgres: pgStatus,
            redis: redisStatus, 
            timestamp: new Date().toISOString(),
        });
    });
}

module.exports = healthRoutes;