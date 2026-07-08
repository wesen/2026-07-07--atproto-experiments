package plugins

import (
	"context"
	"fmt"
	"time"

	lexutil "github.com/bluesky-social/indigo/lex/util"
)

// PublishRecord is the Go shape of a dev.atproto-demo.plugin record, used to
// build the createRecord body. It is not used to decode records from the
// firehose (decoding is raw map[string]any; see pkg/firehose).
type PublishRecord struct {
	Title        string              `json:"title"`
	Description  string              `json:"description,omitempty"`
	Source       string              `json:"source"`
	Version      string              `json:"version,omitempty"`
	PackageIDs   []string            `json:"packageIds"`
	Capabilities *Capabilities       `json:"capabilities,omitempty"`
	Hooks        *Hooks              `json:"hooks,omitempty"`
	HomeSurface  string              `json:"homeSurface,omitempty"`
	License      string              `json:"license,omitempty"`
	CreatedAt    string              `json:"createdAt"`
}

// PublishResult is the subset of the createRecord response we care about.
type PublishResult struct {
	URI string `json:"uri"`
	CID string `json:"cid"`
}

// NewPublishRecord builds a record with $type and createdAt filled in.
func NewPublishRecord(title, source string, packageIDs []string, caps *Capabilities) PublishRecord {
	return PublishRecord{
		Title:        title,
		Source:       source,
		PackageIDs:   packageIDs,
		Capabilities: caps,
		CreatedAt:    time.Now().UTC().Format(time.RFC3339),
	}
}

// recordMap converts a PublishRecord to the map[string]any shape the PDS expects
// for createRecord, including the $type field that identifies the Lexicon.
func (r PublishRecord) recordMap() map[string]any {
	m := map[string]any{
		"$type":      NSID,
		"title":      r.Title,
		"source":     r.Source,
		"packageIds": r.PackageIDs,
		"createdAt":  r.CreatedAt,
	}
	if r.Description != "" {
		m["description"] = r.Description
	}
	if r.Version != "" {
		m["version"] = r.Version
	}
	if r.HomeSurface != "" {
		m["homeSurface"] = r.HomeSurface
	}
	if r.License != "" {
		m["license"] = r.License
	}
	if r.Capabilities != nil {
		m["capabilities"] = map[string]any{
			"domain": r.Capabilities.Domain,
			"system": r.Capabilities.System,
		}
	}
	if r.Hooks != nil {
		m["hooks"] = map[string]any{
			"feedMiddleware":      r.Hooks.FeedMiddleware,
			"incomingFeedMessage": r.Hooks.IncomingFeedMessage,
		}
	}
	return m
}

// Publish writes a plugin record to the authed account's repo via
// com.atproto.repo.createRecord. It uses the low-level LexDo with a raw
// map[string]any body (the same approach pkg/repobrowser uses for list/get)
// rather than the typed RepoCreateRecord wrapper, because there is no
// generated Go type for the custom dev.atproto-demo.plugin Lexicon.
//
// client must be the authenticated LexClient for the logged-in user (the
// OAuth DPoP-bound *atclient.APIClient). did is that account's DID, used as
// the "repo" field of the createRecord body.
func Publish(ctx context.Context, client lexutil.LexClient, did string, rec PublishRecord) (*PublishResult, error) {
	if did == "" {
		return nil, fmt.Errorf("publish: did is required")
	}
	if rec.Title == "" || rec.Source == "" {
		return nil, fmt.Errorf("publish: title and source are required")
	}
	body := map[string]any{
		"repo":       did,
		"collection": NSID,
		"record":     rec.recordMap(),
	}
	var out PublishResult
	if err := client.LexDo(ctx, lexutil.Procedure, "application/json", "com.atproto.repo.createRecord", nil, body, &out); err != nil {
		return nil, fmt.Errorf("createRecord: %w", err)
	}
	return &out, nil
}

// DecodeSummary extracts a PluginSummary from a raw firehose record map
// (atdata.UnmarshalCBOR output). Only the metadata fields the feed needs are
// read; the source is intentionally not included. This mirrors the
// stringField/stringSliceField helpers in pkg/firehose but is kept here so
// the plugin domain owns its decode shape.
func DecodeSummary(authorDID, uri, cid, rkey, action string, seq int64, t string, rec map[string]any) PluginSummary {
	s := PluginSummary{
		URI:       uri,
		CID:       cid,
		AuthorDID: authorDID,
		Rkey:      rkey,
		Action:    action,
		Seq:       seq,
		Time:      t,
		Title:     strField(rec, "title"),
		Description: strField(rec, "description"),
		Version:   strField(rec, "version"),
		HomeSurface: strField(rec, "homeSurface"),
		License:   strField(rec, "license"),
		PackageIDs: strSlice(rec, "packageIds"),
	}
	if caps, ok := rec["capabilities"].(map[string]any); ok {
		s.Capabilities = &Capabilities{
			Domain: strSlice(caps, "domain"),
			System: strSlice(caps, "system"),
		}
	}
	if hooks, ok := rec["hooks"].(map[string]any); ok {
		s.Hooks = &Hooks{
			FeedMiddleware:      boolField(hooks, "feedMiddleware"),
			IncomingFeedMessage: boolField(hooks, "incomingFeedMessage"),
		}
	}
	return s
}

func strField(rec map[string]any, key string) string {
	if v, ok := rec[key].(string); ok {
		return v
	}
	return ""
}

func strSlice(rec map[string]any, key string) []string {
	v, ok := rec[key].([]any)
	if !ok {
		return nil
	}
	out := make([]string, 0, len(v))
	for _, e := range v {
		if s, ok := e.(string); ok {
			out = append(out, s)
		}
	}
	return out
}

func boolField(rec map[string]any, key string) bool {
	if v, ok := rec[key].(bool); ok {
		return v
	}
	return false
}
