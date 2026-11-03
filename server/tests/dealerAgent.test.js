import { test } from 'node:test';
import assert from 'node:assert/strict';
import Anthropic from '@anthropic-ai/sdk';
import { createDealerAgent, AgentError, MODEL, EFFORT } from '../agent/dealerAgent.js';
import { SYSTEM_PROMPT } from '../agent/prompt.js';
import { dealerActionTool } from '../agent/tool.js';
import { hand, toolCallResponse, fakeClient } from './helpers.js';

const playerHand = hand('10', '9');
const decide = (client, dealerHand) => createDealerAgent({ client }).decide({ dealerHand, playerHand });

// Expects decide() to fail with an AgentError of the given code.
const assertFails = (promise, code) =>
  assert.rejects(promise, (error) => error instanceof AgentError && error.code === code);

test('valid hit on 16', async () => {
  const client = fakeClient(toolCallResponse({ action: 'hit', explanation: 'I have 16, so I must hit.' }));
  const result = await decide(client, hand('10', '6'));
  assert.deepEqual(result, {
    action: 'hit',
    explanation: 'I have 16, so I must hit.',
    dealerTotal: 16,
  });
});

test('valid stand on soft 17', async () => {
  const client = fakeClient(toolCallResponse({ action: 'stand', explanation: 'Soft 17, I stand.' }));
  const result = await decide(client, hand('A', '6'));
  assert.equal(result.action, 'stand');
  assert.equal(result.dealerTotal, 17);
});

test('explanation is trimmed', async () => {
  const client = fakeClient(toolCallResponse({ action: 'hit', explanation: '  Must hit.  ' }));
  assert.equal((await decide(client, hand('10', '6'))).explanation, 'Must hit.');
});

// The agent's decision is its own: valid answers are returned as given, even when they differ
// from the traditional "hit below 17, stand on 17" dealer rule.
for (const [name, dealer, action] of [
  ['stand on 16', hand('10', '6'), 'stand'],
  ['hit on hard 17', hand('10', '7'), 'hit'],
  ['hit on soft 17', hand('A', '6'), 'hit'],
  ['hit on 20', hand('K', 'Q'), 'hit'],
]) {
  test(`an unconventional but valid decision is respected: ${name}`, async (t) => {
    const warn = t.mock.method(console, 'warn', () => {});
    const client = fakeClient(toolCallResponse({ action, explanation: 'My own call.' }));
    const result = await decide(client, dealer);
    assert.equal(result.action, action);
    assert.equal(result.explanation, 'My own call.');
    assert.equal(warn.mock.callCount(), 0, 'nothing is flagged or rejected');
  });
}

test('sends the right request to Claude', async () => {
  const client = fakeClient(toolCallResponse({ action: 'hit', explanation: 'Hit.' }));
  await decide(client, hand('10', '6'));

  assert.equal(client.requests.length, 1);
  const { params, options } = client.requests[0];
  assert.equal(params.model, MODEL);
  assert.equal(MODEL, 'claude-haiku-5-5');
  assert.equal(params.system, SYSTEM_PROMPT);
  assert.deepEqual(params.tools, [dealerActionTool]);
  assert.equal(params.tool_choice, undefined, 'forced tool choice is not supported on this model');
  assert.deepEqual(params.output_config, { effort: EFFORT });
  assert.ok(params.max_tokens > 0);
  assert.ok(options.timeout > 0);

  const message = params.messages[0].content;
  assert.equal(params.messages[0].role, 'user');
  assert.match(message, /10♠, 6♠ \(total 16\)/, 'dealer hand with its total');
  assert.match(message, /10♠, 9♠ \(total 19\)/, 'player hand with its total');
});

test('the board message labels soft totals', async () => {
  const client = fakeClient(toolCallResponse({ action: 'stand', explanation: 'Stand.' }));
  await decide(client, hand('A', '6'));
  assert.match(client.requests[0].params.messages[0].content, /A♠, 6♠ \(total soft 17\)/);
});

// --- the system prompt ---

test('the prompt gives the agent a goal instead of the traditional dealer rule', () => {
  assert.match(SYSTEM_PROMPT, /goal is to win/i);
  assert.match(SYSTEM_PROMPT, /no required rule/i);
  assert.doesNotMatch(SYSTEM_PROMPT, /must hit|must stand|you must|stand on 17|16 or less/i);
});

test('the prompt explains how the round is decided and that the player is done', () => {
  assert.match(SYSTEM_PROMPT, /final/i);
  assert.match(SYSTEM_PROMPT, /bust/i);
  assert.match(SYSTEM_PROMPT, /push/i);
  assert.match(SYSTEM_PROMPT, /dealer_action/);
});

test('no tool call is an error', async () => {
  const client = fakeClient({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'hit' }] });
  await assertFails(decide(client, hand('10', '6')), 'no_tool_call');
});

test('a call to a different tool is an error', async () => {
  const client = fakeClient({
    stop_reason: 'tool_use',
    content: [{ type: 'tool_use', name: 'other_tool', input: { action: 'hit', explanation: 'x' } }],
  });
  await assertFails(decide(client, hand('10', '6')), 'no_tool_call');
});

test('an action outside hit/stand is an error', async () => {
  const client = fakeClient(toolCallResponse({ action: 'double', explanation: 'Double down.' }));
  await assertFails(decide(client, hand('10', '6')), 'invalid_output');
});

test('a missing action is an error', async () => {
  const client = fakeClient(toolCallResponse({ explanation: 'No action.' }));
  await assertFails(decide(client, hand('10', '6')), 'invalid_output');
});

test('an empty explanation is an error', async () => {
  const client = fakeClient(toolCallResponse({ action: 'hit', explanation: '   ' }));
  await assertFails(decide(client, hand('10', '6')), 'invalid_output');
});

test('a non-string explanation is an error', async () => {
  const client = fakeClient(toolCallResponse({ action: 'hit', explanation: 42 }));
  await assertFails(decide(client, hand('10', '6')), 'invalid_output');
});

test('a refusal is an error', async () => {
  const client = fakeClient({ stop_reason: 'refusal', content: [] });
  await assertFails(decide(client, hand('10', '6')), 'refusal');
});

test('running out of tokens is an error', async () => {
  const client = fakeClient({ stop_reason: 'max_tokens', content: [] });
  await assertFails(decide(client, hand('10', '6')), 'truncated');
});

test('an SDK timeout becomes a timeout error', async () => {
  const client = fakeClient(new Anthropic.APIConnectionTimeoutError());
  await assertFails(decide(client, hand('10', '6')), 'timeout');
});

test('an SDK API error becomes an api_error with its status', async () => {
  const client = fakeClient(Anthropic.APIError.generate(401, { error: { message: 'bad key' } }, 'bad key', new Headers()));
  await assert.rejects(
    decide(client, hand('10', '6')),
    (error) => error instanceof AgentError && error.code === 'api_error' && error.status === 401
  );
});

test('an unexpected error is passed through unchanged', async () => {
  const client = fakeClient(new TypeError('bug'));
  await assert.rejects(decide(client, hand('10', '6')), TypeError);
});
