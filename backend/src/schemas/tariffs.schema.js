const getTariffsSchema = {
  tags: ['tariffs'],
  summary: 'List currently valid tariffs',
};

const addTariffSchema = {
  tags: ['tariffs'],
  summary: 'Create a tariff (admin)',
  body: {
    type: 'object',
    required: ['name', 'pricePerUnitMillimes'],
    additionalProperties: false,
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 50 },
      pricePerUnitMillimes: { type: 'integer', minimum: 1 },
      unitSeconds: { type: 'integer', minimum: 1 },
      roundingRule: { type: 'string', enum: ['UP', 'NEAREST', 'EXACT'] },
      minimumChargeMillimes: { type: 'integer', minimum: 0 },
    },
  },
};

const removeTariffSchema = {
  tags: ['tariffs'],
  summary: 'End a tariff (admin)',
  body: {
    type: 'object',
    required: ['id'],
    additionalProperties: false,
    properties: { id: { type: 'string', format: 'uuid' } },
  },
};

module.exports = { getTariffsSchema, addTariffSchema, removeTariffSchema };