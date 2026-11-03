import { createActionTool } from './actionTool.js';

// The player agent's only tool. Claude "calls" it to report its decision.
export const playerActionTool = createActionTool({
  name: 'player_action',
  description:
    "Report the player's decision for the current hand: draw another card (hit) or keep the current hand (stand), with a short explanation of why.",
  explanationHint:
    "One or two sentences explaining the decision using the player's total, the dealer's face-up card and the risk of busting.",
});
