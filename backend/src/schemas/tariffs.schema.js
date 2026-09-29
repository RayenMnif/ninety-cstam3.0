const getTariffsSchema = {
  tags: ['tariff'],
  summary: 'List currently valid tariffs',
  security: [{ bearerAuth: [] }],
  response: {
    200: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        tariffs: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              name: { type: 'string' },
              price_per_unit_millimes: { type: 'integer' },
              unit_seconds: { type: 'integer' },
              rounding_rule: { type: 'string' },
              minimum_charge_millimes: { type: 'integer' },
              valid_from: { type: 'string' },
              valid_to: { type: 'string', nullable: true },
            },
          },
        },
      },
    },
  },
};

const addTariffSchema = {
  tags: ['tariff'],
  summary: 'Add a new tariff',
  security: [{ bearerAuth: [] }],
  body: {
    type: 'object',
    required: ['name', 'pricePerUnitMillimes'], // 👈 Require name explicitly
    properties: {
      name: { 
        type: 'string', 
        example: 'Standard Tariff' 
      },
      pricePerUnitMillimes: { type: 'integer', example: 5000 },
      unitSeconds: { type: 'integer', default: 3600 },
      roundingRule: { 
        type: 'string', 
        enum: ['UP', 'NEAREST', 'EXACT'], 
        default: 'EXACT' 
      },
      minimumChargeMillimes: { type: 'integer', default: 0 },
    },
  },
};

const removeTariffSchema = {
  tags: ['tariff'],
  summary: 'Deactivate tariff by ID',
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string', format: 'uuid' },
    },
  },
};

module.exports = {
  getTariffsSchema,
  addTariffSchema,
  removeTariffSchema,
};