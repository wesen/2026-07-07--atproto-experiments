// Example plugin bundle: a tiny counter.
// Demonstrates local draft state (draft.patch), a system notify (notify.show),
// and navigation back to the catalog (nav.back) — the three action kinds a
// plugin can emit without any host domain reducer.
defineRuntimeBundle(({ ui }) => {
  return {
    id: 'counter',
    title: 'Counter',
    packageIds: ['ui'],
    initialSurfaceState: {
      main: { count: 0 },
    },
    surfaces: {
      main: {
        packId: 'ui.card.v1',
        render({ state }) {
          const count = Number(state?.draft?.count ?? 0);
          return ui.panel([
            ui.text('Count: ' + count),
            ui.row([
              ui.button('-', { onClick: { handler: 'dec' } }),
              ui.button('+', { onClick: { handler: 'inc' } }),
            ]),
            ui.button('Reset', { onClick: { handler: 'reset' } }),
            ui.button('Done', { onClick: { handler: 'done' } }),
          ]);
        },
        handlers: {
          inc({ state, dispatch }) {
            dispatch({ type: 'draft.set', payload: { path: 'count', value: Number(state?.draft?.count ?? 0) + 1 } });
          },
          dec({ state, dispatch }) {
            dispatch({ type: 'draft.set', payload: { path: 'count', value: Number(state?.draft?.count ?? 0) - 1 } });
          },
          reset({ dispatch }) {
            dispatch({ type: 'draft.reset' });
            dispatch({ type: 'notify.show', payload: { message: 'Counter reset' } });
          },
          done({ state, dispatch }) {
            dispatch({ type: 'notify.show', payload: { message: 'Final count: ' + (state?.draft?.count ?? 0) } });
            dispatch({ type: 'nav.back' });
          },
        },
      },
    },
  };
});
