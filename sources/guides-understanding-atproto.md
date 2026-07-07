## TL;DR

Atproto is big-world, open social. Users publish JSON records into repositories. The changestreams 
of those records then sync across the network to drive applications.

We recommend these fantastic articles by community member [Dan 
Abramov](https://bsky.app/profile/danabra.mov):

- [**Open Social**](https://overreacted.io/open-social/) - The protocol is the API.
- [**Where it's at://**](https://overreacted.io/where-its-at/) - From handles to hosting.
- [**A Social Filesystem**](https://overreacted.io/a-social-filesystem/) - Formats over apps.

## Core primitives

- **User repos.** The public per-user databases.
- **User handles.** Usernames, which are DNS records. Our account is 
[@atproto.com](https://bsky.app/profile/atproto.com).
- **User DIDs.** The permanent IDs of users.

## Data models

- **Records**. JSON, categorized into collections.
- **Blobs**. The [images and videos](https://atproto.com/guides/images-and-video).
- **Lexicon**. The schema language.
- **Lexicon RPC (XRPC).** It's HTTPS but with the routes defined by Lexicons.

## The stack

There are different kinds of services which you can 
[self-host](https://atproto.com/guides/self-hosting):

- **Personal Data Servers (PDS).** They host user accounts.
- **Relays**. They collect and rebroadcast user write events.
- **Applications**. They aggregate user data to produce app experiences.
- **Labelers**. Publish moderation decisions as label metadata.

## Making it happen

Let's assume you're building an application. Your users will sign in with 
[OAuth](https://atproto.com/guides/auth), which hands your application the address of their PDS. 
Your application then [reads & writes](https://atproto.com/guides/reads-and-writes) records by 
contacting their PDS.

To listen for activity across the network, you [sync from relays](https://atproto.com/guides/sync). 
You could sync directly from the users' PDSes, but it's more convenient to use the relays. Since 
all data is signed, you can confirm the relay's stream is accurate.

The [Lexicons](https://atproto.com/guides/lexicon) help identify the data being published on the 
network. You use them to validate data as you read it, just like you validate incoming HTTP 
requests.

Finally, you handle [moderation](https://atproto.com/guides/moderation) by subscribing to (or 
running) labelers which receive user reports and publish labels on user content.

## Deeper reads

We also recommend these deep-dive articles by the team:

- [**Atproto for distributed systems 
engineers**](https://atproto.com/articles/atproto-for-distsys-engineers). An explainer for backend 
thinkers.
- [**The Atproto Ethos**](https://atproto.com/articles/atproto-ethos). The principles that underpin 
the design of atproto.
