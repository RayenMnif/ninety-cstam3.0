const tierProperties = {
  id: { type: 'string', format: 'uuid' },
  name: { type: 'string', minLength: 2, maxLength: 50 },
  price_millimes: { type: ['integer', 'string'] },
  duration_days: { type: 'integer', minimum: 1 },
  discount_percentage: { type: 'integer', minimum: 0, maximum: 100 },
  valid_from: { type: 'string' },
  valid_to: { type: ['string', 'null'], format: 'date-time', nullable: true, example: null }
};

const subscriptionProperties = {
  id: { type: 'string', format: 'uuid' },
  user_id: { type: 'string', format: 'uuid' },
  tier_id: { type: 'string', format: 'uuid' },
  starts_at: { type: 'string' },
  expires_at: { type: 'string' },
  auto_renew: { type: 'boolean' },
  status: { type: 'string', enum: ['ACTIVE', 'EXPIRED', 'CANCELLED'] }
};

const errorResponse = {
  type: 'object',
  properties: {
    error: { type: 'string' },
    details: { type: 'string' }
  }
};

const authHeader = {
  type: 'object',
  properties: {
    authorization: {
      type: 'string',
      description: 'Format: Bearer <your_jwt_token>'
    }
  }
};

const createTierSchema = {
  tags: ['Membership'],
  summary: 'Create a new membership tier (Admin Only)',
  security: [{ bearerAuth: [] }],
  headers: authHeader,
  body: {
    type: 'object',
    required: ['name', 'price_millimes', 'duration_days'],
    properties: {
      name: tierProperties.name,
      price_millimes: { type: 'integer', minimum: 0 },
      duration_days: { ...tierProperties.duration_days, default: 30 },
      discount_percentage: { ...tierProperties.discount_percentage, default: 0 },
      valid_to: tierProperties.valid_to
    }
  },
  response: {
    201: { type: 'object', properties: tierProperties },
    401: errorResponse,
    403: errorResponse,
    500: errorResponse
  }
};

const getTiersSchema = {
  tags: ['Membership'],
  summary: 'List available active membership tiers',
  response: {
    200: {
      type: 'array',
      items: { type: 'object', properties: tierProperties }
    },
    404: errorResponse,
    500: errorResponse
  }
};

const getTierByIdSchema = {
  tags: ['Membership'],
  summary: 'Get a single membership plan by ID',
  params: {
    type: 'object',
    required: ['id'],
    properties: { id: { type: 'string', format: 'uuid' } }
  },
  response: {
    200: { type: 'object', properties: tierProperties },
    404: errorResponse,
    500: errorResponse
  }
};

const stopTierSchema = {
  tags: ['Membership'],
  summary: 'Stop/deactivate a membership tier by ID (Admin Only)',
  security: [{ bearerAuth: [] }],
  headers: authHeader,
  params: {
    type: 'object',
    required: ['id'],
    properties: { id: { type: 'string', format: 'uuid' } }
  },
  response: {
    200: {
      type: 'object',
      properties: { 
        message: { type: 'string' },
        tier: { type: 'object', properties: tierProperties }
      }
    },
    400: errorResponse,
    401: errorResponse,
    403: errorResponse,
    404: errorResponse,
    500: errorResponse
  }
};

const subscribeSchema = {
  tags: ['Membership'],
  summary: 'Purchase a membership tier using wallet balance',
  security: [{ bearerAuth: [] }],
  headers: authHeader,
  body: {
    type: 'object',
    required: ['tier_id'],
    properties: {
      tier_id: { type: 'string', format: 'uuid' },
      auto_renew: { type: 'boolean', default: false }
    }
  },
  response: {
    201: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        subscription: { type: 'object', properties: subscriptionProperties }
      }
    },
    400: errorResponse,
    401: errorResponse,
    404: errorResponse,
    500: errorResponse
  }
};

const getMyMembershipSchema = {
  tags: ['Membership'],
  summary: 'Get current user active membership status',
  security: [{ bearerAuth: [] }],
  headers: authHeader,
  response: {
    200: {
      type: 'object',
      properties: {
        has_active_membership: { type: 'boolean' },
        subscription: {
          type: ['object', 'null'],
          properties: {
            ...subscriptionProperties,
            tier_name: { type: 'string' },
            discount_percentage: { type: 'integer' }
          }
        }
      }
    },
    401: errorResponse,
    500: errorResponse
  }
};

const cancelSubscriptionSchema = {
  tags: ['Membership'],
  summary: 'Cancel auto-renewal for active membership',
  security: [{ bearerAuth: [] }],
  headers: authHeader,
  response: {
    200: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        subscription: { type: 'object', properties: subscriptionProperties }
      }
    },
    401: errorResponse,
    404: errorResponse,
    500: errorResponse
  }
};

module.exports = {
  createTierSchema,
  getTiersSchema,
  getTierByIdSchema,
  stopTierSchema,
  subscribeSchema,
  getMyMembershipSchema,
  cancelSubscriptionSchema
};