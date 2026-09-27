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
			Type: MessageType.Ack,
			payload: { messageId: messageType, success, message, Success: success, Message: message },
			Payload: { messageId: messageType, success, message, Success: success, Message: message },
		}));
	} catch (_) {
		// The agent may disconnect between message processing and the ACK.
	}
}

async function websocketRoutes(fastify) {
	fastify.get('/agent', {
		websocket: true,
		schema: {
			summary: 'Station Agent WebSocket Handshake',
			description: 'Establishes a real-time bi-directional WebSocket connection for desktop station kiosk agent telemetry, heartbeats, security alerts, and lock/unlock commands.',
			tags: ['WebSocket'],
			response: {
				101: {
					description: 'Switching Protocols to WebSocket connection.',
					type: 'string',
				},
			},
		},
	}, (socket) => {
		let stationId = null;

		const unregister = () => {
			if (!stationId) return;
			const current = fastify.agentConnections.get(stationId);
			if (current?.socket === socket) fastify.agentConnections.delete(stationId);
			stationId = null;
		};

		socket.on('message', async (rawMessage) => {
			let envelope;
			try {
				envelope = JSON.parse(rawMessage.toString());
			} catch (error) {
				fastify.log.warn({ error }, 'Ignoring malformed agent WebSocket message');
				sendAck(socket, 'INVALID_JSON', false, 'Message must be valid JSON');
				return;
			}

			// Support de la casse C# (Type / Payload) et JS/Postman (type / payload)
			const messageType = envelope?.type || envelope?.Type;
			const payload = envelope?.payload || envelope?.Payload || {};

			if (!messageType || typeof messageType !== 'string') {
				sendAck(socket, 'INVALID_MESSAGE', false, 'Message type is required');
				return;
			}

			fastify.log.info({ type: messageType }, 'WebSocket message received');

			switch (messageType) {
				case MessageType.AuthLogin:
				case 'AUTH_LOGIN':
					if (fastify.authHandler) {
						await fastify.authHandler.handleLogin(socket, payload);
					} else {
						fastify.log.error('authHandler is not registered on fastify instance');
						sendAck(socket, 'AUTH_LOGIN', false, 'Auth service unavailable');
					}
					break;

				case MessageType.AuthRegister:
				case 'AUTH_REGISTER':
					if (fastify.authHandler) {
						await fastify.authHandler.handleRegister(socket, payload);
					} else {
						fastify.log.error('authHandler is not registered on fastify instance');
						sendAck(socket, 'AUTH_REGISTER', false, 'Auth service unavailable');
					}
					break;

				case MessageType.StationRegister:
				case 'STATION_REGISTER': {
					const stationIdVal = payload.stationId || payload.StationId;
					if (typeof stationIdVal !== 'string' || stationIdVal.length === 0) {
						sendAck(socket, MessageType.StationRegister, false, 'stationId is required');
						return;
					}

					unregister();
					stationId = stationIdVal;
					const previous = fastify.agentConnections?.get(stationId);
					if (previous?.socket !== socket) previous?.socket.close(1000, 'Replaced by new connection');

					if (fastify.agentConnections) {
						fastify.agentConnections.set(stationId, {
							socket,
							station: payload,
							connectedAt: new Date().toISOString(),
							lastHeartbeatAt: null,
						});
					}
					fastify.log.info({ stationId }, 'Agent WebSocket registered');
					sendAck(socket, MessageType.StationRegister);
					break;
				}

				case MessageType.ClientHeartbeat:
				case 'CLIENT_HEARTBEAT': {
					if (!stationId) {
						sendAck(socket, MessageType.ClientHeartbeat, false, 'Register the station first');
						return;
					}
					const conn = fastify.agentConnections?.get(stationId);
					if (conn) {
						conn.lastHeartbeatAt = new Date().toISOString();
						conn.heartbeat = payload;
					}
					sendAck(socket, MessageType.ClientHeartbeat);
					break;
				}

				case MessageType.SecurityAlert:
				case 'SECURITY_ALERT':
					if (!stationId) {
						sendAck(socket, MessageType.SecurityAlert, false, 'Register the station first');
						return;
					}
					fastify.log.warn({ stationId, alert: payload }, 'Security alert received from agent');
					sendAck(socket, MessageType.SecurityAlert);
					break;

				default:
					fastify.log.debug({ stationId, type: messageType }, 'Unhandled agent WebSocket message');
					sendAck(socket, messageType, false, 'Unsupported message type');
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