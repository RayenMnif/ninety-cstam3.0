const fp = require('fastify-plugin');

const connections = new Map();

function sendEnvelope(socket, type, payload) {
	if (socket.readyState !== 1) return false;

	try {
		socket.send(JSON.stringify({ type, payload }));
		return true;
	} catch (error) {
		return false;
	}
}

async function websocketPlugin(fastify, opts) {
  // Map of stationId -> WebSocket instance
  const activeStations = new Map();

  // Helper to register a station's socket when it connects
  fastify.decorate('registerStationSocket', (stationId, socket) => {
    activeStations.set(stationId, socket);
    fastify.log.info(`[WS] Station registered: ${stationId}`);
  });

  // Helper to remove a station's socket when it disconnects
  fastify.decorate('unregisterStationSocket', (stationId) => {
    if (activeStations.has(stationId)) {
      activeStations.delete(stationId);
      fastify.log.info(`[WS] Station unregistered: ${stationId}`);
    }
  });
  if (!fastify.hasDecorator('agentConnections')) {
  fastify.decorate('agentConnections', new Map());
}
  // Function called inside station.js
fastify.decorate('sendToStation', (stationId, type, payload) => {
  const conn = fastify.agentConnections.get(stationId);
  const targetSocket = conn?.socket;

  // Gestion de la comptabilité Fastify @fastify/websocket (raw WebSocket)
  const ws = targetSocket?.socket || targetSocket;

  if (ws && ws.readyState === 1) {
    const envelope = {
      type: type,
      Type: type,
      payload: payload,
      Payload: payload,
    };
    ws.send(JSON.stringify(envelope));
    return true; // Envoi réussi  } catch (err) {
    fastify.log.error(`[WS] Failed to send message to ${stationId}:`, err);
    return false;
  }
});
}

module.exports = fp(websocketPlugin, { name: 'agent-websocket-state' });
