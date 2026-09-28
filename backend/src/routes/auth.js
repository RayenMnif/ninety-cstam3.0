const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const {
  loginSchema,
  signupSchema,
  currentUserSchema,
} = require('../schemas/auth.schema');

async function authRoutes(fastify, opts) {
  // 1. POST /api/auth/login
  fastify.post('/login', {
    schema: loginSchema,
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
    schema: signupSchema,
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
    schema: currentUserSchema,
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