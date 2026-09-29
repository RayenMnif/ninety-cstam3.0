const registerAgentSchema = {
  tags: ['Agent'],
  summary: 'Register or reconnect a station agent',
  description: 'Registers a C# client station using its MAC address, updates IP/Hostname, and returns the station ID.',
  body: {
    type: 'object',
    required: ['macAddress'],
    properties: {
      hostname: { 
        type: 'string', 
        description: 'Computer name of the client PC',
        example: 'DESKTOP-5BJFPDI' 
      },
      ipAddress: { 
        type: 'string', 
        description: 'Local IP address of the client PC',
        example: '192.168.1.50' 
      },
      macAddress: { 
        type: 'string', 
        description: 'Physical MAC address of the network interface',
        example: 'AA:BB:CC:DD:EE:FF' 
      }
    }
  },
  response: {
    200: {
      description: 'Station registered successfully',
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        stationId: { 
          type: 'string', 
          format: 'uuid', 
          example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' 
        },
        status: { 
          type: 'string', 
          enum: ['OFFLINE', 'AVAILABLE', 'OCCUPIED', 'MAINTENANCE'],
          example: 'AVAILABLE' 
        }
      }
    },
    400: {
      description: 'Bad Request - Missing required parameters',
      type: 'object',
      properties: {
        error: { type: 'string', example: 'MAC address is required' }
      }
    },
    500: {
      description: 'Internal Server Error',
      type: 'object',
      properties: {
        error: { type: 'string', example: 'Failed to identify station' }
      }
    }
  }
};

module.exports = { registerAgentSchema };