require('dotenv').config();
const bcrypt = require('bcryptjs');
const buildApp = require('../src/app');

async function createAdmin() {
  const [username, email, password] = process.argv.slice(2);

  if (!username || !email || !password) {
    console.error(`❌ Missing arguments.\nUsage: node scripts/create-admin.js <username> <email> <password>`);
    process.exit(1);
  }

  const app = await buildApp();
  let exitCode = 0;

  try {
    await app.ready();
    const client = await app.pg.connect();

    try {
      await client.query('BEGIN');

      const passwordHash = await bcrypt.hash(password, 10);

      const userRes = await client.query(
        `INSERT INTO users (username, email, password_hash, role, status)
         VALUES ($1, $2, $3, 'ADMIN', 'ACTIVE')
         RETURNING id, username, email, role`,
        [username, email, passwordHash]
      );

      const newUser = userRes.rows[0];

      await client.query(
        'INSERT INTO wallets (user_id, balance_millimes) VALUES ($1, 0)',
        [newUser.id]
      );

      await client.query('COMMIT');

      console.log('Admin account created successfully!');
      console.table(newUser);
    } catch (error) {
      await client.query('ROLLBACK');
      exitCode = 1;

      if (error.code === '23505') {
        console.error('Error: Email or username is already taken.');
      } else {
        console.error('Database transaction failed:', error.message);
      }
    } finally {
      client.release(); 
    }
  } catch (error) {
    console.error('App setup failed:', error.message);
    exitCode = 1;
  } finally {
    await app.close(); 
    process.exit(exitCode);
  }
}

createAdmin();