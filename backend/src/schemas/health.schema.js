const healthCheckSchema = {
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
};

module.exports = {
    healthCheckSchema,
};
