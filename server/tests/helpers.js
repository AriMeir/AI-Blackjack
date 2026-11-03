// Shared helpers for the offline tests. Nothing here talks to the network.

export const c = (rank, suit = '♠') => ({ rank, suit });

// A hand with the given ranks, e.g. hand('10', '6') is 10♠ 6♠ (total 16).
export const hand = (...ranks) => ranks.map((rank) => c(rank));

// A Claude response in which the model called a tool (dealer_action unless told otherwise) with `input`.
export const toolCallResponse = (input, toolName = 'dealer_action') => ({
  stop_reason: 'tool_use',
  content: [{ type: 'tool_use', id: 'toolu_test', name: toolName, input }],
});

// A stand-in for the Anthropic client. It records each request and then either
// returns `reply` or, if `reply` is an Error, throws it.
export function fakeClient(reply) {
  const requests = [];
  return {
    requests,
    messages: {
      create: async (params, options) => {
        requests.push({ params, options });
        if (reply instanceof Error) throw reply;
        return reply;
      },
    },
  };
}
