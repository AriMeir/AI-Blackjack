import { createApp } from './app.js';
import { createDealerAgent } from './agent/dealerAgent.js';
import { createPlayerAgent } from './agent/playerAgent.js';

const PORT = process.env.PORT || 3000;

// Created on the first request that needs them, so the server starts even before ANTHROPIC_API_KEY is set.
let dealerAgent;
let playerAgent;
const getAgent = () => (dealerAgent ??= createDealerAgent());
const getPlayerAgent = () => (playerAgent ??= createPlayerAgent());

createApp({ getAgent, getPlayerAgent }).listen(PORT, (error) => {
  if (error) {
    console.error(`Could not start the server on port ${PORT}: ${error.message}`);
    process.exit(1);
  }
  console.log(`Blackjack server running at http://localhost:${PORT}`);
});
