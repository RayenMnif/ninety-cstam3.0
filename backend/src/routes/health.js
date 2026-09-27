async function healthRoutes(fastify, opts){
    fastify.get('/health', {
        schema: {
            summary: 'Service Health Check',
            description: 'Pings PostgreSQL and Redis backends to verify service health and operational status.',
            tags: ['Health'],
            response: {
                200: {
                    description: 'All services are healthy and operational.',
                    type: 'object',
                    properties: {
                        status: { type: 'string', example: 'ok' },
                        postgres: { type: 'string', example: 'up' },
                        redis: { type: 'string', example: 'up' },
                        timestamp: { type: 'string', format: 'date-time', example: '2026-09-27T10:00:00.000Z' },
                    },
                },
                503: {
                    description: 'One or more subsystem dependencies are down or degraded.',
                    type: 'object',
                    properties: {
                        status: { type: 'string', example: 'degraded' },
                        postgres: { type: 'string', example: 'up' },
                        redis: { type: 'string', example: 'down' },
                        timestamp: { type: 'string', format: 'date-time', example: '2026-09-27T10:00:00.000Z' },
                    },
                },
                500: {
                    description: 'Internal Server Error.',
                    type: 'object',
                    properties: {
                        error: { type: 'string', example: 'Internal Server Error' },
                        message: { type: 'string', example: 'Health check probe failed' },
                        statusCode: { type: 'integer', example: 500 },
                    },
                },
            },
        },
    }, async (request, reply) => {
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