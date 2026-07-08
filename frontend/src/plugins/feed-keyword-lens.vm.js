// Stateful feed middleware plugin: keyword filtering lives in pluginState, not in the feed reducer.
defineRuntimeBundle(({ ui }) => ({
  id: 'feed-keyword-lens',
  title: 'Keyword Lens',
  packageIds: ['ui'],
  initialPluginState: { query: '', matchCount: 0 },
  surfaces: {
    panel: {
      packId: 'ui.card.v1',
      render({ state }) {
        const plugin = state.plugin || {};
        return ui.panel([
          ui.text('Filter posts by author or text'),
          ui.input(plugin.query || '', { placeholder: 'quickjs, alice, spam…', onChange: { handler: 'setQuery' } }),
          ui.row([ui.badge('matches: ' + String(plugin.matchCount || 0)), ui.button('Clear', { onClick: { handler: 'clear' } })]),
        ]);
      },
      handlers: {
        setQuery({ dispatchPluginAction }, args) {
          dispatchPluginAction('state.merge', { query: String((args && args.value) || '') });
        },
        clear({ dispatchPluginAction }) {
          dispatchPluginAction('state.merge', { query: '' });
        },
      },
    },
  },
  feed: {
    apply({ posts, pluginState }) {
      const query = String(pluginState.query || '').trim().toLowerCase();
      const next = query
        ? posts.filter((post) => post.author.toLowerCase().includes(query) || post.text.toLowerCase().includes(query))
        : posts;
      const annotations = Object.fromEntries(next.map((post) => [post.id, query ? { keywordMatch: true } : {}]));
      return { posts: next, annotations, statePatch: { matchCount: next.length }, debug: { query } };
    },
  },
}));
