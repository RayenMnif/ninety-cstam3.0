const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

class AuthHandler {
  constructor({ db, logger }) {
    this.db = db;
    this.logger = logger;
  }

  _send(socket, message) {
    const ws = socket.socket || socket;
    if (ws && ws.readyState === 1) {
      try {
        ws.send(JSON.stringify(message));
      } catch (err) {
        this.logger?.warn?.({ err }, 'Failed to send message over WebSocket');
      }
    }
  }

  async handleLogin(socket, payload) {
    // Support Email / email & Password / password
    const email = payload?.Email || payload?.email;
    const password = payload?.Password || payload?.password;

    this.logger?.info({ email }, 'Processing AUTH_LOGIN attempt');

    if (!email || !password) {
      this.logger?.warn('AUTH_LOGIN failed: Missing email or password');
      return this._sendResponse(socket, false, 'Email and password are required');
    }

    try {
      const result = await this.db.query(
        'SELECT id, username, password_hash, role FROM users WHERE email = $1',
        [email]
      );

      if (result.rows.length === 0) {
        this.logger?.warn({ email }, 'AUTH_LOGIN failed: User not found');
        return this._sendResponse(socket, false, 'Invalid credentials');
      }

      const user = result.rows[0];
      const validPassword = await bcrypt.compare(password, user.password_hash);

      if (!validPassword) {
        this.logger?.warn({ email }, 'AUTH_LOGIN failed: Invalid password');
        return this._sendResponse(socket, false, 'Invalid credentials');
      }

      const token = jwt.sign(
        { userId: user.id, username: user.username, role: user.role },
        process.env.JWT_SECRET || 'secret',
        { expiresIn: '24h' }
      );

      this.logger?.info({ username: user.username }, 'AUTH_LOGIN successful');

      return this._sendResponse(socket, true, 'Login successful', {
        username: user.username,
        token: token,
      });
    } catch (err) {
      this.logger?.error({ err }, 'AUTH_LOGIN error');
      return this._sendResponse(socket, false, 'Internal server error');
    }
  }

  async handleRegister(socket, payload) {
    const username = payload?.Username || payload?.username;
    const email = payload?.Email || payload?.email;
    const password = payload?.Password || payload?.password;
    const role = payload?.Role || payload?.role || 'GAMER';

    if (!username || !email || !password) {
      return this._sendResponse(socket, false, 'All fields are required');
    }

    try {
      const existing = await this.db.query(
        'SELECT id FROM users WHERE email = $1 OR username = $2',
        [email, username]
      );

      if (existing.rows.length > 0) {
        return this._sendResponse(socket, false, 'User with this email or username already exists');
      }

      const saltRounds = 10;
      const passwordHash = await bcrypt.hash(password, saltRounds);

      const insertResult = await this.db.query(
        'INSERT INTO users (username, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, username',
        [username, email, passwordHash, role]
      );

      const newUser = insertResult.rows[0];
      const token = jwt.sign(
        { userId: newUser.id, username: newUser.username, role: role },
        process.env.JWT_SECRET || 'secret',
        { expiresIn: '24h' }
      );

      this.logger?.info({ username: newUser.username }, 'AUTH_REGISTER successful');

      return this._sendResponse(socket, true, 'Registration successful', {
        username: newUser.username,
        token: token,
      });
    } catch (err) {
      this.logger?.error({ err }, 'AUTH_REGISTER error');
      return this._sendResponse(socket, false, 'Internal server error');
    }
  }

  _sendResponse(socket, success, message, extraData = {}) {
    // Structure compatible C# (PascalCase) et JavaScript / Postman (camelCase)
    const payloadData = {
      success,
      Success: success,
      message,
      Message: message,
      ...(extraData.username ? { username: extraData.username, Username: extraData.username } : {}),
      ...(extraData.token ? { token: extraData.token, Token: extraData.token } : {}),
    };

    const envelope = {
      type: 'AUTH_RESPONSE',
      Type: 'AUTH_RESPONSE',
      payload: payloadData,
      Payload: payloadData,
    };

    this._send(socket, envelope);
  }
}

module.exports = { AuthHandler };