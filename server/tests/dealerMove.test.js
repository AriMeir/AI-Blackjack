import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../app.js';
import { DealerAgentError } from '../agent/dealerAgent.js';
import { c, hand } from './helpers.js';

// The route is exercised over real HTTP on a random local port, with a fake agent.
let server;
let baseUrl;
let agentBehavior;
const calls = [];

before(async () => {
  const getAgent = () => ({
    decide: async (board) => {
      calls.push(board);
      return agentBehavior(board);
    },
  });
  server = createApp({ getAgent }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://localhost:${server.address().port}`;
});

after(() => server.close());

async function post(body, { raw } = {}) {
  const response = await fetch(`${baseUrl}/api/dealer-move`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: raw ?? JSON.stringify(body),
  });
  return { status: response.status, json: await response.json() };
}

const goodBoard = { dealerHand: hand('10', '6'), playerHand: hand('10', '9') };
const decision = { action: 'hit', explanation: 'I have 16.', dealerTotal: 16 };

function useAgent(behavior) {
  calls.length = 0;
  agentBehavior = behavior;
}

test('valid board returns the agent decision', async () => {
  useAgent(async () => decision);
  const { status, json } = await post(goodBoard);
  assert.equal(status, 200);
  assert.deepEqual(json, decision);
  assert.deepEqual(calls, [goodBoard], 'agent receives exactly the dealer and player hands');
});

test('a dealer on 21 is a valid board', async () => {
  useAgent(async () => ({ ...decision, action: 'stand' }));
  const { status } = await post({ ...goodBoard, dealerHand: hand('A', 'K') });
  assert.equal(status, 200);
});

const badBoards = {
  'missing dealerHand': { playerHand: hand('10', '9') },
  'missing playerHand': { dealerHand: hand('10', '6') },
  'dealerHand not an array': { ...goodBoard, dealerHand: 'K♠ 6♠' },
  'dealer has one card': { ...goodBoard, dealerHand: [c('10')] },
  'player has no cards': { ...goodBoard, playerHand: [] },
  'unknown rank': { ...goodBoard, dealerHand: [c('10'), c('Z')] },
  'unknown suit': { ...goodBoard, playerHand: [c('10'), c('9', 'x')] },
  'null card': { ...goodBoard, playerHand: [null, c('9')] },
  'too many cards': { ...goodBoard, dealerHand: Array(13).fill(c('2')) },
  'dealer already busted': { ...goodBoard, dealerHand: hand('K', 'Q', '5') },
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

const errorStatuses = [
  ['timeout', 504],
  ['api_error', 502],
  ['refusal', 502],
  ['truncated', 502],
  ['no_tool_call', 502],
  ['invalid_output', 502],
];

for (const [code, expectedStatus] of errorStatuses) {
  test(`agent error "${code}" maps to HTTP ${expectedStatus}`, async (t) => {
    t.mock.method(console, 'error', () => {});
    useAgent(async () => {
      throw new DealerAgentError(code, `${code} happened`);
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
  assert.equal(json.error.code, 'server_error');
  assert.ok(!JSON.stringify(json).includes('secret'));
});

test('GET /api/health works', async () => {
  const response = await fetch(`${baseUrl}/api/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok' });
});

test('unknown API route returns a JSON 404', async () => {
  const response = await fetch(`${baseUrl}/api/nope`);
  assert.equal(response.status, 404);
  assert.equal((await response.json()).error.code, 'not_found');
});

test('server source files are not served over HTTP', async () => {
  for (const url of ['/server/app.js', '/server/package.json', '/tests/tests.js']) {
    const response = await fetch(baseUrl + url);
    assert.equal(response.status, 404, url);
  }
});
