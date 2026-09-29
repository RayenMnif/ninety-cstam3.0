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
		schema: agentWebSocketSchema,
	}, (socket) => {
		let stationId = null;

		const unregister = () => {
    if (!stationId || !fastify.agentConnections) return;
    
    const current = fastify.agentConnections.get(stationId);
    if (current?.socket === socket) {
        fastify.agentConnections.delete(stationId);
    }
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
    // 🔍 Debug log: Print exact payload received from C#
    fastify.log.info({ rawPayload: payload }, '[WS DEBUG] STATION_REGISTER raw payload');

    const sid = payload?.stationId || payload?.StationId;
    const mac = payload?.macAddress || payload?.MacAddress || payload?.mac_address || payload?.Mac || 'UNKNOWN_MAC';

    if (typeof sid !== 'string' || sid.length === 0) {
        sendAck(socket, 'STATION_REGISTER', false, 'stationId is required');
        return;
    }

    stationId = sid;
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