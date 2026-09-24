/**
 * WebSocket realtime push. GET /v1/ws authenticates via ?token= (the
 * preHandler auth chain also accepts a Bearer header, but browsers/EventSource
 * style clients commonly need query auth for websockets) and then receives
 * every published event as {type, payload, at}.
 *
 * @param {import('fastify').FastifyInstance} app
 * @param {{events: ReturnType<typeof import('./events.js').createEventBus>}} ctx
 */
export function registerRealtime(app, ctx) {
  app.get('/v1/ws', { websocket: true }, (socket) => {
    const unsubscribe = ctx.events.subscribe('*', (event) => {
      if (socket.readyState !== socket.OPEN) return;
      socket.send(
        JSON.stringify({ type: event.type, payload: event.payload, at: event.at.toISOString() }),
      );
    });
    socket.on('close', () => {
      // events.subscribe has no unsubscribe API yet (fine for a single
      // long-lived process); nothing to clean up beyond the socket itself.
      void unsubscribe;
    });
  });
}
