[![photo](https://camo.githubusercontent.com/53ca052ff389e01fda248a27d479a6bdd242dcb8302a3c76fc99467
eaed09452/68747470733a2f2f7374617469632e626e6577626f6c642e6e65742f746d702f696e6469676f5f73657261632e
6a706567)](https://camo.githubusercontent.com/53ca052ff389e01fda248a27d479a6bdd242dcb8302a3c76fc9946
7eaed09452/68747470733a2f2f7374617469632e626e6577626f6c642e6e65742f746d702f696e6469676f5f73657261632
e6a706567)

## indigo: atproto libraries and services in golang

Some Bluesky software is developed in Typescript, and lives in the 
[bluesky-social/atproto](https://github.com/bluesky-social/atproto) repository. Some is developed 
in Go, and lives here.

**If you are not a Go developer and you want to run one of these tools**, you can do:

```
# with [Homebrew](brew.sh) installed
brew install go
# for example, to run tap
go install github.com/bluesky-social/indigo/cmd/tap
tap
```

Go will fetch dependencies, compile, and install `tap` or another service with a one-line `go 
install` command.

*Soon*, we plan to decouple the tools in this repo so you can install them individually like 
[goat](https://formulae.brew.sh/formula/goat).

## What is in here?

**Go Services:**

- **tap** ([README](https://github.com/bluesky-social/indigo/blob/main/cmd/tap/README.md)): 
synchronization and backfill tool for atproto apps
- **relay** ([README](https://github.com/bluesky-social/indigo/blob/main/cmd/relay/README.md)): 
relay reference implementation
- **rainbow** ([README](https://github.com/bluesky-social/indigo/blob/main/cmd/rainbow/README.md)): 
firehose "splitter" or "fan-out" service
- **hepa** ([README](https://github.com/bluesky-social/indigo/blob/main/cmd/hepa/README.md)): 
auto-moderation bot for [Ozone](https://ozone.tools/)

**Developer Tools:**

- **goat** ([README](https://github.com/bluesky-social/goat)): CLI for interacting with network: 
CAR files, firehose, APIs, etc (moved to [separate repo](https://github.com/bluesky-social/goat))

**Go Packages:**

> ⚠️
> 
> All the packages in this repository are under active development. Features and software 
interfaces have not stabilized and may break or be removed.

| Package | Docs |
| --- | --- |
| `api/atproto`: generated types for `com.atproto.*` Lexicons | 
[![PkgGoDev](https://camo.githubusercontent.com/1c5b93ccd49cd270ed6fcbb11df8bb71e0f6ef976c4bea8463ea
6b75874b5ad5/68747470733a2f2f706b672e676f2e6465762f62616467652f6d6f642f6769746875622e636f6d2f626c756
5736b792d736f6369616c2f696e6469676f2f6170692f617470726f746f)](https://pkg.go.dev/mod/github.com/blue
sky-social/indigo/api/atproto) |
| `api/bsky`: generated types for `app.bsky.*` Lexicons |  |
| `atproto/atclient`: HTTP API client |  |
| `atproto/auth/oauth`: AT OAuth client |  |
| `atproto/identity`: DID and handle resolution |  |
| `atproto/syntax`: string types and parsers for identifiers |  |
| `atproto/lexicon`: schema validation of data |  |
| `atproto/repo`: repository data structure |  |
| `atproto/repo/mst`: Merkle Search Tree implementation |  |
| `atproto/atcrypto`: cryptographic signing and key serialization |  |
| `go-didplc/didplc`: DID PLC implementation (external) |  |

The TypeScript reference implementation, including PDS and bsky AppView services, is at 
[bluesky-social/atproto](https://github.com/bluesky-social/atproto). Source code for the Bluesky 
Social client app (for web and mobile) can be found at 
[bluesky-social/social-app](https://github.com/bluesky-social/social-app).

## Development Quickstart

First, you will need the Go toolchain installed. We develop using the latest stable version of the 
language.

The Makefile provides wrapper commands for basic development:

```
make build
make test
make fmt
make lint
```

Individual commands can be run like:

```
go run ./cmd/relay
```

The [HACKING](https://github.com/bluesky-social/indigo/blob/main/HACKING.md) file has a list of 
commands and packages in this repository and some other development tips.

## What is atproto?

*not to be confused with the [AT command set](https://en.wikipedia.org/wiki/Hayes_command_set) or 
[Adenosine triphosphate](https://en.wikipedia.org/wiki/Adenosine_triphosphate)*

The Authenticated Transfer Protocol ("ATP" or "atproto") is a decentralized social media protocol, 
developed by [Bluesky Social PBC](https://bsky.social/). Learn more at:

- [Overview and Guides](https://atproto.com/guides/overview) 👈 Best starting point
- [Github Discussions](https://github.com/bluesky-social/atproto/discussions) 👈 Great place to 
ask questions
- [Protocol Specifications](https://atproto.com/specs/atp)
- [Blogpost on self-authenticating data 
structures](https://bsky.social/about/blog/3-6-2022-a-self-authenticating-social-protocol)

The Bluesky Social application encompasses a set of schemas and APIs built in the overall AT 
Protocol framework. The namespace for these "Lexicons" is `app.bsky.*`.

## Contributions

> While we do accept contributions, we prioritize high quality issues and pull requests. Adhering 
to the below guidelines will ensure a more timely review.

**Rules:**

- We may not respond to your issue or PR.
- We may close an issue or PR without much feedback.
- We may lock discussions or contributions if our attention is getting DDOSed.
- We do not provide support for build issues.

**Guidelines:**

- Check for existing issues before filing a new one, please.
- Open an issue and give some time for discussion before submitting a PR.
- Issues are for bugs & feature requests related to the golang implementation of atproto and 
related services.
	- For high-level discussions, please use the [Discussion 
Forum](https://github.com/bluesky-social/atproto/discussions).
		- For client issues, please use the relevant 
[social-app](https://github.com/bluesky-social/social-app) repo.
- Stay away from PRs that:
	- Refactor large parts of the codebase
		- Add entirely new features without prior discussion
		- Change the tooling or libraries used without prior discussion
		- Introduce new unnecessary dependencies

Remember, we serve a wide community of users. Our day-to-day involves us constantly asking "which 
top priority is our top priority." If you submit well-written PRs that solve problems concisely, 
that's an awesome contribution. Otherwise, as much as we'd love to accept your ideas and 
contributions, we really don't have the bandwidth.

## Are you a developer interested in building on atproto?

Bluesky is an open social network built on the AT Protocol, a flexible technology that will never 
lock developers out of the ecosystems that they help build. With atproto, third-party can be as 
seamless as first-party through custom feeds, federated services, clients, and more.

## License

This project is dual-licensed under MIT and Apache 2.0 terms:

- MIT license ([LICENSE-MIT](https://github.com/bluesky-social/indigo/blob/main/LICENSE-MIT) or 
[http://opensource.org/licenses/MIT](http://opensource.org/licenses/MIT))
- Apache License, Version 2.0, 
([LICENSE-APACHE](https://github.com/bluesky-social/indigo/blob/main/LICENSE-APACHE) or 
[http://www.apache.org/licenses/LICENSE-2.0](http://www.apache.org/licenses/LICENSE-2.0))

Downstream projects and end users may chose either license individually, or both together, at their 
discretion. The motivation for this dual-licensing is the additional software patent assurance 
provided by Apache 2.0.

Bluesky Social PBC has committed to a software patent non-aggression pledge. For details see [the 
original announcement](https://bsky.social/about/blog/10-01-2025-patent-pledge).
