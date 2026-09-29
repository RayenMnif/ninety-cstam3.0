const fp = require('fastify-plugin');
const {
	DEFAULT_RATE_PER_HOUR_MILLIMES,
	calculateCostMillimes,
	calculateRemainingSeconds,
	millimesToTnd,
} = require('../services/pricing');

const BILLING_INTERVAL_MS = 10_000;

async function billingPlugin(fastify) {
	let interval;
	let tickInProgress = false;
	let inFlight = Promise.resolve();

	async function processBillingTick() {
		const client = await fastify.pg.connect();
		const commands = [];
		let transactionStarted = false;

		try {
			await client.query('BEGIN');
			transactionStarted = true;

			// Lock each session and wallet so concurrent workers cannot bill the same interval twice.
			const { rows } = await client.query(`
				SELECT s.id, s.station_id::text AS station_id, s.user_id,
				       w.balance_millimes,
				       FLOOR(EXTRACT(EPOCH FROM (NOW() - s.last_tick_at)))::BIGINT AS elapsed_seconds
				FROM sessions AS s
				JOIN wallets AS w ON w.user_id = s.user_id
				WHERE s.status = 'ACTIVE'
				FOR UPDATE OF s, w SKIP LOCKED
			`);

			for (const session of rows) {
				const balance = BigInt(session.balance_millimes);
				const elapsedSeconds = BigInt(session.elapsed_seconds || 0);
				const cost = BigInt(calculateCostMillimes(elapsedSeconds, DEFAULT_RATE_PER_HOUR_MILLIMES));
				const remainingBalance = balance > cost ? balance - cost : 0n;
				const completed = remainingBalance === 0n;

				if (cost > 0n) {
					await client.query(
						`UPDATE wallets
						 SET balance_millimes = $1, updated_at = NOW()
						 WHERE user_id = $2`,
						[remainingBalance.toString(), session.user_id]
					);
				}

				await client.query(
					`UPDATE sessions
					 SET last_tick_at = last_tick_at + ($1 * INTERVAL '1 second'),
					     status = CASE WHEN $2 THEN 'COMPLETED' ELSE status END,
					     ended_at = CASE WHEN $2 THEN NOW() ELSE ended_at END
					 WHERE id = $3`,
					[elapsedSeconds.toString(), completed, session.id]
				);

				commands.push({
					stationId: session.station_id,
					payload: completed
						? { action: 'LOCK', sessionId: session.id, durationSeconds: 0, walletBalance: 0 }
						: {
							action: 'TICK',
							sessionId: session.id,
							durationSeconds: calculateRemainingSeconds(remainingBalance, DEFAULT_RATE_PER_HOUR_MILLIMES),
							walletBalance: millimesToTnd(remainingBalance),
						},
				});
			}

			await client.query('COMMIT');
			transactionStarted = false;
		} catch (error) {
			if (transactionStarted) {
				try {
					await client.query('ROLLBACK');
				} catch (rollbackError) {
					fastify.log.error({ err: rollbackError }, 'Failed to roll back billing transaction');
				}
			}
			throw error;
		} finally {
			client.release();
		}

		// Send only after commit so agents never receive an uncommitted wallet balance.
		for (const command of commands) {
			try {
				fastify.sendToStation(command.stationId, 'SESSION_COMMAND', command.payload);
			} catch (error) {
				fastify.log.error({ err: error, stationId: command.stationId }, 'Failed to send billing command to station');
			}
		}
	}

	function runBillingTick() {
		if (tickInProgress) return;
		tickInProgress = true;
		inFlight = processBillingTick()
			.catch((error) => fastify.log.error({ err: error }, 'Billing tick failed'))
			.finally(() => { tickInProgress = false; });
	}

	fastify.addHook('onClose', async () => {
		clearInterval(interval);
		await inFlight;
	});

	runBillingTick();
	interval = setInterval(runBillingTick, BILLING_INTERVAL_MS);
	interval.unref?.();
}

module.exports = fp(billingPlugin, {
	name: 'billing',
	dependencies: ['agent-websocket-state'],
});