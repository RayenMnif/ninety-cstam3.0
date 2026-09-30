// ws.js
const { agentWebSocketSchema } = require('../schemas/ws.schema');

const MessageType = Object.freeze({
	Ack: 'ACK',
	StationRegister: 'STATION_REGISTER',
	ClientHeartbeat: 'CLIENT_HEARTBEAT',
	SecurityAlert: 'SECURITY_ALERT',
	SessionCommand: 'SESSION_COMMAND',
	AuthLogin: 'AUTH_LOGIN',
	AuthRegister: 'AUTH_REGISTER',
});

function sendAck(socket, messageType, success = true, message = '') {
	const ws = socket.socket || socket;
	if (ws.readyState !== 1) return;
	try {
		ws.send(JSON.stringify({
			type: MessageType.Ack,
			Type: MessageType.Ack,
			payload: { messageId: messageType, success, message, Success: success, Message: message },
			Payload: { messageId: messageType, success, message, Success: success, Message: message },
		}));
	} catch (_) {}
}

async function websocketRoutes(fastify) {
	fastify.get('/agent', {
		websocket: true,
		schema: agentWebSocketSchema,
	}, (socket) => {

		// DYNAMIC UNREGISTER: Uses socket.stationId instead of closed variable
		const unregister = () => {
			const sid = socket.stationId;
			if (!sid || !fastify.agentConnections) return;
			
			const current = fastify.agentConnections.get(sid);
			if (current?.socket === socket) {
				fastify.agentConnections.delete(sid);
			}
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
						// Ensure authHandler has access to agentConnections
						fastify.authHandler.agentConnections = fastify.agentConnections;
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
					const sid = payload?.stationId || payload?.StationId;
					const mac = payload?.macAddress || payload?.MacAddress || payload?.mac_address || payload?.Mac || 'UNKNOWN_MAC';

					if (typeof sid !== 'string' || sid.length === 0) {
						sendAck(socket, 'STATION_REGISTER', false, 'stationId is required');
						return;
					}

					socket.stationId = sid;
					socket.macAddress = mac;

					if (fastify.agentConnections) {
						fastify.agentConnections.set(sid, {
							socket: socket,
							hostname: payload.hostname || payload.Hostname || 'Unknown',
							macAddress: mac
						});
					}

					fastify.log.info({ stationId: sid, macAddress: mac }, 'Agent WebSocket registered');
					sendAck(socket, 'STATION_REGISTER', true, 'Station registered successfully');
					break;
				}

				case MessageType.ClientHeartbeat:
				case 'CLIENT_HEARTBEAT': {
					const sid = socket.stationId;
					if (!sid) {
						sendAck(socket, MessageType.ClientHeartbeat, false, 'Register the station first');
						return;
					}
					const conn = fastify.agentConnections?.get(sid);
					if (conn) {
						conn.lastHeartbeatAt = new Date().toISOString();
						conn.heartbeat = payload;
					}
					sendAck(socket, MessageType.ClientHeartbeat);
					break;
				}

				case MessageType.SecurityAlert:
				case 'SECURITY_ALERT':
					if (!socket.stationId) {
						sendAck(socket, MessageType.SecurityAlert, false, 'Register the station first');
						return;
					}
					fastify.log.warn({ stationId: socket.stationId, alert: payload }, 'Security alert received from agent');
					sendAck(socket, MessageType.SecurityAlert);
					break;

				default:
					fastify.log.debug({ stationId: socket.stationId, type: messageType }, 'Unhandled agent WebSocket message');
					sendAck(socket, messageType, false, 'Unsupported message type');
			}
		});

		socket.on('close', unregister);
		socket.on('error', (error) => {
			fastify.log.warn({ error, stationId: socket.stationId }, 'Agent WebSocket error');
			unregister();
		});
	});
}

module.exports = websocketRoutes;