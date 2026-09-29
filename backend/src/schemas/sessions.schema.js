const startSessionSchema = {
  summary: 'Start Gaming Session',
  description: 'Initiates an active gaming session on a target workstation after checking wallet minimum balance.',
  tags: ['Sessions'],
  security: [{ bearerAuth: [] }],
  body: {
    type: 'object',
    required: ['stationId', 'tariffId'],
    properties: {
      stationId: { type: 'string', format: 'uuid', description: 'Target station UUID', examples: ['e3f4a5b6-c7d8-9e0f-1a2b-3c4d5e6f7a8b'] },
      tariffId: { type: 'string', format: 'uuid', description: 'Selected tariff rate UUID', examples: ['c1d2e3f4-a5b6-7c8d-9e0f-1a2b3c4d5e6f'] },
      customerId: { type: 'string', format: 'uuid', description: 'Target gamer UUID (Admin override only)', examples: ['a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d'] },
    },
  },
  response: {
    201: {
      description: 'Session started successfully.',
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Session started successfully' },
        session: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid', example: 'd4e5f6a7-b8c9-0d1e-2f3a-4b5c6d7e8f9a' },
            station_id: { type: 'string', format: 'uuid', example: 'e3f4a5b6-c7d8-9e0f-1a2b-3c4d5e6f7a8b' },
            customer_id: { type: 'string', format: 'uuid', example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d' },
            tariff_id: { type: 'string', format: 'uuid', example: 'c1d2e3f4-a5b6-7c8d-9e0f-1a2b3c4d5e6f' },
            status: { type: 'string', example: 'ACTIVE' },
            opened_at: { type: 'string', format: 'date-time', example: '2026-09-27T10:00:00.000Z' },
            version: { type: 'integer', example: 1 },
          },
        },
        walletBalanceMillimes: { type: 'string', example: '15000' },
        delivered: { type: 'boolean', example: true },
      },
    },
    400: {
      description: 'Validation error or insufficient wallet balance.',
      type: 'object',
      properties: {
        error: { type: 'string', example: 'Insufficient wallet balance.' },
        currentBalanceMillimes: { type: 'string', example: '1000' },
        requiredMinimumMillimes: { type: 'string', example: '5000' },
        message: { type: 'string', example: 'Validation error' },
        statusCode: { type: 'integer', example: 400 },
      },
    },
    401: {
      description: 'Unauthorized: Missing or invalid token.',
      type: 'object',
      properties: {
        error: { type: 'string', example: 'Unauthorized: Missing token header' },
      },
    },
    404: {
      description: 'Tariff rate or user wallet not found.',
      type: 'object',
      properties: {
        error: { type: 'string', example: 'Tariff rate not found' },
      },
    },
    409: {
      description: 'Station already has an active session.',
      type: 'object',
      properties: {
        error: { type: 'string', example: 'Station already has an active session' },
      },
    },
    500: {
      description: 'Failed to start session due to server error.',
      type: 'object',
      properties: {
        error: { type: 'string', example: 'Failed to start session due to server error' },
      },
    },
  },
};

const stopSessionSchema = {
  summary: 'Stop Gaming Session',
  description: 'Terminates an active or paused session, calculates charges for walk-in sessions (or 0 for prepaid reservations), deducts cost, marks station available, and locks workstation.',
  tags: ['Sessions'],
  security: [{ bearerAuth: [] }],
  body: {
    type: 'object',
    properties: {
      sessionId: { type: 'string', format: 'uuid', description: 'Session UUID (optional if stationId provided)' },
      stationId: { type: 'string', format: 'uuid', description: 'Station UUID (optional if sessionId provided)' },
    },
  },
  response: {
    200: {
      description: 'Session settled and closed successfully.',
      type: 'object',
      properties: {
        message: { type: 'string' },
        session: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            station_id: { type: 'string', format: 'uuid' },
            customer_id: { type: 'string', format: 'uuid' },
            status: { type: 'string' },
            opened_at: { type: 'string', format: 'date-time' },
            closed_at: { type: 'string', format: 'date-time' },
            version: { type: 'integer' },
          },
        },
        totalCostMillimes: { type: 'string' },
        remainingBalanceMillimes: { type: 'string', nullable: true },
        delivered: { type: 'boolean' },
      },
    },
    403: { type: 'object', properties: { error: { type: 'string' } } },
    404: { type: 'object', properties: { error: { type: 'string' } } },
    500: { type: 'object', properties: { error: { type: 'string' } } },
  },
};

