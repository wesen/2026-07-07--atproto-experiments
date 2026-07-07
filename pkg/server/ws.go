package server

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/gorilla/websocket"
	"github.com/wesen/atproto-experiments/pkg/firehose"
)

// upgrader allows the Vite dev origin (5173) and the production origin.
var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true // demo: allow all origins
	},
}

// handleWS upgrades to a WebSocket and streams live firehose posts to the
// browser as newline-delimited JSON.
func (s *Server) handleWS(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	id := s.nextSub.Add(1)
	ch := make(chan firehose.Post, 256)
	s.wsSubs.Store(id, ch)
	defer s.wsSubs.Delete(id)

	// Send a snapshot of recent posts first so the client has context.
	s.mu.Lock()
	recent := make([]firehose.Post, len(s.ring))
	copy(recent, s.ring)
	s.mu.Unlock()
	for _, p := range recent {
		if err := writeWS(conn, p); err != nil {
			return
		}
	}

	// Pump live posts, with a ping to keep proxies happy.
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case p, ok := <-ch:
			if !ok {
				return
			}
			if err := writeWS(conn, p); err != nil {
				return
			}
		case <-ticker.C:
			if err := conn.WriteControl(websocket.PingMessage, nil, time.Now().Add(10*time.Second)); err != nil {
				return
			}
		}
	}
}

func writeWS(conn *websocket.Conn, p firehose.Post) error {
	b, err := json.Marshal(p)
	if err != nil {
		return err
	}
	return conn.WriteMessage(websocket.TextMessage, b)
}
