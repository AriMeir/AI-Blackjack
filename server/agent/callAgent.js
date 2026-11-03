import Anthropic from '@anthropic-ai/sdk';
import { ACTIONS } from './actions.js';

// What the dealer agent and the player agent have in common: one question to Claude,
// answered by calling a single tool, and the checks on that answer.

export const MODEL = 'claude-haiku-5-5';
export const EFFORT = 'medium'; // choosing a strategy takes more thought than following a fixed rule
const MAX_TOKENS = 16000;
const TIMEOUT_MS = 20_000;

/** Failure of an agent. `code` tells the caller what kind, `status` is the upstream HTTP status if any. */
export class AgentError extends Error {
  constructor(code, message, status) {
    super(message);
    this.name = 'AgentError';
    this.code = code; // timeout | api_error | refusal | truncated | no_tool_call | invalid_output
    this.status = status;
  }
}

// Converts an error from the Anthropic SDK into an AgentError (timeout or api_error).
// Any other kind of error is returned unchanged.
function toAgentError(error) {
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return new AgentError('timeout', 'The request to Claude timed out.');
  }
  if (error instanceof Anthropic.APIError) {
    return new AgentError('api_error', `Claude API error: ${error.message}`, error.status);
  }
  return error;
}

// Pulls the call to `tool` out of Claude's response and checks it is usable.
// Returns { action, explanation }, or throws an AgentError if the reply is a refusal,
// truncated, has no tool call, or has an invalid action or empty explanation.
function readDecision(response, tool) {
  if (response.stop_reason === 'refusal') {
    throw new AgentError('refusal', 'Claude declined to answer.');
  }
  if (response.stop_reason === 'max_tokens') {
    throw new AgentError('truncated', 'Claude ran out of tokens before answering.');
  }
  const call = response.content.find((block) => block.type === 'tool_use' && block.name === tool.name);
  if (!call) {
    throw new AgentError('no_tool_call', `Claude did not call ${tool.name}.`);
  }
  const { action, explanation } = call.input ?? {};
  if (!ACTIONS.includes(action)) {
    throw new AgentError('invalid_output', `Invalid action: ${JSON.stringify(action)}.`);
  }
  if (typeof explanation !== 'string' || explanation.trim() === '') {
    throw new AgentError('invalid_output', 'Missing explanation.');
  }
  return { action, explanation: explanation.trim() };
}

/**
 * Asks Claude one question and returns its checked decision { action, explanation }.
 * The decision itself is Claude's: it is not compared with any rule.
 *
 * @param client   the Anthropic client (a fake in tests)
 * @param system   the system prompt for this agent
 * @param tool     the single tool this agent may call
 * @param message  the board, as text
 */
export async function askAgent({ client, system, tool, message }) {
  let response;
  try {
    response = await client.messages.create(
      {
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system,
        tools: [tool],
        output_config: { effort: EFFORT },
        messages: [{ role: 'user', content: message }],
      },
      { timeout: TIMEOUT_MS }
    );
  } catch (error) {
    throw toAgentError(error);
  }
  return readDecision(response, tool);
}
