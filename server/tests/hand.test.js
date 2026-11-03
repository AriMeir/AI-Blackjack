import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handTotal, handValue, formatHand, describeTotal } from '../hand.js';
import { hand } from './helpers.js';

test('A+K totals 21', () => assert.equal(handTotal(hand('A', 'K')), 21));
test('A+A+9 totals 21', () => assert.equal(handTotal(hand('A', 'A', '9')), 21));
test('K+Q+5 totals 25 (bust)', () => assert.equal(handTotal(hand('K', 'Q', '5')), 25));

test('A+6 is a soft 17', () => assert.deepEqual(handValue(hand('A', '6')), { total: 17, soft: true }));
test('A+6+10 is a hard 17', () => assert.deepEqual(handValue(hand('A', '6', '10')), { total: 17, soft: false }));
test('10+7 is a hard 17', () => assert.deepEqual(handValue(hand('10', '7')), { total: 17, soft: false }));

test('formatHand lists the cards', () => {
  assert.equal(formatHand([{ rank: '10', suit: '♠' }, { rank: '6', suit: '♥' }]), '10♠, 6♥');
});

test('describeTotal says "soft" for a soft hand', () => {
  assert.equal(describeTotal(hand('A', '6')), 'soft 17');
  assert.equal(describeTotal(hand('10', '6')), '16');
  assert.equal(describeTotal(hand('A', '6', '10')), '17');
});
