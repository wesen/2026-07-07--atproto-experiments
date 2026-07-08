// Package plugins defines the social JS plugin sharing domain: the
// dev.atproto-demo.plugin Lexicon identifier, the record types used to
// publish and discover plugins, and the publish path that writes a plugin
// record to the author's repository through an authenticated client.
//
// A plugin is a small .vm.js source string that the companion browser VM
// (ticket PLUGIN-RUNTIME) executes inside a QuickJS sandbox. This package
// treats plugin source as content: it builds the createRecord body and
// decodes plugin records from the firehose into summaries. It does not
// execute anything.
package plugins

// NSID is the Lexicon identifier for a socially-shared JS plugin record.
//
// The authority "dev.atproto-demo" is a namespace, not a DNS record. For a
// production deployment it should be a domain the publisher controls. It is
// centralized here so the firehose consumer, the publisher, and the server
// endpoints all agree on the collection name.
const NSID = "dev.atproto-demo.plugin"

// Hooks mirrors the browser VM's RuntimeBundleHooksMeta: which feed hooks a
// plugin implements. Stored in the record so the feed consumer and runtime
// know how to route the plugin without loading its source first.
type Hooks struct {
	FeedMiddleware      bool `json:"feedMiddleware,omitempty"`
	IncomingFeedMessage bool `json:"incomingFeedMessage,omitempty"`
}

// Capabilities is the least-privilege grant a plugin requests. It mirrors
// the browser VM's CapabilityPolicy shape. Network plugins are clamped by the
// runtime (see PLUGIN-RUNTIME); the stored value is the author's declaration.
type Capabilities struct {
	Domain []string `json:"domain,omitempty"`
	System []string `json:"system,omitempty"`
}

// PluginSummary is the feed-friendly view of a plugin record: enough metadata
// for a browser to show a catalog entry and decide whether to fetch the full
// source. The source itself is intentionally NOT included; it is fetched on
// demand via GetRecord. This mirrors the repo browser's "list as summaries,
// fetch full value on demand" decision.
type PluginSummary struct {
	// Canonical at:// URI of the record.
	URI string `json:"uri"`
	// Content hash of the record block.
	CID string `json:"cid"`
	// DID of the repository (account) that authored the plugin.
	AuthorDID string `json:"authorDID"`
	// Record key within the dev.atproto-demo.plugin collection.
	Rkey string `json:"rkey"`
	// Human-readable title.
	Title string `json:"title"`
	// Short description of what the plugin does.
	Description string `json:"description,omitempty"`
	// Semver-ish version, e.g. "1.0.0".
	Version string `json:"version,omitempty"`
	// Runtime packages the sandbox must install (e.g. ["ui"]).
	PackageIDs []string `json:"packageIds,omitempty"`
	// Capability grant requested by the author.
	Capabilities *Capabilities `json:"capabilities,omitempty"`
	// Which feed hooks the plugin implements.
	Hooks *Hooks `json:"hooks,omitempty"`
	// Initial surface to render.
	HomeSurface string `json:"homeSurface,omitempty"`
	// License SPDX identifier, e.g. "MIT".
	License string `json:"license,omitempty"`
	// Repo operation: "create", "update", or "delete".
	Action string `json:"action"`
	// Firehose sequence number (for ordering / resumption).
	Seq int64 `json:"seq"`
	// Relay-side timestamp of the event.
	Time string `json:"time"`
}
