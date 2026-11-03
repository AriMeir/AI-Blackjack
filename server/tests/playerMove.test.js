import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../app.js';
import { AgentError } from '../agent/callAgent.js';
import { c, hand } from './helpers.js';

// The route is exercised over real HTTP on a random local port, with fake agents.
let server;
let baseUrl;
let playerBehavior;
let dealerCalls = 0;
const calls = [];

before(async () => {
  const getPlayerAgent = () => ({
    decide: async (board) => {
      calls.push(board);
      return playerBehavior(board);
    },
  });
  const getAgent = () => ({
    decide: async () => {
      dealerCalls++;
      return {};
    },
  });
  server = createApp({ getAgent, getPlayerAgent }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://localhost:${server.address().port}`;
});

after(() => server.close());

async function post(body, { raw } = {}) {
  const response = await fetch(`${baseUrl}/api/player-move`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: raw ?? JSON.stringify(body),
  });
  return { status: response.status, json: await response.json() };
}

const goodBoard = { playerHand: hand('10', '6'), dealerUpcard: c('9', '♦') };
const decision = { action: 'hit', explanation: 'I have 16.', playerTotal: 16 };

function useAgent(behavior) {
  calls.length = 0;
  playerBehavior = behavior;
}

test('valid board returns the agent decision', async () => {
  useAgent(async () => decision);
  const { status, json } = await post(goodBoard);
  assert.equal(status, 200);
  assert.deepEqual(json, decision);
  assert.deepEqual(calls, [goodBoard], 'the agent receives exactly the player hand and the dealer upcard');
});

test('the dealer agent is not involved', async () => {
  useAgent(async () => decision);
  const callsBefore = dealerCalls;
  await post(goodBoard);
  assert.equal(dealerCalls, callsBefore);
});

test('a player on 21 is a valid board', async () => {
  useAgent(async () => ({ ...decision, action: 'stand' }));
  const { status } = await post({ ...goodBoard, playerHand: hand('7', '7', '7') });
  assert.equal(status, 200);
});

test("the dealer's hidden card can never be sent to the player agent", async () => {
  useAgent(async () => decision);
  const { status, json } = await post({ ...goodBoard, dealerHand: [c('9', '♦'), c('K', '♥')] });
  assert.equal(status, 400);
  assert.equal(json.error.code, 'invalid_board');
  assert.match(json.error.message, /face-down card must not be shared/);
  assert.equal(calls.length, 0);
});

const badBoards = {
  'missing playerHand': { dealerUpcard: c('9') },
  'missing dealerUpcard': { playerHand: hand('10', '6') },
  'dealerUpcard is a list of cards': { ...goodBoard, dealerUpcard: [c('9'), c('K')] },
  'dealerUpcard is not a card': { ...goodBoard, dealerUpcard: 'nine' },
  'dealerUpcard has an unknown rank': { ...goodBoard, dealerUpcard: c('Z') },
  'dealerUpcard has an unknown suit': { ...goodBoard, dealerUpcard: { rank: '9', suit: 'x' } },
  'player has one card': { ...goodBoard, playerHand: [c('10')] },
  'player has an invalid card': { ...goodBoard, playerHand: [c('10'), c('Z')] },
  'player has too many cards': { ...goodBoard, playerHand: Array(13).fill(c('2')) },
  'player already busted': { ...goodBoard, playerHand: hand('K', 'Q', '5') },
  'body is an array': [],
};

for (const [name, body] of Object.entries(badBoards)) {
  test(`invalid board is rejected with 400: ${name}`, async () => {
    useAgent(async () => decision);
    const { status, json } = await post(body);
    assert.equal(status, 400);
    assert.equal(json.error.code, 'invalid_board');
    assert.equal(calls.length, 0, 'agent must not be called for an invalid board');
  });
}

test('malformed JSON is rejected with 400', async () => {
  useAgent(async () => decision);
  const { status, json } = await post(null, { raw: '{not json' });
  assert.equal(status, 400);
  assert.equal(json.error.code, 'invalid_json');
});

for (const [code, expectedStatus] of [
  ['timeout', 504],
  ['api_error', 502],
  ['refusal', 502],
  ['truncated', 502],
  ['no_tool_call', 502],
  ['invalid_output', 502],
]) {
  test(`agent error "${code}" maps to HTTP ${expectedStatus}`, async (t) => {
    t.mock.method(console, 'error', () => {});
    useAgent(async () => {
      throw new AgentError(code, `${code} happened`);
    });
    const { status, json } = await post(goodBoard);
    assert.equal(status, expectedStatus);
    assert.equal(json.error.code, code);
  });
}

test('an unexpected error maps to 500 without leaking details', async (t) => {
  t.mock.method(console, 'error', () => {});
  useAgent(async () => {
    throw new Error('secret internal detail');
  });
  const { status, json } = await post(goodBoard);
  assert.equal(status, 500);
  assert.ok(!JSON.stringify(json).includes('secret'));
});
