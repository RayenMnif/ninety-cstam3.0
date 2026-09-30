// auth-handler.js
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

class AuthHandler {
  constructor({ db, logger, agentConnections }) {
    this.db = db;
    this.logger = logger;
    this.agentConnections = agentConnections; // Store reference to agent connections map
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
    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload);
      } catch (err) {
        this.logger?.warn('Failed to parse stringified login payload');
      }
    }

    this.logger?.info({ payload }, 'Processing AUTH_LOGIN attempt');

    const identifier =
      payload?.UsernameOrEmail || payload?.usernameOrEmail || payload?.Email || payload?.email || payload?.Username || payload?.username;

    const password =
      payload?.Password || payload?.password || payload?.Pass || payload?.pass || payload?.Pwd || payload?.pwd;

    const stationId =
      payload?.StationId || payload?.stationId || socket.stationId;

    const hostname =
      payload?.Hostname || payload?.hostname || socket.hostname || 'UNKNOWN-PC';

    const macAddress =
      payload?.MacAddress || payload?.macAddress || socket.macAddress || '';

    const ipAddress =
      payload?.IpAddress || payload?.ipAddress || socket.remoteAddress || socket.ip || '127.0.0.1';

    if (!identifier || !password) {
      this.logger?.warn({ payload }, 'AUTH_LOGIN failed: Missing email/username or password');
      return this._sendResponse(socket, false, 'Email or password are required');
    }

    const client = await this.db.connect();

    try {
      await client.query('BEGIN');

      const result = await client.query(
        'SELECT id, username, password_hash, role FROM users WHERE email = $1 OR username = $1',
        [identifier]
      );

      if (result.rows.length === 0) {
        await client.query('ROLLBACK');
        this.logger?.warn({ identifier }, 'AUTH_LOGIN failed: User not found');
        return this._sendResponse(socket, false, 'Invalid credentials');
      }

      const user = result.rows[0];

      const validPassword = await bcrypt.compare(password, user.password_hash);
      if (!validPassword) {
        await client.query('ROLLBACK');
        this.logger?.warn({ identifier }, 'AUTH_LOGIN failed: Invalid password');
        return this._sendResponse(socket, false, 'Invalid credentials');
      }

      let activeStationId = stationId;
      if (!activeStationId) {
        const crypto = require('crypto');
        activeStationId = crypto.randomUUID();
      }

      const existingHostRes = await client.query(
        'SELECT id FROM stations WHERE LOWER(hostname) = LOWER($1)',
        [hostname]
      );

      if (existingHostRes.rows.length > 0) {
        const oldStationId = existingHostRes.rows[0].id;
        await client.query('DELETE FROM sessions WHERE station_id = $1', [oldStationId]);
        await client.query('DELETE FROM stations WHERE id = $1', [oldStationId]);
      }

      await client.query(
        `INSERT INTO stations (id, hostname, ip_address, mac_address, status)
         VALUES ($1, $2, $3, $4, 'AVAILABLE')`,
        [activeStationId, hostname, ipAddress, macAddress || '00:00:00:00:00:00']
      );

      const tariffRes = await client.query('SELECT id FROM tariffs LIMIT 1');
      if (tariffRes.rows.length === 0) {
        await client.query('ROLLBACK');
        this.logger?.warn('AUTH_LOGIN failed: No tariffs found in database');
        return this._sendResponse(socket, false, 'No pricing tariff configured in database');
      }

      const tariffId = tariffRes.rows[0].id;

      const sessionResult = await client.query(
        `INSERT INTO sessions (station_id, customer_id, tariff_id, status, opened_at, version)
         VALUES ($1, $2, $3, 'ACTIVE', NOW(), 1)
         RETURNING id, status, opened_at`,
        [activeStationId, user.id, tariffId]
      );
      const session = sessionResult.rows[0];

      await client.query(
        `UPDATE stations SET status = 'OCCUPIED' WHERE id = $1`,
        [activeStationId]
      );

      await client.query('COMMIT');

      // --- CRITICAL FIX: UPDATE WEBSOCKET CONNECTION MAPPING ---
      const oldStationId = socket.stationId;
      if (oldStationId && oldStationId !== activeStationId && this.agentConnections) {
        this.agentConnections.delete(oldStationId);
      }

      socket.stationId = activeStationId;

      if (this.agentConnections) {
        this.agentConnections.set(activeStationId, {
          socket: socket,
          hostname: hostname,
          macAddress: macAddress || socket.macAddress || ''
        });
      }

      const token = jwt.sign(
        { userId: user.id, username: user.username, role: user.role, sessionId: session?.id },
        process.env.JWT_SECRET || 'secret',
        { expiresIn: '24h' }
      );

      this.logger?.info({ username: user.username, stationId: activeStationId }, 'AUTH_LOGIN successful & Session Created');

      return this._sendResponse(socket, true, 'Login successful', {
        username: user.username,
        token: token,
        sessionId: session ? session.id : null,
        openedAt: session ? session.opened_at : null,
        stationId: activeStationId
      });

    } catch (err) {
      await client.query('ROLLBACK');
      this.logger?.error({ err }, 'AUTH_LOGIN error');
      return this._sendResponse(socket, false, 'Internal server error');
    } finally {
      client.release();
    }
  }

  async handleRegister(socket, payload) {
    if (typeof payload === 'string') {
      try { payload = JSON.parse(payload); } catch (err) {}
    }
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
    const payloadData = {
      success,
      Success: success,
      message,
      Message: message,
      ...(extraData.username ? { username: extraData.username, Username: extraData.username } : {}),
      ...(extraData.token ? { token: extraData.token, Token: extraData.token } : {}),
      ...(extraData.sessionId ? { sessionId: extraData.sessionId, SessionId: extraData.sessionId } : {}),
      ...(extraData.openedAt ? { openedAt: extraData.openedAt, OpenedAt: extraData.openedAt } : {}),
      ...(extraData.stationId ? { stationId: extraData.stationId, StationId: extraData.stationId } : {}),
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