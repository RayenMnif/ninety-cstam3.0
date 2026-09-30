const {
  banUserSchema,
  unbanUserSchema,
  getBannedUsersSchema,
} = require('../schemas/ban.schema');

async function adminBanRoutes(fastify, opts) {
  fastify.post('/ban/:id', {
    schema: banUserSchema,
    preHandler: [fastify.authenticate, fastify.adminOnly],
  }, async (request, reply) => {
    const { id } = request.params;

    if (request.user && request.user.id === id) {
      return reply.code(400).send({ error: 'Admins cannot ban themselves' });
    }

    try {
      
      const userResult = await fastify.pg.query(
        'SELECT id, role, status FROM users WHERE id = $1',
        [id]
      );

      if (userResult.rowCount === 0) {
        return reply.code(404).send({ error: 'User not found' });
      }

      const targetUser = userResult.rows[0];

      if (targetUser.role === 'ADMIN') {
        return reply.code(403).send({ error: 'Cannot ban an admin user' });
      }

      if (targetUser.status === 'BANNED') {
        return reply.code(400).send({ error: 'User is already banned' });
      }

      const updateResult = await fastify.pg.query(
        `UPDATE users
         SET status = 'BANNED'
         WHERE id = $1
         RETURNING id, username, email, role, status`,
        [id]
      );

      return reply.send({
        message: 'User banned successfully',
        user: updateResult.rows[0],
      });
    } catch (err) {
      request.log.error(err);
      return reply.code(500).send({ error: 'Failed to ban user', details: err.message });
    }
  });

  fastify.get('/ban', {
    schema: getBannedUsersSchema,
    preHandler: [fastify.authenticate, fastify.adminOnly],
  }, async (request, reply) => {
    try {
      const result = await fastify.pg.query(
        `SELECT id, username, email, role, status, created_at
         FROM users
         WHERE status = 'BANNED'
         ORDER BY username ASC`
      );

      return reply.send({
        bannedUsers: result.rows,
        count: result.rowCount,
      });
    } catch (err) {
      request.log.error(err);
      return reply.code(500).send({ error: 'Failed to fetch banned users', details: err.message });
    }
  });

  fastify.post('/unban/:id', {
    schema: unbanUserSchema,
    preHandler: [fastify.authenticate, fastify.adminOnly],
  }, async (request, reply) => {
    const { id } = request.params;

    try {
      const userResult = await fastify.pg.query(
        'SELECT id, status FROM users WHERE id = $1',
        [id]
      );

      if (userResult.rowCount === 0) {
        return reply.code(404).send({ error: 'User not found' });
      }

      if (userResult.rows[0].status !== 'BANNED') {
        return reply.code(400).send({ error: 'User is not currently banned' });
      }

      const updateResult = await fastify.pg.query(
        `UPDATE users
         SET status = 'ACTIVE'
         WHERE id = $1
         RETURNING id, username, email, role, status`,
        [id]
      );

      return reply.send({
        message: 'User unbanned successfully',
        user: updateResult.rows[0],
      });
    } catch (err) {
      request.log.error(err);
      return reply.code(500).send({ error: 'Failed to unban user', details: err.message });
    }
  });
}

module.exports = adminBanRoutes;