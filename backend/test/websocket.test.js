const Fastify = require('fastify');
const websocket = require('@fastify/websocket');
const WebSocket = require('ws');
const bcrypt = require('bcryptjs');
const { once } = require('node:events');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const websocketPlugin = require('../src/plugins/websocket');
const websocketRoutes = require('../src/routes/ws');
const sessionRoutes = require('../src/routes/sessions');

function receiveMessage(socket) {
	return new Promise((resolve, reject) => {
		socket.once('message', (message) => resolve(JSON.parse(message.toString())));
		socket.once('error', reject);
	});
}

test('station agent handles registration, heartbeats, sessions, and authentication', async (t) => {
	const app = Fastify({ logger: false });
	const passwordHash = await bcrypt.hash('correct-password', 4);
	const registeredUser = { id: 'user-1', username: 'player', email: 'player@example.test', password_hash: passwordHash, role: 'GAMER', status: 'ACTIVE' };
	app.decorate('pg', {
		query: async (sql, params) => {
			if (sql.includes('FROM stations')) return { rows: [{ id: 'station-1' }] };
			if (sql.includes('password_hash')) {
				const user = [registeredUser].find((row) => row.username === params[0] || row.email === params[0]);
				return { rows: user ? [user] : [] };
			}
			return { rows: [] };
		},
		connect: async () => ({
			query: async (sql, params) => {
				if (sql.includes('SELECT balance_millimes FROM wallets')) {
					return { rows: [{ balance_millimes: '25000' }] };
				}
				if (sql.includes('FROM tariffs')) return { rows: [{ id: 'tariff-1' }] };
				if (sql.includes('INSERT INTO sessions')) {
					return { rows: [{ id: 'session-3', station_id: 'station-1', customer_id: 'user-1', tariff_id: 'tariff-1' }] };
				}
				if (sql.includes('RETURNING id, username, role')) {
					return { rows: [{ id: 'user-2', username: params[0], role: 'GAMER' }] };
				}
				return { rows: [] };
			},
			release: () => {},
		}),
	});
	await app.register(websocket);
	await app.register(websocketPlugin);
	app.decorate('authenticate', async (request) => { request.user = { id: 'user-1', role: 'GAMER' }; });
	app.decorate('adminOnly', async () => {});
	await app.register(websocketRoutes);
	await app.register(sessionRoutes, { prefix: '/api/sessions' });
	await app.listen({ host: '127.0.0.1', port: 0 });

	const address = app.server.address();
	const socket = new WebSocket(`ws://127.0.0.1:${address.port}/agent`);
	t.after(async () => {
		socket.close();
		await app.close();
	});
	await once(socket, 'open');

	let response = receiveMessage(socket);
	socket.send(JSON.stringify({
		type: 'STATION_REGISTER',
		payload: { stationId: 'temporary-agent-id', stationName: 'Test Station' },
	}));
	assert.deepEqual(await response, {
		type: 'ACK',
		payload: { messageId: 'STATION_REGISTER', success: true, message: '' },
	});
	assert.equal(app.agentConnections.get('station-1').station.stationName, 'Test Station');

	response = receiveMessage(socket);
	socket.send(JSON.stringify({
		type: 'CLIENT_HEARTBEAT',
		payload: { stationId: 'station-1', agentState: 'locked' },
	}));
	assert.deepEqual(await response, {
		type: 'ACK',
		payload: { messageId: 'CLIENT_HEARTBEAT', success: true, message: '' },
	});
	assert.equal(app.agentConnections.get('station-1').heartbeat.agentState, 'locked');
	assert.ok(app.agentConnections.get('station-1').lastHeartbeatAt);

	response = receiveMessage(socket);
	const commandResponse = await app.inject({
		method: 'POST',
		url: '/api/stations/station-1/session-command',
		payload: { action: 'PAUSE', sessionId: 'session-1', durationSeconds: 60 },
	});
	assert.equal(commandResponse.statusCode, 200);
	assert.deepEqual(JSON.parse(commandResponse.body), {
		delivered: true,
		stationId: 'station-1',
		type: 'SESSION_COMMAND',
	});
	assert.deepEqual(await response, {
		type: 'SESSION_COMMAND',
		payload: { action: 'PAUSE', sessionId: 'session-1', durationSeconds: 60 },
	});

	response = receiveMessage(socket);
	assert.equal(app.sendToStation('station-1', 'SESSION_COMMAND', {
		action: 'START', sessionId: 'session-2', walletBalance: 25000n,
	}), true);
	assert.deepEqual(await response, {
		type: 'SESSION_COMMAND',
		payload: { action: 'START', sessionId: 'session-2', walletBalance: '25000' },
	});

	response = receiveMessage(socket);
	const sessionStartResponse = await app.inject({
		method: 'POST',
		url: '/api/sessions/start',
		payload: { stationId: 'station-1', tariffId: 'tariff-1' },
	});
	assert.equal(sessionStartResponse.statusCode, 201, sessionStartResponse.body);
	assert.equal(JSON.parse(sessionStartResponse.body).walletBalance, '25000');
	assert.deepEqual(await response, {
		type: 'SESSION_COMMAND',
		payload: { action: 'START', sessionId: 'session-3', walletBalance: '25000' },
	});

	response = receiveMessage(socket);
	socket.send(JSON.stringify({
		type: 'AUTH_LOGIN',
		payload: { usernameOrEmail: 'player', password: 'correct-password' },
	}));
	assert.deepEqual(await response, {
		type: 'AUTH_RESPONSE',
		payload: { success: true, message: 'Authenticated', userId: 'user-1', username: 'player', role: 'GAMER' },
	});

	response = receiveMessage(socket);
	socket.send(JSON.stringify({
		type: 'AUTH_REGISTER',
		payload: { username: 'new-player', email: 'new@example.test', password: 'new-password', role: 'ADMIN' },
	}));
	assert.deepEqual(await response, {
		type: 'AUTH_RESPONSE',
		payload: { success: true, message: 'Account created', userId: 'user-2', username: 'new-player', role: 'GAMER' },
	});
});