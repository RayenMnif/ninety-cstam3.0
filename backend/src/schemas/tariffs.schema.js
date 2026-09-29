const getTariffsSchema = {
  tags: ['tariffs'],
  summary: 'List currently valid tariffs',
};

const addTariffSchema = {
  tags: ['tariffs'],
  summary: 'Create Standard, VIP (x2) and Night (x3) tariffs from one base price (admin)',
  security: [{ bearerAuth: [] }],
  body: {
    type: 'object',
    required: ['pricePerUnitMillimes'],
    additionalProperties: false,
    properties: {
      pricePerUnitMillimes: { type: 'integer', minimum: 1 },
      roundingRule: { type: 'string', enum: ['UP', 'NEAREST', 'EXACT'] },
      minimumChargeMillimes: { type: 'integer', minimum: 0 },
    },
  },
};

const removeTariffSchema = {
  tags: ['tariffs'],
  summary: 'Deactivate Standard, VIP, and Night tariffs by base price (admin)',
  security: [{ bearerAuth: [] }],
  body: {
    type: 'object',
    required: ['pricePerUnitMillimes'],
    additionalProperties: false,
    properties: {
      pricePerUnitMillimes: { type: 'integer', minimum: 1 },
    },
  },
};

module.exports = { getTariffsSchema, addTariffSchema, removeTariffSchema };