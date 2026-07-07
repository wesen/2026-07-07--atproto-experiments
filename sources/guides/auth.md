## Getting Started

You can log in using any [OAuth](https://atproto.com/guides/about-oauth) provider, or with 
[PasswordSession](https://github.com/bluesky-social/atproto/tree/main/packages/lex/lex-password-sess
ion) from our SDK if you are using password auth.

Begin by installing the atproto packages:

```bash
npm install @atproto/lex @atproto/lex-password-session
```

Next, authenticate with an [SDK](https://atproto.com/guides/sdk-auth).

## About authorization

**Auth is the first part of our docs for a reason!** You don't need to be authed to [read 
records](https://atproto.com/guides/reading-data#unauthenticated-reads) or even to [stream data 
from the firehose](https://atproto.com/guides/streaming-data). But if you're building an app that 
integrates with the Atmosphere, you'll begin with auth.

You might start out by just using atproto identities as an OAuth source — though you'll find that 
there's lots more you can do by building on top of the atproto [social 
graph](https://atproto.com/guides/social-graph).

This section is aimed at developers building applications on atproto. Applications with their own 
end-user login flow should implement [OAuth](#what-is-o-auth) for authentication. Single-purpose 
applications such as bots or command line tools may use [password 
authentication](https://atproto.com/guides/sdk-auth) instead.

We also support the use of [App Passwords](https://atproto.com/specs/xrpc#app-passwords). Accounts 
can create and revoke app passwords separate from their primary password. This way, you do not need 
to supply your primary password to applications that use password auth.

To implement OAuth in your application, refer to [About 
OAuth](https://atproto.com/guides/about-oauth) for common use cases, and the [Permission 
Sets](https://atproto.com/guides/permission-sets) guide for understanding permission models. If 
you're building your own protocol implementation or OAuth Client SDK, refer to the [OAuth 
spec](https://atproto.com/specs/oauth).

## What is OAuth?

OAuth is an authorization framework that lets developers request access to an account without 
requiring users to hand over their password. Without OAuth, if someone wanted to authorize a 3rd 
party app to access their account, their only option would be to type their username and password 
into that app. This is bad for all sorts of reasons, the first being that a 3rd party app gets to 
see, and likely save, passwords. And once an app has a username and password, the app would have 
*full* access to their account.

OAuth aims to solve these problems with a family of open specifications for managing secure 
authorization without requiring a person's username and password. If you've ever used a "Sign in 
with..." button or link on the web, you've used OAuth.

As a developer, you can request limited access to a person's account, meaning if you only need to 
post a message to someone's public timeline, you don't also need to request access to read their 
private messages. This is great for your app because you don't have to worry about managing data 
you don't need, and it's great for the person using your app because they don't need to worry about 
their DMs being compromised.

## Further Reading and Resources

Begin by reading [SDK authentication](https://atproto.com/guides/sdk-auth). To implement OAuth in 
your application, refer to [About OAuth](https://atproto.com/guides/about-oauth) for common use 
cases, and the [Permission Sets](https://atproto.com/guides/permission-sets) guide for 
understanding permission models.
