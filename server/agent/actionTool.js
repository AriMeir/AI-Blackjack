import { ACTIONS } from './actions.js';

/**
 * Builds the single tool an agent may call to report its move. The dealer and the player agents
 * use the same schema (an action of hit or stand, plus an explanation); only the tool's name and
 * the wording differ. A separate name per agent means one agent can't call the other's tool.
 *
 * @param name         the tool name Claude must call, e.g. 'dealer_action'
 * @param description  what the tool does, shown to Claude
 * @param explanationHint  what the explanation should contain, shown to Claude
 */
export function createActionTool({ name, description, explanationHint }) {
  return {
    name,
    description,
    strict: true, // the API guarantees Claude's input matches the schema exactly
    input_schema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ACTIONS,
          description: 'hit = draw another card, stand = stop drawing',
        },
        explanation: {
          type: 'string',
          description: explanationHint,
        },
      },
      required: ['action', 'explanation'],
      additionalProperties: false,
    },
  };
}
