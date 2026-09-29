const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
	DEFAULT_RATE_PER_HOUR_MILLIMES,
	calculateCostMillimes,
	calculateRemainingSeconds,
	millimesToTnd,
} = require('../src/services/pricing');

test('pricing calculations use millimes and round elapsed cost up', () => {
	assert.equal(DEFAULT_RATE_PER_HOUR_MILLIMES, 3000);
	assert.equal(calculateRemainingSeconds(3000), 3600);
	assert.equal(calculateRemainingSeconds('1'), 1);
	assert.equal(calculateCostMillimes(3600), 3000);
	assert.equal(calculateCostMillimes(1), 1);
	assert.equal(calculateCostMillimes(0), 0);
	assert.equal(millimesToTnd('12500'), 12.5);
	assert.equal(millimesToTnd(5), 0.005);
});

test('pricing calculations reject invalid balances, durations, and rates', () => {
	assert.throws(() => calculateRemainingSeconds(1, 0), RangeError);
	assert.throws(() => calculateCostMillimes(1, 0), RangeError);
	assert.throws(() => calculateCostMillimes(-1), TypeError);
	assert.throws(() => millimesToTnd('not-an-integer'), TypeError);
});