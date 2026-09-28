const {
  topupWalletSchema,
  getWalletBalanceSchema,
  getWalletHistorySchema,
} = require('../schemas/wallets.schema');

async function walletRoutes(fastify, opts) {

    fastify.post('/topup', {
      schema: topupWalletSchema,
      preHandler: [fastify.authenticate, fastify.adminOnly],
    }, async (request, reply) => {
      const { userId, amountMillimes, paymentMethod = 'CASH', referenceNote = '' } = request.body || {};
      const adminId = request.user.id;
  
      // Validate request inputs
      if (!userId || !amountMillimes) {
        return reply.code(400).send({ error: 'userId and amountMillimes are required' });
      }
  
      let topupAmount;
      try {
        topupAmount = BigInt(amountMillimes);
        if (topupAmount <= 0n) throw new Error();
      } catch (_) {
        return reply.code(400).send({ error: 'amountMillimes must be a positive integer string or number' });
      }
  
      const client = await fastify.pg.connect();
  
      try {
        await client.query('BEGIN');
  
        // atomically update balance or upsert wallet if row does not exist
        const walletRes = await client.query(
          `INSERT INTO wallets (user_id, balance_millimes, updated_at)
           VALUES ($1, $2, CURRENT_TIMESTAMP)
           ON CONFLICT (user_id) 
           DO UPDATE SET 
             balance_millimes = wallets.balance_millimes + EXCLUDED.balance_millimes,
             updated_at = CURRENT_TIMESTAMP
           RETURNING balance_millimes`,
          [userId, topupAmount.toString()]
        );
  
        const newBalance = walletRes.rows[0].balance_millimes;
  
        const paymentRes = await client.query(
          `INSERT INTO payments (customer_id, processed_by, amount_millimes, payment_method, reference_note)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, payment_method, created_at`,
          [userId, adminId, topupAmount.toString(), paymentMethod.toUpperCase(), referenceNote]
        );
  
        await client.query('COMMIT');
  
        const paymentRecord = paymentRes.rows[0];
  
        return reply.code(200).send({
          message: 'Wallet topped up successfully',
          transaction: {
            paymentId: paymentRecord.id,
            userId,
            processedBy: adminId,
            amountAddedMillimes: topupAmount.toString(),
            newBalanceMillimes: newBalance,
            paymentMethod: paymentRecord.payment_method,
            createdAt: paymentRecord.created_at,
          },
        });
  
      } catch (error) {
        await client.query('ROLLBACK');
        request.log.error(error);
        return reply.code(500).send({ error: 'Failed to process wallet top-up' });
      } finally {
        client.release();
      }
    });
  
  
    fastify.get('/:userId', {
      schema: getWalletBalanceSchema,
      preHandler: [fastify.authenticate],
    }, async (request, reply) => {
      const { userId } = request.params;
  
      // Gamers can only check their own wallet; Admins can check any wallet
      if (request.user.role !== 'ADMIN' && request.user.id !== userId) {
        return reply.code(403).send({ error: 'Forbidden: Cannot view another user balance' });
      }
  
      try {
        const res = await fastify.pg.query(
          `SELECT balance_millimes, updated_at FROM wallets WHERE user_id = $1`,
          [userId]
        );
  
        if (res.rows.length === 0) {
          return reply.send({
            userId,
            balanceMillimes: '0',
            updatedAt: null,
          });
        }
  
        return reply.send({
          userId,
          balanceMillimes: res.rows[0].balance_millimes,
          updatedAt: res.rows[0].updated_at,
        });
  
      } catch (error) {
        request.log.error(error);
        return reply.code(500).send({ error: 'Failed to fetch wallet balance' });
      }
    });
  
  
    fastify.get('/:userId/history', {
      schema: getWalletHistorySchema,
      preHandler: [fastify.authenticate],
    }, async (request, reply) => {
      const { userId } = request.params;
      const { limit = 20, offset = 0 } = request.query || {};
  
      if (request.user.role !== 'ADMIN' && request.user.id !== userId) {
        return reply.code(403).send({ error: 'Forbidden: Cannot view another user payment history' });
      }
  
      try {
        const res = await fastify.pg.query(
          `SELECT id, amount_millimes, payment_method, reference_note, created_at, processed_by
           FROM payments
           WHERE customer_id = $1
           ORDER BY created_at DESC
           LIMIT $2 OFFSET $3`,
          [userId, Math.min(parseInt(limit, 10), 100), Math.max(parseInt(offset, 10), 0)]
        );
  
        return reply.send({
          userId,
          totalRecords: res.rows.length,
          payments: res.rows,
        });
  
      } catch (error) {
        request.log.error(error);
        return reply.code(500).send({ error: 'Failed to fetch payment history' });
      }
    });
  }
  
  module.exports = walletRoutes;