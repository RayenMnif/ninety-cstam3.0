const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

async function authRoutes(fastify, opts) {
  // 1. POST /api/auth/login
  fastify.post('/login', {
    schema: {
      summary: 'User Login',
      description: 'Authenticates a user by email and password, returning a signed JWT access token and user profile.',
      tags: ['Auth'],
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email', description: 'User account email address' },
          password: { type: 'string', description: 'Plaintext password' },
        },
      },
      response: {
        200: {
          description: 'Authentication successful. Returns JWT access token and user info.',
          type: 'object',
          properties: {
            token: { type: 'string', description: 'JWT Bearer token' },
            user: {
              type: 'object',
              properties: {
                id: { type: 'string', format: 'uuid' },
                username: { type: 'string' },
                email: { type: 'string', format: 'email' },
                role: { type: 'string' },
              },
            },
          },
        },
        400: {
          description: 'Missing required credentials.',
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
            statusCode: { type: 'integer' },
          },
        },
        401: {
          description: 'Invalid email or password.',
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
        403: {
          description: 'Account deactivated or banned.',
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
        500: {
          description: 'Internal server error.',
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { email, password } = request.body || {};

    if (!email || !password) {
      return reply.status(400).send({ error: 'Email and password are required' });
    }

    // Query user by email
    const query = 'SELECT id, username, email, password_hash, role, status FROM users WHERE email = $1';
    const result = await fastify.pg.query(query, [email]);

    if (result.rows.length === 0) {
      return reply.status(401).send({ error: 'Invalid email or password' });
    }

    const user = result.rows[0];

    if (user.status !== 'ACTIVE') {
      return reply.status(403).send({ error: 'Account is deactivated or banned' });
    }

    // Compare hashed password
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return reply.status(401).send({ error: 'Invalid email or password' });
    }

    // Generate JWT
    const secret = process.env.JWT_SECRET; 
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      secret,
      { expiresIn: '24h' }
    );

    return reply.send({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
      },
    });
  });

  fastify.post('/signup', {
    schema: {
      summary: 'Register New User',
      description: 'Creates a new gamer account, initializes a dedicated wallet with 0 balance, and issues an access token.',
      tags: ['Auth'],
      body: {
        type: 'object',
        required: ['email', 'username', 'password'],
        properties: {
          email: { type: 'string', format: 'email', description: 'Unique user email address' },
          username: { type: 'string', minLength: 3, maxLength: 50, description: 'Unique gamer display handle' },
          password: { type: 'string', minLength: 6, description: 'User password' },
        },
      },
      response: {
        201: {
          description: 'User successfully created with an active wallet.',
          type: 'object',
          properties: {
            token: { type: 'string', description: 'JWT Bearer token', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
            user: {
              type: 'object',
              properties: {
                id: { type: 'string', format: 'uuid', example: 'b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e' },
                username: { type: 'string', example: 'ninja_gamer' },
                email: { type: 'string', format: 'email', example: 'newgamer@example.com' },
                role: { type: 'string', example: 'GAMER' },
              },
            },
          },
        },
        400: {
          description: 'Missing required registration parameters.',
          type: 'object',
          properties: {
            error: { type: 'string', example: 'email, username, password are required' },
            message: { type: 'string', example: 'body must have required property password' },
            statusCode: { type: 'integer', example: 400 },
          },
        },
        409: {
          description: 'Email or username already taken.',
          type: 'object',
          properties: {
            error: { type: 'string', example: 'Email or username is already taken' },
          },
        },
        500: {
          description: 'Internal server error during registration.',
          type: 'object',
          properties: {
            error: { type: 'string', example: 'Internal server error during registration' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const {email, username, password} = request.body || {};
    if (!email || !username || !password){
        reply.status(400).send(
            {error: "email, username, password are required"}    
        );
    }

    const existingUser = await fastify.pg.query(
        'SELECT id FROM users WHERE email = $1 OR username = $2',
        [email, username]
    );

    if (existingUser.rows.length > 0){
        return reply.send(409).send({
            error: 'Email or username is already taken'
        });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const client = await fastify.pg.connect();

    try {
        await client.query('BEGIN');

        const insertUserQuery = `
            INSERT INTO users (username, email, password_hash, role, status)
            VALUES ($1, $2, $3, 'GAMER', 'ACTIVE')
            RETURNING id, username, email, role;
        `;
        const userResult = await client.query(insertUserQuery, [username, email, passwordHash]);
        const newUser = userResult.rows[0];

        // Create initial wallet with 0 balance
        await client.query('INSERT INTO wallets (user_id, balance_millimes) VALUES ($1, 0)', [newUser.id]);

        await client.query('COMMIT');

        // 4. Generate JWT token
        const secret = process.env.JWT_SECRET;
        const token = jwt.sign(
            { id: newUser.id, username: newUser.username, role: newUser.role },
            secret,
            { expiresIn: '24h' }
        );

        return reply.status(201).send({
            token,
            user: newUser,
        });
    } catch (err) {
        await client.query('ROLLBACK');
        fastify.log.error(err, 'Signup transaction failed');
        return reply.status(500).send({ error: 'Internal server error during registration' });
    } finally {
        client.release();
    }
  })


  fastify.get( '/me', {
    schema: {
      summary: 'Get Current Authenticated User',
      description: 'Retrieves profile information and current wallet balance in millimes for the authenticated caller.',
      tags: ['Auth'],
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          description: 'Current user profile with wallet balance in millimes.',
          type: 'object',
          properties: {
            user: {
              type: 'object',
              properties: {
                id: { type: 'string', format: 'uuid', example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d' },
                username: { type: 'string', example: 'pro_gamer' },
                email: { type: 'string', format: 'email', example: 'gamer@example.com' },
                role: { type: 'string', example: 'GAMER' },
                status: { type: 'string', example: 'ACTIVE' },
                balance_millimes: { type: 'string', description: 'Wallet balance in millimes', example: '15000' },
              },
            },
          },
        },
        401: {
          description: 'Unauthorized: Missing or invalid token.',
          type: 'object',
          properties: {
            error: { type: 'string', example: 'Unauthorized: Missing token header' },
          },
        },
        404: {
          description: 'User not found.',
          type: 'object',
          properties: {
            error: { type: 'string', example: 'User not found' },
          },
        },
        500: {
          description: 'Internal server error.',
          type: 'object',
          properties: {
            error: { type: 'string', example: 'Internal Server Error' },
          },
        },
      },
    },
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {

      const query = `
        SELECT u.id, u.username, u.email, u.role, u.status, COALESCE(w.balance_millimes, 0) as balance_millimes
        FROM users u
        LEFT JOIN wallets w ON u.id = w.user_id
        WHERE u.id = $1
      `;
      const result = await fastify.pg.query(query, [request.user.id]);

      if (result.rows.length === 0) {
        return reply.status(404).send({ error: 'User not found' });
      }

      return reply.send({ user: result.rows[0] });
    }
  );
}

module.exports = authRoutes;