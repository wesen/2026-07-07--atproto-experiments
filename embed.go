// Package embed holds the go:embed directive for the production SPA build.
// The frontend is built with Vite (pnpm build) into frontend/dist, which is
// embedded into the Go binary at compile time. The embed directive must live
// at the repository root because go:embed paths cannot ascend with "..".
//
// During development, run the Vite dev server (pnpm dev) on :5173 and the Go
// server on :8080; the frontend proxies /api and /ws to :8080.
package embed

import (
	"embed"
	"io/fs"
)

//go:embed all:frontend/dist
var spaFiles embed.FS

// SPA returns the embedded frontend filesystem rooted at frontend/dist.
func SPA() fs.FS {
	dist, err := fs.Sub(spaFiles, "frontend/dist")
	if err != nil {
		return nil
	}
	return dist
}
