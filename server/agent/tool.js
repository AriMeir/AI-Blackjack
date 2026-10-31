export const ACTIONS = ['hit', 'stand'];

// The dealer agent's only tool. Claude "calls" it to report its decision.
export const dealerActionTool = {
  name: 'dealer_action',
  description:
    'Report the dealer\'s decision for the current board: draw another card (hit) or keep the current hand (stand), with a short explanation of why.',
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
          'One or two sentences, addressed to the player, explaining the decision using the dealer\'s total and the rule that applies.',
      },
    },
    required: ['action', 'explanation'],
    additionalProperties: false,
  },
};
