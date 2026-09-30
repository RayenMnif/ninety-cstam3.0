const {
  createTierSchema,
  getTiersSchema,
  getTierByIdSchema,
  stopTierSchema,
  subscribeSchema,
  getMyMembershipSchema,
  cancelSubscriptionSchema
} = require('../schemas/membership.schema');

module.exports = async function membershipRoutes(fastify, options) {

  fastify.get('/tiers', { schema: getTiersSchema }, async (request, reply) => {
    try {
      const query = `
        SELECT id, name, price_millimes::INT AS price_millimes, duration_days, discount_percentage, valid_from, valid_to
        FROM membership_tiers
        WHERE valid_from <= CURRENT_TIMESTAMP 
          AND (valid_to IS NULL OR valid_to > CURRENT_TIMESTAMP)
        ORDER BY price_millimes ASC
      `;
      const { rows, rowCount } = await fastify.pg.query(query);

      if (rowCount === 0) {
        return reply.code(404).send({ error: 'No active membership plans found' });
      }

      return reply.send(rows);
    } catch (err) {
      request.log.error(err);
      return reply.code(500).send({ error: 'Failed to fetch membership tiers', details: err.message });
    }
  });

  fastify.get('/tiers/:id', { schema: getTierByIdSchema }, async (request, reply) => {
    try {
      const { id } = request.params;
      const query = `
        SELECT id, name, price_millimes::INT AS price_millimes, duration_days, discount_percentage, valid_from, valid_to
        FROM membership_tiers
        WHERE id = $1 AND valid_from <= CURRENT_TIMESTAMP 
          AND (valid_to IS NULL OR valid_to > CURRENT_TIMESTAMP)
      `;
      const { rows, rowCount } = await fastify.pg.query(query, [id]);

      if (rowCount === 0) {
        return reply.code(404).send({ error: 'Membership plan not found' });
      }

      return reply.send(rows[0]);
    } catch (err) {
      request.log.error(err);
      return reply.code(500).send({ error: 'Failed to fetch membership tier', details: err.message });
    }
  });

  fastify.post('/tiers', {
    schema: createTierSchema,
    preHandler: [
      fastify.authenticate, 
      fastify.adminOnly || fastify.authorizeAdmin
    ]
  }, async (request, reply) => {
    try {
      const { name, price_millimes, duration_days, discount_percentage, valid_to } = request.body;

      const query = `
        INSERT INTO membership_tiers (name, price_millimes, duration_days, discount_percentage, valid_to)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, name, price_millimes::INT AS price_millimes, duration_days, discount_percentage, valid_from, valid_to
      `;

      const { rows } = await fastify.pg.query(query, [
        name,
        price_millimes,
        duration_days,
        discount_percentage || 0,
        valid_to || null
      ]);

      return reply.status(201).send(rows[0]);
    } catch (err) {
      request.log.error(err);
      return reply.code(500).send({ error: 'Failed to create tier', details: err.message });
    }
  });

  fastify.delete('/tiers/:id', {
    schema: stopTierSchema,
    preHandler: [
      fastify.authenticate, 
      fastify.adminOnly || fastify.authorizeAdmin
    ]
  }, async (request, reply) => {
    try {
      const { id } = request.params;


      const query = `
        UPDATE membership_tiers 
        SET valid_to = CURRENT_TIMESTAMP 
        WHERE id = $1 AND (valid_to IS NULL OR valid_to > CURRENT_TIMESTAMP)
        RETURNING id, name, price_millimes::INT AS price_millimes, duration_days, discount_percentage, valid_from, valid_to
      `;

      const { rows, rowCount } = await fastify.pg.query(query, [id]);

      if (rowCount === 0) {
        return reply.code(404).send({ error: 'Membership tier not found or already stopped' });
      }

      return reply.send({
        message: `Membership tier "${rows[0].name}" has been stopped successfully`,
        tier: rows[0]
      });
    } catch (err) {
      request.log.error(err);
      return reply.code(500).send({ error: 'Failed to stop membership tier', details: err.message });
    }
  });

  fastify.post('/subscribe', {
    schema: subscribeSchema,
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const userId = request.user.id;
    const { tier_id, auto_renew } = request.body;

    const client = await fastify.pg.connect();

    try {
      await client.query('BEGIN');

      const activeCheck = await client.query(
        `SELECT id FROM user_subscriptions 
         WHERE user_id = $1 AND status = 'ACTIVE' AND expires_at > CURRENT_TIMESTAMP`,
        [userId]
      );

      if (activeCheck.rowCount > 0) {
        await client.query('ROLLBACK');
        return reply.code(400).send({ error: 'User already has an active subscription' });
      }

      const tierResult = await client.query(
        `SELECT id, name, price_millimes::INT AS price_millimes, duration_days 
         FROM membership_tiers 
         WHERE id = $1 AND valid_from <= CURRENT_TIMESTAMP 
           AND (valid_to IS NULL OR valid_to > CURRENT_TIMESTAMP)`,
        [tier_id]
      );

      if (tierResult.rowCount === 0) {
        await client.query('ROLLBACK');
        return reply.code(404).send({ error: 'Membership plan not found or expired' });
      }

      const tier = tierResult.rows[0];

      const walletResult = await client.query(
        `SELECT balance_millimes::INT AS balance_millimes FROM wallets WHERE user_id = $1 FOR UPDATE`,
        [userId]
      );

      if (walletResult.rowCount === 0 || walletResult.rows[0].balance_millimes < tier.price_millimes) {
        await client.query('ROLLBACK');
        return reply.code(400).send({ error: 'Insufficient wallet balance' });
      }

      await client.query(
        `UPDATE wallets 
         SET balance_millimes = balance_millimes - $1, updated_at = CURRENT_TIMESTAMP 
         WHERE user_id = $2`,
        [tier.price_millimes, userId]
      );

      const subResult = await client.query(
        `INSERT INTO user_subscriptions (user_id, tier_id, starts_at, expires_at, auto_renew, status)
         VALUES ($1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + ($3 * INTERVAL '1 day'), $4, 'ACTIVE')
         RETURNING id, user_id, tier_id, starts_at, expires_at, auto_renew, status`,
        [userId, tier.id, tier.duration_days, auto_renew || false]
      );

      await client.query(
        `INSERT INTO payments (customer_id, processed_by, amount_millimes, payment_method, reference_note)
         VALUES ($1, $1, $2, 'ONLINE', $3)`,
        [userId, tier.price_millimes, `Membership Purchase: ${tier.name}`]
      );

      await client.query('COMMIT');

      return reply.status(201).send({
        message: 'Subscription purchased successfully',
        subscription: subResult.rows[0]
      });

    } catch (err) {
      await client.query('ROLLBACK');
      request.log.error(err);
      return reply.code(500).send({ error: 'Subscription processing failed', details: err.message });
    } finally {
      client.release();
    }
  });

  fastify.get('/me', {
    schema: getMyMembershipSchema,
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    try {
      const userId = request.user.id;

      const query = `
        SELECT 
          us.id, us.user_id, us.tier_id, us.starts_at, us.expires_at, us.auto_renew, us.status,
          mt.name AS tier_name, mt.discount_percentage
        FROM user_subscriptions us
        JOIN membership_tiers mt ON us.tier_id = mt.id
        WHERE us.user_id = $1 AND us.status = 'ACTIVE' AND us.expires_at > CURRENT_TIMESTAMP
        LIMIT 1
      `;

      const { rows, rowCount } = await fastify.pg.query(query, [userId]);

      if (rowCount === 0) {
        return reply.send({
          has_active_membership: false,
          subscription: null
        });
      }

      return reply.send({
        has_active_membership: true,
        subscription: rows[0]
      });
    } catch (err) {
      request.log.error(err);
      return reply.code(500).send({ error: 'Failed to fetch membership status', details: err.message });
    }
  });

  fastify.post('/cancel', {
    schema: cancelSubscriptionSchema,
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    try {
      const userId = request.user.id;

      const query = `
        UPDATE user_subscriptions 
        SET auto_renew = FALSE 
        WHERE user_id = $1 AND status = 'ACTIVE' AND expires_at > CURRENT_TIMESTAMP
        RETURNING id, user_id, tier_id, starts_at, expires_at, auto_renew, status
      `;

      const { rows, rowCount } = await fastify.pg.query(query, [userId]);

      if (rowCount === 0) {
        return reply.code(404).send({ error: 'No active membership plan found to cancel' });
      }

      return reply.send({
        message: 'Subscription auto-renewal cancelled',
        subscription: rows[0]
      });
    } catch (err) {
      request.log.error(err);
      return reply.code(500).send({ error: 'Failed to cancel subscription', details: err.message });
    }
  });
};