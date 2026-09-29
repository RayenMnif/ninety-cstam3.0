const {
  getTariffsSchema,
  addTariffSchema,
  removeTariffSchema,
} = require('../schemas/tariffs.schema');

async function tariffRoutes(fastify, opts) {
  // Prehandler hook: strict input validation for tariff price
  const validateTariffInput = async (request, reply) => {
    const { pricePerUnitMillimes } = request.body || {};
    const parsedPrice = Number(pricePerUnitMillimes);

    if (
      pricePerUnitMillimes === undefined ||
      pricePerUnitMillimes === null ||
      pricePerUnitMillimes === '' ||
      typeof pricePerUnitMillimes === 'string' ||
      isNaN(parsedPrice) ||
      !Number.isInteger(parsedPrice) ||
      parsedPrice <= 0
    ) {
      return reply.code(400).send({
        error:
          'Invalid price: pricePerUnitMillimes must be a positive integer (in millimes) and cannot be empty or a string.',
      });
    }
  };

  // 1. GET /api/tariff/ — List active tariffs
  fastify.get('/', {
    schema: getTariffsSchema,
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    try {
      const result = await fastify.pg.query(
        `SELECT id, name, price_per_unit_millimes, unit_seconds, rounding_rule, minimum_charge_millimes, valid_from, valid_to
         FROM tariffs
         WHERE valid_to IS NULL OR valid_to > NOW()
         ORDER BY valid_from DESC`
      );

      if (result.rowCount === 0) {
        return reply.send({
          message: 'No active tariffs found.',
          tariffs: [],
        });
      }

      return reply.send({ tariffs: result.rows });
    } catch (err) {
      request.log.error(err);
      return reply.code(500).send({ error: 'Failed to fetch tariffs', details: err.message });
    }
  });

  // 2. POST /api/tariff/add — Create tariff
  fastify.post('/add', {
    schema: addTariffSchema,
    preHandler: [
      fastify.authenticate,
      fastify.adminOnly,
      validateTariffInput,
    ],
  }, async (request, reply) => {
    const {
      name, // 👈 Required field received directly from request body
      pricePerUnitMillimes,
      unitSeconds = 3600,
      roundingRule = 'EXACT',
      minimumChargeMillimes = 0,
    } = request.body;

    try {
      const result = await fastify.pg.query(
        `INSERT INTO tariffs (name, price_per_unit_millimes, unit_seconds, rounding_rule, minimum_charge_millimes)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, name, price_per_unit_millimes, unit_seconds, rounding_rule, minimum_charge_millimes, valid_from`,
        [name, pricePerUnitMillimes, unitSeconds, roundingRule, minimumChargeMillimes]
      );

      return reply.code(201).send({
        message: 'Tariff created successfully',
        tariff: result.rows[0],
      });
    } catch (err) {
      request.log.error(err);
      return reply.code(500).send({ error: 'Failed to add tariff', details: err.message });
    }
  });

  // 3. POST /api/tariff/remove/:id — Deactivate tariff by setting valid_to
  fastify.post('/remove/:id', {
    schema: removeTariffSchema,
    preHandler: [fastify.authenticate, fastify.adminOnly],
  }, async (request, reply) => {
    const { id } = request.params;

    try {
      const result = await fastify.pg.query(
        `UPDATE tariffs
         SET valid_to = CURRENT_TIMESTAMP
         WHERE id = $1 AND (valid_to IS NULL OR valid_to > NOW())
         RETURNING id, name, valid_to`,
        [id]
      );

      if (result.rowCount === 0) {
        return reply.code(404).send({ error: 'Tariff not found or already deactivated' });
      }

      return reply.send({
        message: 'Tariff deactivated successfully',
        tariff: result.rows[0],
      });
    } catch (err) {
      request.log.error(err);
      return reply.code(500).send({ error: 'Failed to deactivate tariff', details: err.message });
    }
  });
}

module.exports = tariffRoutes;