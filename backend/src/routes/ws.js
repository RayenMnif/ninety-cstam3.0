const bcrypt = require('bcryptjs');

const MessageType = Object.freeze({
	Ack: 'ACK',
	StationRegister: 'STATION_REGISTER',
	ClientHeartbeat: 'CLIENT_HEARTBEAT',
	SecurityAlert: 'SECURITY_ALERT',
	SessionCommand: 'SESSION_COMMAND',
	AuthLogin: 'AUTH_LOGIN',
	AuthRegister: 'AUTH_REGISTER',
});

const SessionActions = new Set(['START', 'PAUSE', 'LOCK', 'UNLOCK']);

function sendAck(socket, messageType, success = true, message = '') {
	if (socket.readyState !== 1) return;
	try {
		socket.send(JSON.stringify({
			type: MessageType.Ack,
			payload: { messageId: messageType, success, message },
		}));
	} catch (_) {
		// The agent may disconnect between message processing and the ACK.
	}
}

function sendAuthResponse(socket, success, message, user = null) {
	if (socket.readyState !== 1) return;
	try {
		socket.send(JSON.stringify({
			type: 'AUTH_RESPONSE',
			payload: {
				success,
				message,
				...(user ? { userId: String(user.id), username: user.username, role: user.role } : {}),
			},
		}));
	} catch (_) {
	}
}

async function handleLogin(fastify, socket, payload) {
	const identity = typeof payload.usernameOrEmail === 'string' ? payload.usernameOrEmail.trim() : '';
	const password = typeof payload.password === 'string' ? payload.password : '';
	if (!identity || !password) {
		sendAuthResponse(socket, false, 'Username/email and password are required');
		return;
	}

	try {
		const result = await fastify.pg.query(
			'SELECT id, username, password_hash, role, status FROM users WHERE email = $1 OR username = $1',
			[identity],
		);
		const user = result.rows[0];
		if (!user || user.status !== 'ACTIVE' || !(await bcrypt.compare(password, user.password_hash))) {
			sendAuthResponse(socket, false, 'Invalid username/email or password');
			return;
		}
		sendAuthResponse(socket, true, 'Authenticated', user);
	} catch (error) {
		fastify.log.error({ error }, 'Agent WebSocket login failed');
		sendAuthResponse(socket, false, 'Authentication failed');
	}
}

async function handleRegistration(fastify, socket, payload) {
	const username = typeof payload.username === 'string' ? payload.username.trim() : '';
	const email = typeof payload.email === 'string' ? payload.email.trim() : '';
	const password = typeof payload.password === 'string' ? payload.password : '';
	if (!username || !email || !password) {
		sendAuthResponse(socket, false, 'Username, email, and password are required');
		return;
	}

	let client;
	try {
		const existing = await fastify.pg.query(
			'SELECT id FROM users WHERE email = $1 OR username = $2',
			[email, username],
		);
		if (existing.rows.length > 0) {
			sendAuthResponse(socket, false, 'Email or username is already taken');
			return;
		}

		const passwordHash = await bcrypt.hash(password, 10);
		client = await fastify.pg.connect();
		await client.query('BEGIN');
		const result = await client.query(
			`INSERT INTO users (username, email, password_hash, role, status)
			 VALUES ($1, $2, $3, 'GAMER', 'ACTIVE') RETURNING id, username, role`,
			[username, email, passwordHash],
		);
		const user = result.rows[0];
		await client.query('INSERT INTO wallets (user_id, balance_millimes) VALUES ($1, 0)', [user.id]);
		await client.query('COMMIT');
		sendAuthResponse(socket, true, 'Account created', user);
	} catch (error) {
		if (client) {
			try { await client.query('ROLLBACK'); } catch (_) {}
		}
		if (error.code === '23505') {
			sendAuthResponse(socket, false, 'Email or username is already taken');
		} else {
			fastify.log.error({ error }, 'Agent WebSocket registration failed');
			sendAuthResponse(socket, false, 'Registration failed');
		}
	} finally {
		client?.release();
	}
}

