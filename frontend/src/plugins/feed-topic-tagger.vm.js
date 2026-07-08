// Stateful incoming-message + middleware plugin: tags new messages and can filter by topic.
defineRuntimeBundle(({ ui }) => ({
  id: 'feed-topic-tagger',
  title: 'Topic Tagger',
  packageIds: ['ui'],
  initialPluginState: { topic: 'all', counts: {} },
  surfaces: {
    panel: {
      packId: 'ui.card.v1',
      render({ state }) {
        const plugin = state.plugin || {};
        const topic = String(plugin.topic || 'all');
        const counts = plugin.counts || {};
        return ui.panel([
          ui.text('Tags incoming messages; optionally show one topic.'),
          ui.row(['all', 'vm', 'frontend', 'security', 'spam'].map((name) => ui.button((topic === name ? '• ' : '') + name, { onClick: { handler: 'topic', args: { topic: name } } }))),
          ui.table(Object.entries(counts).map(([name, count]) => [name, String(count)]), { headers: ['Topic', 'Seen'] }),
        ]);
      },
      handlers: {
        topic({ dispatchPluginAction }, args) {
          dispatchPluginAction('state.merge', { topic: String(args && args.topic || 'all') });
        },
      },
    },
  },
  feed: {
    onIncomingMessage({ message, pluginState }) {
      const text = String(message.text || '').toLowerCase();
      const tags = [];
      if (text.includes('quickjs') || text.includes('vm') || text.includes('sandbox')) tags.push('vm');
      if (text.includes('react') || text.includes('css') || text.includes('frontend')) tags.push('frontend');
      if (text.includes('dom') || text.includes('capability') || text.includes('safe')) tags.push('security');
      if (text.includes('crypto') || text.includes('free money')) tags.push('spam');
      const nextTags = Array.from(new Set([...(Array.isArray(message.tags) ? message.tags : []), ...tags]));
      const counts = { ...(pluginState.counts || {}) };
      nextTags.forEach((tag) => { counts[tag] = Number(counts[tag] || 0) + 1; });
      return { message: { ...message, tags: nextTags }, statePatch: { counts } };
    },
    apply({ posts, pluginState }) {
      const topic = String(pluginState.topic || 'all');
      const next = topic === 'all' ? posts : posts.filter((post) => Array.isArray(post.tags) && post.tags.indexOf(topic) >= 0);
      return {
        posts: next,
        annotations: Object.fromEntries(next.map((post) => [post.id, { tags: Array.isArray(post.tags) ? post.tags : [] }])),
        debug: { topic },
      };
    },
  },
}));
