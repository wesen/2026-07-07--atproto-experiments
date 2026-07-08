// Stateful feed middleware plugin: manually mute authors; muted authors disappear from the derived visible feed.
defineRuntimeBundle(({ ui }) => ({
  id: 'feed-author-mute',
  title: 'Author Mute',
  packageIds: ['ui'],
  initialPluginState: { mutedAuthors: [] },
  surfaces: {
    panel: {
      packId: 'ui.card.v1',
      render({ state }) {
        const plugin = state.plugin || {};
        const muted = Array.isArray(plugin.mutedAuthors) ? plugin.mutedAuthors : [];
        const posts = (state.feed && Array.isArray(state.feed.posts)) ? state.feed.posts : [];
        const authors = [];
        posts.forEach((post) => { if (authors.indexOf(post.author) < 0) authors.push(post.author); });
        return ui.panel([
          ui.text('Hide all posts from selected authors.'),
          ui.badge('muted: ' + String(muted.length)),
          ui.row(authors.map((author) => ui.button((muted.indexOf(author) >= 0 ? 'Unmute ' : 'Mute ') + author, { onClick: { handler: 'toggle', args: { author } } }))),
          muted.length ? ui.button('Clear muted authors', { onClick: { handler: 'clear' } }) : ui.text('No muted authors.'),
        ]);
      },
      handlers: {
        toggle({ pluginState, dispatchPluginAction }, args) {
          const author = String(args && args.author || '');
          const current = Array.isArray(pluginState.mutedAuthors) ? pluginState.mutedAuthors : [];
          const next = current.indexOf(author) >= 0 ? current.filter((x) => x !== author) : current.concat(author);
          dispatchPluginAction('state.merge', { mutedAuthors: next });
        },
        clear({ dispatchPluginAction }) {
          dispatchPluginAction('state.merge', { mutedAuthors: [] });
        },
      },
    },
  },
  feed: {
    apply({ posts, pluginState }) {
      const muted = Array.isArray(pluginState.mutedAuthors) ? pluginState.mutedAuthors : [];
      const mutedSet = new Set(muted);
      return {
        posts: posts.filter((post) => !mutedSet.has(post.author)),
        hiddenPostIds: posts.filter((post) => mutedSet.has(post.author)).map((post) => post.id),
        debug: { mutedAuthors: muted },
      };
    },
  },
}));
