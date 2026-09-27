async function walletRoutes(fastify, opts) {

    fastify.post('/topup', {
      schema: {
        summary: 'Top Up User Wallet',
        description: 'Deposits funds into a gamer wallet and logs a payment transaction. Admin role only.',
        tags: ['Wallets'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['userId', 'amountMillimes'],
          properties: {
            userId: { type: 'string', format: 'uuid', description: 'Target user UUID', examples: ['a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d'] },
            amountMillimes: { type: 'string', description: 'Amount to add in millimes (positive integer string)', examples: ['20000'] },
            paymentMethod: {
              type: 'string',
              enum: ['CASH', 'CARD', 'ONLINE', 'VOUCHER', 'ADJUSTMENT'],
              default: 'CASH',
              description: 'Payment method used for the top-up transaction',
              examples: ['CASH'],
            },
            referenceNote: {
              type: 'string',
              default: '',
              description: 'Optional reference note or receipt number',
              examples: ['Front desk cash payment'],
            },
          },
        },
        response: {
          200: {
            description: 'Wallet topped up successfully.',
            type: 'object',
            properties: {
              message: { type: 'string', example: 'Wallet topped up successfully' },
              transaction: {
                type: 'object',
                properties: {
                  paymentId: { type: 'string', format: 'uuid', example: 'f3e2d1c0-b9a8-7654-3210-fedcba987654' },
                  userId: { type: 'string', format: 'uuid', example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d' },
                  processedBy: { type: 'string', format: 'uuid', example: 'c4d5e6f7-a8b9-0c1d-2e3f-4a5b6c7d8e9f' },
                  amountAddedMillimes: { type: 'string', example: '20000' },
                  newBalanceMillimes: { type: 'string', example: '35000' },
                  paymentMethod: { type: 'string', example: 'CASH' },
                  createdAt: { type: 'string', format: 'date-time', example: '2026-09-27T10:30:00.000Z' },
                },
              },
            },
          },
          400: {
            description: 'Validation error or invalid amount.',
            type: 'object',
            properties: {
              error: { type: 'string', example: 'amountMillimes must be a positive integer string or number' },
              message: { type: 'string', example: 'body must have required property userId' },
              statusCode: { type: 'integer', example: 400 },
            },
          },
          401: {
            description: 'Unauthorized: Missing or invalid token.',
            type: 'object',
            properties: {
              error: { type: 'string', example: 'Unauthorized: Missing token header' },
            },
          },
          403: {
            description: 'Forbidden: Admin access required.',
            type: 'object',
            properties: {
              error: { type: 'string', example: 'Forbidden: Admin access required' },
            },
          },
          500: {
            description: 'Failed to process wallet top-up.',
            type: 'object',
            properties: {
              error: { type: 'string', example: 'Failed to process wallet top-up' },
            },
          },
        },
      },
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
      schema: {
        summary: 'Get Wallet Balance',
        description: 'Retrieves current balance in millimes for the specified user. Gamers can only check their own wallet; Admins can check any wallet.',
        tags: ['Wallets'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['userId'],
          properties: {
            userId: { type: 'string', format: 'uuid', description: 'Target user UUID', examples: ['a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d'] },
          },
        },
        response: {
          200: {
            description: 'Current wallet balance details.',
            type: 'object',
            properties: {
              userId: { type: 'string', format: 'uuid', example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d' },
              balanceMillimes: { type: 'string', example: '15000' },
              updatedAt: { type: 'string', format: 'date-time', nullable: true, example: '2026-09-27T10:00:00.000Z' },
            },
          },
          400: {
            description: 'Bad request (e.g. invalid UUID format).',
            type: 'object',
            properties: {
              error: { type: 'string', example: 'Bad Request' },
              message: { type: 'string', example: 'params/userId must match format uuid' },
              statusCode: { type: 'integer', example: 400 },
            },
          },
          401: {
            description: 'Unauthorized: Missing or invalid token.',
            type: 'object',
            properties: {
              error: { type: 'string', example: 'Unauthorized: Missing token header' },
            },
          },
          403: {
            description: 'Forbidden: Cannot view another user balance.',
            type: 'object',
            properties: {
              error: { type: 'string', example: 'Forbidden: Cannot view another user balance' },
            },
          },
          500: {
            description: 'Failed to fetch wallet balance.',
            type: 'object',
            properties: {
              error: { type: 'string', example: 'Failed to fetch wallet balance' },
            },
          },
        },
      },
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
      schema: {
        summary: 'Get Wallet Payment History',
        description: 'Fetches paginated payment and top-up transaction history for a user. Gamers can only view their own history; Admins can view any user payment history.',
        tags: ['Wallets'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['userId'],
          properties: {
            userId: { type: 'string', format: 'uuid', description: 'Target user UUID', examples: ['a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d'] },
          },
        },
        response: {
          200: {
            description: 'List of payment records.',
            type: 'object',
            properties: {
              userId: { type: 'string', format: 'uuid', example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d' },
              totalRecords: { type: 'integer', example: 1 },
              payments: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', format: 'uuid', example: 'f3e2d1c0-b9a8-7654-3210-fedcba987654' },
                    amount_millimes: { type: 'string', example: '20000' },
                    payment_method: { type: 'string', example: 'CASH' },
                    reference_note: { type: 'string', nullable: true, example: 'Counter topup' },
                    created_at: { type: 'string', format: 'date-time', example: '2026-09-27T10:15:00.000Z' },
                    processed_by: { type: 'string', format: 'uuid', example: 'c4d5e6f7-a8b9-0c1d-2e3f-4a5b6c7d8e9f' },
                  },
                },
              },
            },
          },
          400: {
            description: 'Bad request (e.g. invalid query parameters or UUID).',
            type: 'object',
            properties: {
              error: { type: 'string', example: 'Bad Request' },
              message: { type: 'string', example: 'querystring/limit must be <= 100' },
              statusCode: { type: 'integer', example: 400 },
            },
          },
          401: {
            description: 'Unauthorized: Missing or invalid token.',
            type: 'object',
            properties: {
              error: { type: 'string', example: 'Unauthorized: Missing token header' },
            },
          },
          403: {
            description: 'Forbidden: Cannot view another user payment history.',
            type: 'object',
            properties: {
              error: { type: 'string', example: 'Forbidden: Cannot view another user payment history' },
            },
          },
          500: {
            description: 'Failed to fetch payment history.',
            type: 'object',
            properties: {
              error: { type: 'string', example: 'Failed to fetch payment history' },
            },
          },
        },
      },
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