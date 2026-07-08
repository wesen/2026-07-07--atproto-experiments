// Standalone publish tool (run with: go run ./cmd/publish-plugin).
//
// Publishes dev.atproto-demo.plugin records to the logged-in account's repo
// using a persisted OAuth session (no browser/cookie needed). Used to seed
// the social plugin feed for the PLUGIN-RUNTIME discovery demo.
//
// Usage:
//   go run ./cmd/publish-plugin --store /tmp/oauth-store-ps
//
// The store must contain a resumable OAuth session (created via the web OAuth
// flow with the repo:dev.atproto-demo.plugin?action=create scope).
package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"strings"
	"syscall"

	"github.com/bluesky-social/indigo/atproto/syntax"
	localoauth "github.com/wesen/atproto-experiments/pkg/oauth"
	"github.com/wesen/atproto-experiments/pkg/plugins"
)

// Two example plugins to publish. Both are simple ui.card.v1 surface plugins
// (no feed middleware) so they launch from the Plugins tab.
const greetingSource = `defineRuntimeBundle(({ ui }) => ({
  id: 'greeting',
  title: 'Greeting',
  packageIds: ['ui'],
  initialPluginState: { n: 0 },
  surfaces: {
    panel: {
      packId: 'ui.card.v1',
      render({ state }) {
        const n = (state.plugin && state.plugin.n) || 0;
        const msgs = ['Hello from the firehose!', 'Sandboxed QuickJS says hi', 'Plugin loaded over ATProto'];
        return ui.panel([
          ui.text(msgs[n % msgs.length]),
          ui.button('Next greeting', { onClick: { handler: 'next' } }),
        ]);
      },
      handlers: {
        next({ dispatchPluginAction, state }) {
          const n = (state.plugin && state.plugin.n) || 0;
          dispatchPluginAction('state.merge', { n: n + 1 });
        },
      },
    },
  },
}));
`

const echoSource = `defineRuntimeBundle(({ ui }) => ({
  id: 'echo-box',
  title: 'Echo Box',
  packageIds: ['ui'],
  initialPluginState: { text: '', echoed: '' },
  surfaces: {
    panel: {
      packId: 'ui.card.v1',
      render({ state }) {
        const p = state.plugin || {};
        return ui.panel([
          ui.text('Type something and echo it'),
          ui.input(p.text || '', { placeholder: 'type here', onChange: { handler: 'setType' } }),
          ui.button('Echo', { onClick: { handler: 'echo' } }),
          ui.text(p.echoed ? ('Echo: ' + p.echoed) : '(nothing echoed yet)'),
        ]);
      },
      handlers: {
        setType({ dispatchPluginAction }, args) {
          dispatchPluginAction('state.merge', { text: String((args && args.value) || '') });
        },
        echo({ dispatchPluginAction, state }) {
          const p = state.plugin || {};
          dispatchPluginAction('state.merge', { echoed: String(p.text || '') });
        },
      },
    },
  },
}));
`

func main() {
	storeDir := flag.String("store", "/tmp/oauth-store-ps", "OAuth store directory (must contain sessions.json)")
	callbackURL := flag.String("callback", "http://127.0.0.1:18112/oauth/callback", "OAuth callback URL (must match the original login)")
	secret := flag.String("secret", "dev-insecure-secret-change-me", "session cookie secret (unused for direct resume)")
	flag.Parse()

	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()

	// Load the first session's (did, sessionID) from sessions.json.
	b, err := os.ReadFile(*storeDir + "/sessions.json")
	if err != nil {
		log.Fatalf("read sessions.json: %v", err)
	}
	var sm map[string]json.RawMessage
	if err := json.Unmarshal(b, &sm); err != nil {
		log.Fatalf("parse sessions.json: %v", err)
	}
	var did, sid string
	for k := range sm {
		parts := strings.SplitN(k, "/", 2)
		if len(parts) == 2 {
			did, sid = parts[0], parts[1]
			break
		}
	}
	if did == "" {
		log.Fatal("no session found in store")
	}
	didObj, err := syntax.ParseDID(did)
	if err != nil {
		log.Fatalf("parse did: %v", err)
	}
	fmt.Printf("resuming session for %s (sid %s)\n", did, sid)

	// Reuse the OAuth Factory to build the ClientApp + FileStore exactly as
	// the server does (same scopes, same client_id derivation).
	f, err := localoauth.NewFactory(*callbackURL, *secret, *storeDir, nil)
	if err != nil {
		log.Fatalf("oauth factory: %v", err)
	}
	defer f.Close()

	sess, err := f.Oauth.ResumeSession(ctx, didObj, sid)
	if err != nil {
		log.Fatalf("resume session: %v", err)
	}
	client := sess.APIClient()
	fmt.Printf("resumed; account=%s host=%s\n", did, client.Host)

	pluginsToPublish := []plugins.PublishRecord{
		plugins.NewPublishRecord("Greeting", greetingSource, []string{"ui"}, &plugins.Capabilities{Domain: []string{}, System: []string{}}),
		plugins.NewPublishRecord("Echo Box", echoSource, []string{"ui"}, &plugins.Capabilities{Domain: []string{}, System: []string{}}),
	}
	for _, p := range pluginsToPublish {
		p.Description = "Published via the social plugin sharing demo."
		p.Version = "1.0.0"
		p.License = "MIT"
		out, err := plugins.Publish(ctx, client, did, p)
		if err != nil {
			log.Fatalf("publish %q: %v", p.Title, err)
		}
		fmt.Printf("published %q -> %s (cid %s)\n", p.Title, out.URI, out.CID)
	}
}
