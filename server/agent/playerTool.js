import { ACTIONS } from './actions.js';

// The player agent's only tool. Claude "calls" it to report its decision.
export const playerActionTool = {
  name: 'player_action',
  description:
    'Report the player\'s decision for the current hand: draw another card (hit) or keep the current hand (stand), with a short explanation of why.',
  strict: true,
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
        description:
          'One or two sentences explaining the decision using the player\'s total, the dealer\'s face-up card and the risk of busting.',
      },
    },
    required: ['action', 'explanation'],
    additionalProperties: false,
  },
};