const unlockSessionSchema = {
  summary: 'Unlock / Resume Gaming Session',
  description: 'Resumes a paused session back to ACTIVE, records an audit event, and signals the workstation agent to unlock.',
  tags: ['Sessions'],
  security: [{ bearerAuth: [] }],
  body: {
    type: 'object',
    properties: {
      sessionId: { type: 'string', format: 'uuid', description: 'Session UUID (optional if stationId provided)', examples: ['d4e5f6a7-b8c9-0d1e-2f3a-4b5c6d7e8f9a'] },
      stationId: { type: 'string', format: 'uuid', description: 'Station UUID (optional if sessionId provided)', examples: ['e3f4a5b6-c7d8-9e0f-1a2b-3c4d5e6f7a8b'] },
    },
  },
  response: {
    200: {
      description: 'Session unlocked and resumed successfully.',
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Session unlocked successfully' },
        session: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid', example: 'd4e5f6a7-b8c9-0d1e-2f3a-4b5c6d7e8f9a' },
            station_id: { type: 'string', format: 'uuid', example: 'e3f4a5b6-c7d8-9e0f-1a2b-3c4d5e6f7a8b' },
            customer_id: { type: 'string', format: 'uuid', example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d' },
            status: { type: 'string', example: 'ACTIVE' },
            version: { type: 'integer', example: 2 },
          },
        },
        delivered: { type: 'boolean', example: true },
      },
    },
    403: {
      description: 'Forbidden: Cannot unlock another user session.',
      type: 'object',
      properties: {
        error: { type: 'string', example: 'Forbidden: You can only unlock your own session' },
      },
    },
    404: {
      description: 'No paused session found to unlock.',
      type: 'object',
      properties: {
        error: { type: 'string', example: 'No paused session found to unlock' },
      },
    },
    500: {
      description: 'Failed to unlock session.',
      type: 'object',
      properties: {
        error: { type: 'string', example: 'Failed to unlock session' },
      },
    },
  },
};

const lockSessionSchema = {
  summary: 'Lock / Pause Gaming Session',
  description: 'Pauses an active session (status PAUSED), records an audit event, and dispatches a LOCK command to the desktop agent.',
  tags: ['Sessions'],
  security: [{ bearerAuth: [] }],
  body: {
    type: 'object',
    properties: {
      sessionId: { type: 'string', format: 'uuid', description: 'Session UUID (optional if stationId provided)', examples: ['d4e5f6a7-b8c9-0d1e-2f3a-4b5c6d7e8f9a'] },
      stationId: { type: 'string', format: 'uuid', description: 'Station UUID (optional if sessionId provided)', examples: ['e3f4a5b6-c7d8-9e0f-1a2b-3c4d5e6f7a8b'] },
    },
  },
  response: {
    200: {
      description: 'Session locked and paused successfully.',
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Session locked successfully' },
        session: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid', example: 'd4e5f6a7-b8c9-0d1e-2f3a-4b5c6d7e8f9a' },
            station_id: { type: 'string', format: 'uuid', example: 'e3f4a5b6-c7d8-9e0f-1a2b-3c4d5e6f7a8b' },
            customer_id: { type: 'string', format: 'uuid', example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d' },
            status: { type: 'string', example: 'PAUSED' },
            version: { type: 'integer', example: 2 },
          },
        },
        delivered: { type: 'boolean', example: true },
      },
    },
    400: {
      description: 'Validation error.',
      type: 'object',
      properties: {
        error: { type: 'string', example: 'Bad Request' },
        message: { type: 'string', example: 'Validation failed' },
        statusCode: { type: 'integer', example: 400 },
      },
    },
    401: {
      description: 'Unauthorized: Missing or invalid token.',
      type: 'object',
      properties: {
        error: { type: 'string', example: 'Unauthorized: Missing token header' },
      },
    },
    403: {
      description: 'Forbidden: Cannot lock another user session.',
      type: 'object',
      properties: {
        error: { type: 'string', example: 'Forbidden: You can only lock your own session' },
      },
    },
    404: {
      description: 'No active session found to lock.',
      type: 'object',
      properties: {
        error: { type: 'string', example: 'No active session found to lock' },
      },
    },
    500: {
      description: 'Failed to lock session.',
      type: 'object',
      properties: {
        error: { type: 'string', example: 'Failed to lock session' },
      },
    },
  },

};


