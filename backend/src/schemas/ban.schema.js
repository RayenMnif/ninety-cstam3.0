const banUserSchema = {
  tags: ['admin'],
  summary: 'Ban a user by ID',
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string', format: 'uuid' },
    },
  },
};

const unbanUserSchema = {
  tags: ['admin'],
  summary: 'Unban a user by ID',
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string', format: 'uuid' },
    },
  },
};

const getBannedUsersSchema = {
  tags: ['admin'],
  summary: 'List all currently banned users',
  security: [{ bearerAuth: [] }],
};

module.exports = {
  banUserSchema,
  unbanUserSchema,
  getBannedUsersSchema,
};