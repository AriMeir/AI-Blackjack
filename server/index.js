import { createApp } from './app.js';
import { createDealerAgent } from './agent/dealerAgent.js';

const PORT = process.env.PORT || 3000;

// Created on the first move request, so the server starts even before ANTHROPIC_API_KEY is set.
let agent;
const getAgent = () => (agent ??= createDealerAgent());

createApp({ getAgent }).listen(PORT, (error) => {
  if (error) {
    console.error(`Could not start the server on port ${PORT}: ${error.message}`);
    process.exit(1);
  }
  console.log(`Blackjack server running at http://localhost:${PORT}`);
});
