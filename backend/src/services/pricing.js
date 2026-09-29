const DEFAULT_RATE_PER_HOUR_MILLIMES = 3000;
const SECONDS_PER_HOUR = 3600n;

function toNonNegativeBigInt(value, name) {
	try {
		const integer = BigInt(value);
		if (integer < 0n) throw new Error();
		return integer;
	} catch {
		throw new TypeError(`${name} must be a non-negative integer`);
	}
}

function calculateRemainingSeconds(balanceMillimes, ratePerHourMillimes = DEFAULT_RATE_PER_HOUR_MILLIMES) {
	const balance = toNonNegativeBigInt(balanceMillimes, 'balanceMillimes');
	const rate = toNonNegativeBigInt(ratePerHourMillimes, 'ratePerHourMillimes');
	if (rate === 0n) throw new RangeError('ratePerHourMillimes must be greater than zero');

	return Number((balance * SECONDS_PER_HOUR) / rate);
}

function calculateCostMillimes(elapsedSeconds, ratePerHourMillimes = DEFAULT_RATE_PER_HOUR_MILLIMES) {
	const elapsed = toNonNegativeBigInt(elapsedSeconds, 'elapsedSeconds');
	const rate = toNonNegativeBigInt(ratePerHourMillimes, 'ratePerHourMillimes');
	if (rate === 0n) throw new RangeError('ratePerHourMillimes must be greater than zero');

	return Number((elapsed * rate + SECONDS_PER_HOUR - 1n) / SECONDS_PER_HOUR);
}

function millimesToTnd(millimes) {
	const amount = toNonNegativeBigInt(millimes, 'millimes');
	return Number((Number(amount) / 1000).toFixed(3));
}

module.exports = {
	DEFAULT_RATE_PER_HOUR_MILLIMES,
	calculateRemainingSeconds,
	calculateCostMillimes,
	millimesToTnd,
};
