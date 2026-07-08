// Stateful feed middleware plugin: show only recent posts.
defineRuntimeBundle(({ ui }) => ({
  id: 'feed-freshness-window',
  title: 'Freshness Window',
  packageIds: ['ui'],
  initialPluginState: { minutes: 240 },
  surfaces: {
    panel: {
      packId: 'ui.card.v1',
      render({ state }) {
        const plugin = state.plugin || {};
        const minutes = Number(plugin.minutes || 240);
        return ui.panel([
          ui.text('Hide posts older than the selected window.'),
          ui.badge(minutes >= 999999 ? 'window: all' : 'window: ' + String(minutes) + 'm'),
          ui.row([
            ui.button('15m', { onClick: { handler: 'set', args: { minutes: 15 } } }),
            ui.button('1h', { onClick: { handler: 'set', args: { minutes: 60 } } }),
            ui.button('4h', { onClick: { handler: 'set', args: { minutes: 240 } } }),
            ui.button('All', { onClick: { handler: 'set', args: { minutes: 999999 } } }),
          ]),
        ]);
      },
      handlers: {
        set({ dispatchPluginAction }, args) {
          dispatchPluginAction('state.merge', { minutes: Number(args && args.minutes || 240) });
        },
      },
    },
  },
  feed: {
    apply({ posts, pluginState, context }) {
      const minutes = Number(pluginState.minutes || 240);
      const cutoff = context.now - minutes * 60 * 1000;
      const next = minutes >= 999999 ? posts : posts.filter((post) => post.ts >= cutoff);
      return { posts: next, debug: { minutes, cutoff } };
    },
  },
}));
