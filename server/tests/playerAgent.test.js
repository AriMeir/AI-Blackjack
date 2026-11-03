import { test } from 'node:test';
import assert from 'node:assert/strict';
import Anthropic from '@anthropic-ai/sdk';
import { createPlayerAgent } from '../agent/playerAgent.js';
import { AgentError, MODEL, EFFORT } from '../agent/callAgent.js';
import { PLAYER_SYSTEM_PROMPT } from '../agent/playerPrompt.js';
import { playerActionTool } from '../agent/playerTool.js';
import { c, hand, toolCallResponse, fakeClient } from './helpers.js';

const dealerUpcard = c('9', '♦');
const decide = (client, playerHand) => createPlayerAgent({ client }).decide({ playerHand, dealerUpcard });
const playerCall = (input) => toolCallResponse(input, 'player_action');

// Expects decide() to fail with an AgentError of the given code.
const assertFails = (promise, code) =>
  assert.rejects(promise, (error) => error instanceof AgentError && error.code === code);

test('valid hit', async () => {
  const client = fakeClient(playerCall({ action: 'hit', explanation: '  I have 12, I need more.  ' }));
  assert.deepEqual(await decide(client, hand('10', '2')), {
    action: 'hit',
    explanation: 'I have 12, I need more.',
    playerTotal: 12,
  });
});

test('valid stand', async () => {
  const client = fakeClient(playerCall({ action: 'stand', explanation: 'Eighteen is good.' }));
  const result = await decide(client, hand('10', '8'));
  assert.equal(result.action, 'stand');
  assert.equal(result.playerTotal, 18);
});

// The agent's decision is its own: unconventional but valid answers are returned as given.
for (const [name, cards, action] of [
  ['stand on 12', hand('10', '2'), 'stand'],
  ['hit on 19', hand('10', '9'), 'hit'],
  ['hit on soft 18', hand('A', '7'), 'hit'],
]) {
  test(`an unconventional but valid decision is respected: ${name}`, async () => {
    const client = fakeClient(playerCall({ action, explanation: 'My own call.' }));
    assert.equal((await decide(client, cards)).action, action);
  });
}

test('sends the right request to Claude', async () => {
  const client = fakeClient(playerCall({ action: 'hit', explanation: 'Hit.' }));
  await decide(client, hand('10', '6'));

  const { params, options } = client.requests[0];
  assert.equal(params.model, MODEL);
  assert.equal(params.system, PLAYER_SYSTEM_PROMPT);
  assert.deepEqual(params.tools, [playerActionTool]);
  assert.equal(params.tool_choice, undefined);
  assert.deepEqual(params.output_config, { effort: EFFORT });
  assert.ok(options.timeout > 0);

  const message = params.messages[0].content;
  assert.match(message, /Your hand: 10♠, 6♠ \(total 16\)/);
  assert.match(message, /Dealer's face-up card: 9♦/);
});

test('the board message labels soft totals', async () => {
  const client = fakeClient(playerCall({ action: 'stand', explanation: 'Stand.' }));
  await decide(client, hand('A', '6'));
  assert.match(client.requests[0].params.messages[0].content, /\(total soft 17\)/);
});

// --- the player's prompt and tool ---

test('the player prompt gives a goal, not a rule, and says the dealer card is hidden', () => {
  assert.match(PLAYER_SYSTEM_PROMPT, /goal is to win/i);
  assert.match(PLAYER_SYSTEM_PROMPT, /no required rule/i);
  assert.match(PLAYER_SYSTEM_PROMPT, /face down\. You cannot see it/i);
  assert.match(PLAYER_SYSTEM_PROMPT, /player_action/);
  assert.doesNotMatch(PLAYER_SYSTEM_PROMPT, /must hit|must stand|you must|stand on 17|16 or less/i);
});

test('the player tool is named player_action and allows only hit or stand', () => {
  assert.equal(playerActionTool.name, 'player_action');
  assert.deepEqual(playerActionTool.input_schema.properties.action.enum, ['hit', 'stand']);
  assert.deepEqual(playerActionTool.input_schema.required, ['action', 'explanation']);
  assert.equal(playerActionTool.input_schema.additionalProperties, false);
});

// --- bad replies and failures ---

test('no tool call is an error', async () => {
  const client = fakeClient({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'hit' }] });
  await assertFails(decide(client, hand('10', '6')), 'no_tool_call');
});

test('a call to the dealer tool is an error', async () => {
  const client = fakeClient(toolCallResponse({ action: 'hit', explanation: 'x' }, 'dealer_action'));
  await assertFails(decide(client, hand('10', '6')), 'no_tool_call');
});

test('an action outside hit/stand is an error', async () => {
  const client = fakeClient(playerCall({ action: 'double', explanation: 'Double down.' }));
  await assertFails(decide(client, hand('10', '6')), 'invalid_output');
});

test('an empty explanation is an error', async () => {
  const client = fakeClient(playerCall({ action: 'hit', explanation: '   ' }));
  await assertFails(decide(client, hand('10', '6')), 'invalid_output');
});

test('a refusal is an error', async () => {
  await assertFails(decide(fakeClient({ stop_reason: 'refusal', content: [] }), hand('10', '6')), 'refusal');
});

test('running out of tokens is an error', async () => {
  await assertFails(decide(fakeClient({ stop_reason: 'max_tokens', content: [] }), hand('10', '6')), 'truncated');
});

test('an SDK timeout becomes a timeout error', async () => {
  await assertFails(decide(fakeClient(new Anthropic.APIConnectionTimeoutError()), hand('10', '6')), 'timeout');
});

test('an SDK API error becomes an api_error with its status', async () => {
  const client = fakeClient(Anthropic.APIError.generate(401, { error: { message: 'bad key' } }, 'bad key', new Headers()));
  await assert.rejects(
    decide(client, hand('10', '6')),
    (error) => error instanceof AgentError && error.code === 'api_error' && error.status === 401
  );
});
