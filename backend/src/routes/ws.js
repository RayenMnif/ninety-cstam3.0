const MessageType = Object.freeze({
	Ack: 'ACK',
	StationRegister: 'STATION_REGISTER',
	ClientHeartbeat: 'CLIENT_HEARTBEAT',
	SecurityAlert: 'SECURITY_ALERT',
	SessionCommand: 'SESSION_COMMAND',
});

const SessionActions = new Set(['START', 'PAUSE', 'LOCK', 'UNLOCK']);

function requireAdmin(request, reply) {
	if (request.user?.role !== 'ADMIN') {
		return reply.code(403).send({ error: 'Administrator access required' });
	}
}

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

async function websocketRoutes(fastify) {
	fastify.post('/api/stations/:stationId/session-command', {
		preHandler: [fastify.authenticate, requireAdmin],
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
				case MessageType.StationRegister: {
					if (typeof payload.stationId !== 'string' || payload.stationId.length === 0) {
						sendAck(socket, MessageType.StationRegister, false, 'stationId is required');
						return;
					}

					unregister();
					stationId = payload.stationId;
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
					break;
				}

				case MessageType.ClientHeartbeat: {
					if (!stationId) {
						sendAck(socket, MessageType.ClientHeartbeat, false, 'Register the station first');
						return;
					}
					const connection = fastify.agentConnections.get(stationId);
					if (connection) {
						connection.lastHeartbeatAt = new Date().toISOString();
						connection.heartbeat = payload;
					}
					sendAck(socket, MessageType.ClientHeartbeat);
					break;
				}

				case MessageType.SecurityAlert:
					if (!stationId) {
						sendAck(socket, MessageType.SecurityAlert, false, 'Register the station first');
						return;
					}
					fastify.log.warn({ stationId, alert: payload }, 'Security alert received from agent');
					sendAck(socket, MessageType.SecurityAlert);
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
