const agentWebSocketSchema = {
	summary: 'Station Agent WebSocket Handshake',
	description: 'Establishes a real-time bi-directional WebSocket connection for desktop station kiosk agent telemetry, heartbeats, security alerts, and lock/unlock commands.',
	tags: ['WebSocket'],
	response: {
		101: {
			description: 'Switching Protocols to WebSocket connection.',
			type: 'string',
		},
	},
};

module.exports = {
	agentWebSocketSchema,
};