const getSessionsSchema = {
  description: 'Retrieve a paginated list of all gaming sessions across the venue (Admin only)',
  tags: ['Sessions'],
  summary: 'Get all sessions',
  security: [{ bearerAuth: [] }],
  querystring: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        enum: ['PENDING', 'ACTIVE', 'PAUSED', 'COMPLETED', 'TERMINATED', 'CANCELLED'],
        description: 'Filter by session status',
      },
      stationId: { 
        type: 'string', 
        format: 'uuid', 
        description: 'Filter sessions by station UUID' 
      },
      customerId: { 
        type: 'string', 
        format: 'uuid', 
        description: 'Filter sessions by customer UUID' 
      },
      page: { 
        type: 'integer', 
        minimum: 1, 
        default: 1, 
        description: 'Page number' 
      },
      limit: { 
        type: 'integer', 
        minimum: 1, 
        maximum: 100, 
        default: 20, 
        description: 'Items per page' 
      },
    },
  },
    response: {
    200: {
      description: 'Paginated session history retrieved successfully',
      type: 'object',
      required: ['total', 'page', 'limit', 'sessions'],
      properties: {
        total: { type: 'integer', example: 42 },
        page: { type: 'integer', example: 1 },
        limit: { type: 'integer', example: 20 },
        sessions: {
          type: 'array',
          items: {
            type: 'object',
            required: ['id', 'station_id', 'customer_id', 'tariff_id', 'status', 'opened_at'],
            properties: {
              id: { type: 'string', format: 'uuid', example: 'd3b07384-d113-460e-4c80-411a76c09890' },
              station_id: { type: 'string', format: 'uuid', example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' },
              customer_id: { type: 'string', format: 'uuid', example: '7c9e6679-7425-40de-944b-e07fc1f90ae7' },
              tariff_id: { type: 'string', format: 'uuid', example: '8f3c21a4-9e8b-4c22-11ee-321156821211' },
              status: { type: 'string', example: 'ACTIVE' },
              opened_at: { type: 'string', format: 'date-time', example: '2026-09-29T18:00:00.000Z' },
              closed_at: { type: 'string', format: 'date-time', nullable: true, example: null },
              version: { type: 'integer', example: 1 },
              hostname: { type: 'string', nullable: true, example: 'VIP-PC-01' },
            },
          },
        },
      },
    },
    401: {
      description: 'Unauthorized (Missing or invalid JWT)',
      type: 'object',
      properties: { error: { type: 'string', example: 'Unauthorized' } },
    },
    403: {
      description: 'Forbidden (Admin role required)',
      type: 'object',
      properties: { error: { type: 'string', example: 'Admin privileges required' } },
    },
    500: {
      description: 'Server error',
      type: 'object',
      properties: { error: { type: 'string', example: 'Failed to fetch sessions' } },
    },
  },
};
module.exports = {
  startSessionSchema,
  stopSessionSchema,
  unlockSessionSchema,
  lockSessionSchema,
  getSessionsSchema,
};
