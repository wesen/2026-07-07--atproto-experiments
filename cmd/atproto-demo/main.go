// Command atproto-demo is the entry point for the ATProto firehose demo.
//
// It is a glazed/cobra CLI with two subcommands:
//
//	serve    start the HTTP server + firehose consumer (the main demo)
//	firehose stream decoded posts to stdout (handy for debugging)
//
// The serve command runs the firehose consumer and the HTTP server
// concurrently, serving the embedded React/Vite/Redux SPA and the
// /api + /ws endpoints.
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/go-go-golems/glazed/pkg/cmds/logging"
	"github.com/spf13/cobra"

	"github.com/wesen/atproto-experiments/pkg/firehose"
	"github.com/wesen/atproto-experiments/pkg/oauth"
	"github.com/wesen/atproto-experiments/pkg/server"

	embed "github.com/wesen/atproto-experiments"
)

var version = "dev"

var rootCmd = &cobra.Command{
	Use:     "atproto-demo",
	Short:   "ATProto firehose demo: subscribe to the firehose and act on your bsky account",
	Version: version,
	PersistentPreRunE: func(cmd *cobra.Command, args []string) error {
		return logging.InitLoggerFromCobra(cmd)
	},
}

var serveCmd = &cobra.Command{
	Use:   "serve",
	Short: "Run the HTTP server and firehose consumer",
	RunE:  runServe,
}

var firehoseCmd = &cobra.Command{
	Use:   "firehose",
	Short: "Stream decoded firehose posts to stdout",
	RunE:  runFirehose,
}

var (
	flagRelay        string
	flagAddr         string
	flagSessionSecret string
)

func init() {
	serveCmd.Flags().StringVar(&flagRelay, "relay", "https://relay1.us-east.bsky.network", "relay firehose URL")
	serveCmd.Flags().StringVar(&flagAddr, "addr", ":8080", "HTTP listen address")
	serveCmd.Flags().StringVar(&flagSessionSecret, "session-secret", "dev-insecure-secret-change-me", "secret used to sign OAuth session cookies (use openssl rand -hex 16)")
	firehoseCmd.Flags().StringVar(&flagRelay, "relay", "https://relay1.us-east.bsky.network", "relay firehose URL")

	rootCmd.AddCommand(serveCmd)
	rootCmd.AddCommand(firehoseCmd)
}

func main() {
	cobra.CheckErr(logging.AddLoggingSectionToRootCommand(rootCmd, "atproto-demo"))
	if err := rootCmd.Execute(); err != nil {
		os.Exit(1)
	}
}

func runServe(cmd *cobra.Command, args []string) error {
	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()

	logger := slog.Default().With("system", "atproto-demo")
	consumer := firehose.NewConsumer(flagRelay, logger)

	// OAuth callback URL must match the listen address the PDS redirects
	// back to. For localhost dev, 127.0.0.1:PORT is used (the atproto
	// localhost client_id special-case means no public hostname is needed).
	callbackURL := "http://127.0.0.1" + flagAddr + "/oauth/callback"
	oauthFactory := oauth.NewFactory(callbackURL, flagSessionSecret, logger)
	srv := server.NewServer(consumer, oauthFactory, logger)

	// Start the firehose consumer in the background.
	go func() {
		if err := consumer.Run(ctx); err != nil {
			logger.Error("firehose consumer exited", "error", err)
		}
	}()

	// Serve the embedded SPA + API. Pass nil for dev mode (frontend on :5173).
	var spaFS = embed.SPA()
	return srv.Run(ctx, flagAddr, spaFS)
}

func runFirehose(cmd *cobra.Command, args []string) error {
	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()

	logger := slog.Default().With("system", "firehose-cli")
	consumer := firehose.NewConsumer(flagRelay, logger)
	sub, _ := consumer.Subscribe()

	go func() {
		if err := consumer.Run(ctx); err != nil {
			logger.Error("consumer exited", "error", err)
		}
	}()

	// Print decoded posts as JSON lines until interrupted.
	for {
		select {
		case <-ctx.Done():
			return nil
		case p, ok := <-sub:
			if !ok {
				return nil
			}
			b, _ := json.Marshal(p)
			fmt.Fprintln(os.Stdout, string(b))
		}
	}
}
