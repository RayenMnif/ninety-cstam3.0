const assert = require('node:assert/strict');
const Fastify = require('fastify');
const { test } = require('node:test');
const websocketPlugin = require('../src/plugins/websocket');
const billingPlugin = require('../src/plugins/billing');

async function runBillingScenario(balanceMillimes, elapsedSeconds) {
	const app = Fastify({ logger: false });
	const messages = [];
	const events = [];
	const socket = {
		readyState: 1,
		send: (message) => {
			messages.push(JSON.parse(message));
			events.push('send');
		},
	};

	app.decorate('pg', {
		connect: async () => ({
			query: async (sql, params) => {
				const query = sql.trim();
				events.push(query.split(/\s+/)[0]);
				if (query.startsWith('SELECT s.id')) {
					return {
						rows: [{
							id: 'session-1',
							station_id: 'station-1',
							user_id: 'user-1',
							balance_millimes: String(balanceMillimes),
							elapsed_seconds: String(elapsedSeconds),
						}],
					};
				}
				if (query.startsWith('UPDATE wallets')) events.push(`wallet:${params[0]}`);
				if (query.startsWith('UPDATE sessions')) events.push('session-update');
				if (query === 'COMMIT') events.push('committed');
				return { rows: [] };
			},
			release: () => events.push('released'),
		}),
	});

	await app.register(websocketPlugin);
	app.agentConnections.set('station-1', { socket });
	await app.register(billingPlugin);
	await app.close();

	return { messages, events };
}

test('billing commits the wallet debit before sending a TICK with TND balance', async () => {
	const { messages, events } = await runBillingScenario(10000, 10);

	assert.deepEqual(messages, [{
		type: 'SESSION_COMMAND',
		payload: {
			action: 'TICK',
			sessionId: 'session-1',
			durationSeconds: 11989,
			walletBalance: 9.991,
		},
	}]);
	assert.ok(events.indexOf('committed') < events.indexOf('send'));
	assert.ok(events.includes('wallet:9991'));
});

test('billing completes and locks a session when its wallet is exhausted', async () => {
	const { messages, events } = await runBillingScenario(5, 10);

	assert.deepEqual(messages, [{
		type: 'SESSION_COMMAND',
		payload: {
			action: 'LOCK',
			sessionId: 'session-1',
			durationSeconds: 0,
			walletBalance: 0,
		},
	}]);
	assert.ok(events.indexOf('committed') < events.indexOf('send'));
	assert.ok(events.includes('wallet:0'));
});