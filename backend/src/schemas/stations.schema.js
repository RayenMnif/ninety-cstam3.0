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
const getStationsSchema = {
  description: 'Retrieve all gaming stations with optional status filtering',
  tags: ['Stations'],
  summary: 'Get all stations',
  querystring: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        enum: ['OFFLINE', 'AVAILABLE', 'OCCUPIED', 'MAINTENANCE'],
        description: 'Filter stations by operational status',
      },
    },
  },
  response: {
    200: {
      description: 'List of stations returned successfully',
      type: 'object',
      required: ['count', 'stations'],
      properties: {
        count: { 
          type: 'integer', 
          example: 12 
        },
        stations: {
          type: 'array',
          items: {
            type: 'object',
            required: ['id', 'hostname', 'ip_address', 'mac_address', 'status'],
            properties: {
              id: { 
                type: 'string', 
                format: 'uuid', 
                example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' 
              },
              hostname: { 
                type: 'string', 
                example: 'VIP-PC-01' 
              },
              ip_address: { 
                type: 'string', 
                example: '192.168.1.50' 
              },
              mac_address: { 
                type: 'string', 
                example: '00:1A:2B:3C:4D:5E' 
              },
              status: { 
                type: 'string', 
                enum: ['OFFLINE', 'AVAILABLE', 'OCCUPIED', 'MAINTENANCE'], 
                example: 'AVAILABLE' 
              },
            },
          },
        },
      },
    },
    500: {
      description: 'Internal server error',
      type: 'object',
      properties: {
        error: { type: 'string', example: 'Failed to fetch stations' },
      },
    },
  },
};
module.exports = {
    stationCommandSchema,
    getStationsSchema,
};
