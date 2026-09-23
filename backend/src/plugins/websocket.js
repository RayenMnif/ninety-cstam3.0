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

async function websocketPlugin(fastify) {
	fastify.decorate('agentConnections', connections);
	fastify.decorate('sendToStation', (stationId, type, payload) => {
		const connection = connections.get(stationId);
		return connection ? sendEnvelope(connection.socket, type, payload) : false;
	});
}

module.exports = fp(websocketPlugin, { name: 'agent-websocket-state' });
