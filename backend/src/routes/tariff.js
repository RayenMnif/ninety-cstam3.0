const {
  getTariffsSchema,
  addTariffSchema,
  removeTariffSchema,
} = require('../schemas/tariffs.schema');
async function tariffRoutes(fastify, opts) {
  const requireAdmin = async (request, reply) => {
    if (request.user.role !== 'ADMIN') {
      return reply.code(403).send({ error: 'Forbidden: Admin access required' });
    }
  };

  fastify.get('/', {
    schema: getTariffsSchema,
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const res = await fastify.pg.query(
      `SELECT id, name, price_per_unit_millimes, unit_seconds, rounding_rule,
              minimum_charge_millimes, valid_from, valid_to
       FROM tariffs
       WHERE valid_from <= CURRENT_TIMESTAMP
         AND (valid_to IS NULL OR valid_to > CURRENT_TIMESTAMP)
       ORDER BY price_per_unit_millimes ASC`
    );

    return reply.send({ tariffs: res.rows });
  });

  fastify.post('/add', {
    schema: addTariffSchema,
    preHandler: [fastify.authenticate, requireAdmin],
  }, async (request, reply) => {
    const {
      name,
      pricePerUnitMillimes,
      unitSeconds = 3600,
      roundingRule = 'EXACT',
      minimumChargeMillimes = 0,
    } = request.body;

    try {
      const res = await fastify.pg.query(
        `INSERT INTO tariffs (name, price_per_unit_millimes, unit_seconds, rounding_rule, minimum_charge_millimes)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, name, price_per_unit_millimes, unit_seconds, rounding_rule,
                   minimum_charge_millimes, valid_from, valid_to`,
        [name, pricePerUnitMillimes, unitSeconds, roundingRule, minimumChargeMillimes]
      );

      return reply.code(201).send({
        message: 'Tariff created successfully',
        tariff: res.rows[0],
      });
    } catch (err) {
      request.log.error(err);
      return reply.code(500).send({ error: 'Failed to create tariff' });
    }
  });

  fastify.post('/remove', {
    schema: removeTariffSchema,
    preHandler: [fastify.authenticate, requireAdmin],
  }, async (request, reply) => {
    const { id } = request.body;

    try {
      const res = await fastify.pg.query(
        `UPDATE tariffs
         SET valid_to = CURRENT_TIMESTAMP
         WHERE id = $1
           AND (valid_to IS NULL OR valid_to > CURRENT_TIMESTAMP)
         RETURNING id, name, valid_to`,
        [id]
      );

      if (res.rows.length === 0) {
        return reply.code(404).send({ error: 'Active tariff not found' });
      }

      return reply.send({
        message: 'Tariff removed. It can no longer be offered to new customers.',
        tariff: res.rows[0],
      });
    } catch (err) {
      request.log.error(err);
      return reply.code(500).send({ error: 'Failed to remove tariff' });
    }
  });
}

module.exports = tariffRoutes;