const {
  getTariffsSchema,
  addTariffSchema,
  removeTariffSchema,
} = require('../schemas/tariffs.schema');

async function tariffRoutes(fastify, opts) {
  // Use fastify.adminOnly plugin decorator if available, or safe fallback check
  const requireAdmin = fastify.adminOnly || (async (request, reply) => {
    if (!request.user || request.user.role !== 'ADMIN') {
      return reply.code(403).send({ error: 'Forbidden: Admin access required' });
    }
  });

// GET TARIFF
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

// Handler function for creating batch tariffs (Standard: origin_price, VIP: origin-pricex2, Night: origin_pricex3)
  const handleAddTariffs = async (request, reply) => {
    const {
      pricePerUnitMillimes,
      roundingRule = 'EXACT',
      minimumChargeMillimes = 0,
    } = request.body;

    const toTnd = (millimes) => (millimes / 1000).toFixed(3).replace(/\.?0+$/, '');

    const ZONES = [
      { label: 'Standard Zone', multiplier: 1, unitSeconds: 3600 },
      { label: 'VIP Gaming Zone', multiplier: 2, unitSeconds: 3600 },
      { label: 'Night Pass', multiplier: 3, unitSeconds: 3600 },
    ];

    const client = await fastify.pg.connect();

    try {
      await client.query('BEGIN');

      const created = [];
      for (const zone of ZONES) {
        const price = pricePerUnitMillimes * zone.multiplier;
        const minCharge = minimumChargeMillimes * zone.multiplier;
        const name = `${zone.label} (${toTnd(price)} TND/h)`;

        const res = await client.query(
          `INSERT INTO tariffs (name, price_per_unit_millimes, unit_seconds, rounding_rule, minimum_charge_millimes)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, name, price_per_unit_millimes, unit_seconds, rounding_rule,
                     minimum_charge_millimes, valid_from, valid_to`,
          [name, price, zone.unitSeconds, roundingRule, minCharge]
        );
        created.push(res.rows[0]);
      }

      await client.query('COMMIT');

      return reply.code(201).send({
        message: 'Standard, VIP and Night tariffs created successfully',
        tariffs: created,
      });
    } catch (err) {
      await client.query('ROLLBACK');
      request.log.error(err);
      return reply.code(500).send({ error: 'Failed to create tariffs', details: err.message });
    } finally {
      client.release();
    }
  };

  // 2. POST /add & POST / :add Standard, VIP, Night batch tariffs
  fastify.post('/add', {
    schema: addTariffSchema,
    preHandler: [fastify.authenticate, requireAdmin],
  }, handleAddTariffs);

  fastify.post('/', {
    schema: addTariffSchema,
    preHandler: [fastify.authenticate, requireAdmin],
  }, handleAddTariffs);

  // 3. POST /remove — delete Standard, VIP and Night tariffs by origin price
  fastify.post('/remove', {
    schema: removeTariffSchema,
    preHandler: [fastify.authenticate, requireAdmin],
  }, async (request, reply) => {
    try {
      const { pricePerUnitMillimes } = request.body;
      const base = Number(pricePerUnitMillimes);

      const res = await fastify.pg.query(
        `UPDATE tariffs
         SET valid_to = CURRENT_TIMESTAMP
         WHERE (valid_to IS NULL OR valid_to > CURRENT_TIMESTAMP)
           AND price_per_unit_millimes IN ($1::bigint, $2::bigint, $3::bigint)
         RETURNING id, name, price_per_unit_millimes, valid_to`,
        [base, base * 2, base * 3]
      );

      if (res.rowCount === 0) {
        return reply.code(404).send({
          error: 'No active tariffs found matching this base price',
        });
      }

      return reply.send({
        message: `${res.rowCount} tariff(s) removed successfully`,
        deactivatedTariffs: res.rows,
      });
    } catch (err) {
      request.log.error(err);
      return reply.code(500).send({ error: 'Failed to deactivate tariffs', details: err.message });
    }
  });

  // 4. DELETE /:id — Deactivate a single tariff by ID
  fastify.delete('/:id', {
    preHandler: [fastify.authenticate, requireAdmin],
  }, async (request, reply) => {
    try {
      const { id } = request.params;

      const res = await fastify.pg.query(
        `UPDATE tariffs
         SET valid_to = CURRENT_TIMESTAMP
         WHERE id = $1 AND (valid_to IS NULL OR valid_to > CURRENT_TIMESTAMP)
         RETURNING id, name, price_per_unit_millimes, valid_to`,
        [id]
      );

      if (res.rowCount === 0) {
        return reply.code(404).send({ error: 'Tariff not found or already deactivated' });
      }

      return reply.send({
        message: 'Tariff deactivated successfully',
        deactivatedTariff: res.rows[0],
      });
    } catch (err) {
      request.log.error(err);
      return reply.code(500).send({ error: 'Failed to delete tariff', details: err.message });
    }
  });
}

module.exports = tariffRoutes;