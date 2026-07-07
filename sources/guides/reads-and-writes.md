## AT Records

The AT Protocol distributes user data across different nodes of your network, using the core 
building blocks of the web. The AT Protocol interconnects applications so that their backends share 
state, including user accounts and content, in individual data repositories. Many operations you'll 
perform when working with atproto apps involve reading and writing these data repositories.

For more context, see [Atproto for distributed systems 
engineers](https://atproto.com/articles/atproto-for-distsys-engineers) and [The Atproto 
Ethos](https://atproto.com/articles/atproto-ethos).

## Prerequisites

Reading and writing AT data repositories requires an authenticated client. You can authenticate 
with [password authentication](https://atproto.com/guides/sdk-auth) or 
[OAuth](https://atproto.com/guides/about-oauth). The guides in this section assume you have already 
set up an authenticated client.

## API Methods

After [authenticating](https://atproto.com/guides/sdk-auth#creating-a-client), you'll be able to 
make other API requests.

To make API requests, you'll need to specify a particular 
[Lexicon](https://atproto.com/guides/lexicon). For example, Bluesky posts are available under the 
`app.bsky.feed.post` Lexicon.

Use `lex` to install the `app.bsky.feed.post` and `app.bsky.actor.profile` Lexicons as described in 
[Installing Lexicons](https://atproto.com/guides/installing-lexicons):

```bash
npm install -g @atproto/lex
lex install app.bsky.feed.post app.bsky.actor.profile
lex build
```

This will generate TypeScript types for the Lexicons in your project. You can use this `import` 
statement to access all installed Lexicons:

```tsx
import * as app from './lexicons/app.js'
```

This will give you access to the API methods for your Lexicons. Now you are ready to start [making 
requests](https://atproto.com/guides/reading-data)!

## Further Reading and Resources

- [Reading data](https://atproto.com/guides/reading-data)
- [Writing data](https://atproto.com/guides/writing-data)
- [Accounts and deletions](https://atproto.com/guides/account-lifecycle)
- [Social graph](https://atproto.com/guides/social-graph)
- [Record Key spec](https://atproto.com/specs/record-key)
- [URI scheme](https://atproto.com/specs/at-uri-scheme)