async function websocketRoutes(fastify) {
	fastify.post('/api/stations/:stationId/session-command', {
		preHandler: [fastify.authenticate, fastify.adminOnly],
	}, async (request, reply) => {
		const { stationId } = request.params;
		const { action, sessionId = '', durationSeconds = 0, walletBalance } = request.body || {};

		if (!SessionActions.has(action)) {
			return reply.code(400).send({
				error: `action must be one of: ${[...SessionActions].join(', ')}`,
			});
		}

		const delivered = fastify.sendToStation(stationId, MessageType.SessionCommand, {
			action,
			sessionId,
			durationSeconds,
			...(walletBalance === undefined ? {} : { walletBalance }),
		});

		if (!delivered) return reply.code(404).send({ error: 'Station is not connected' });
		return reply.send({ delivered: true, stationId, type: MessageType.SessionCommand });
	});

	fastify.get('/agent', { websocket: true }, (socket) => {
		let stationId = null;

		const unregister = () => {
			if (!stationId) return;
			const current = fastify.agentConnections.get(stationId);
			if (current?.socket === socket) fastify.agentConnections.delete(stationId);
			stationId = null;
		};

		const registerStation = async (payload) => {
			if (typeof payload.stationId !== 'string' || payload.stationId.trim().length === 0) {
				sendAck(socket, MessageType.StationRegister, false, 'stationId is required');
				return;
			}

			const stationName = typeof payload.stationName === 'string' ? payload.stationName.trim() : '';
			try {
				const result = await fastify.pg.query(
					`SELECT id FROM stations
					 WHERE id::text = $1 OR LOWER(hostname) = LOWER($2)`,
					[payload.stationId.trim(), stationName],
				);
				if (result.rows.length !== 1) {
					sendAck(socket, MessageType.StationRegister, false, 'Station is not registered or hostname is ambiguous');
					return;
				}
				if (socket.readyState !== 1) return;

				unregister();
				stationId = String(result.rows[0].id);
				const previous = fastify.agentConnections.get(stationId);
				if (previous?.socket !== socket) previous?.socket.close(1000, 'Replaced by new connection');

				fastify.agentConnections.set(stationId, {
					socket,
					station: payload,
					connectedAt: new Date().toISOString(),
					lastHeartbeatAt: null,
				});
				fastify.log.info({ stationId }, 'Agent WebSocket registered');
				sendAck(socket, MessageType.StationRegister);
			} catch (error) {
				fastify.log.error({ error }, 'Agent WebSocket station registration failed');
				sendAck(socket, MessageType.StationRegister, false, 'Station registration failed');
			}
		};

		socket.on('message', (rawMessage) => {
			let envelope;
			try {
				envelope = JSON.parse(rawMessage.toString());
			} catch (error) {
				fastify.log.warn({ error }, 'Ignoring malformed agent WebSocket message');
				sendAck(socket, 'INVALID_JSON', false, 'Message must be valid JSON');
				return;
			}

			if (!envelope || typeof envelope.type !== 'string') {
				sendAck(socket, 'INVALID_MESSAGE', false, 'Message type is required');
				return;
			}

			const payload = envelope.payload || {};
			switch (envelope.type) {
				case MessageType.StationRegister:
					void registerStation(payload);
					break;

				case MessageType.ClientHeartbeat: {
					if (!stationId) {
						sendAck(socket, MessageType.ClientHeartbeat, false, 'Register the station first');
						return;
					}
					const connection = fastify.agentConnections.get(stationId);
					if (!connection || connection.socket !== socket) {
						sendAck(socket, MessageType.ClientHeartbeat, false, 'Station connection was replaced');
						return;
					}
					connection.lastHeartbeatAt = new Date().toISOString();
					connection.heartbeat = payload;
					sendAck(socket, MessageType.ClientHeartbeat);
					break;
				}

				case MessageType.SecurityAlert:
					if (!stationId) {
						sendAck(socket, MessageType.SecurityAlert, false, 'Register the station first');
						return;
					}
					if (fastify.agentConnections.get(stationId)?.socket !== socket) {
						sendAck(socket, MessageType.SecurityAlert, false, 'Station connection was replaced');
						return;
					}
					fastify.log.warn({ stationId, alert: payload }, 'Security alert received from agent');
					sendAck(socket, MessageType.SecurityAlert);
					break;

				case MessageType.AuthLogin:
					void handleLogin(fastify, socket, payload);
					break;

				case MessageType.AuthRegister:
					void handleRegistration(fastify, socket, payload);
					break;

				default:
					fastify.log.debug({ stationId, type: envelope.type }, 'Unhandled agent WebSocket message');
					sendAck(socket, envelope.type, false, 'Unsupported message type');
			}
		});

		socket.on('close', unregister);
		socket.on('error', (error) => {
			fastify.log.warn({ error, stationId }, 'Agent WebSocket error');
			unregister();
		});
	});
}

module.exports = websocketRoutes;
