const stationCommandSchema = {
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
};

module.exports = {
    stationCommandSchema,
};
