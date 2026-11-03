import { createActionTool } from './actionTool.js';

// The dealer agent's only tool. Claude "calls" it to report its decision.
export const dealerActionTool = createActionTool({
  name: 'dealer_action',
  description:
    "Report the dealer's decision for the current board: draw another card (hit) or keep the current hand (stand), with a short explanation of why.",
  explanationHint:
    "One or two sentences, addressed to the player, explaining the decision using the dealer's total, the player's total and the risk of busting.",
});
