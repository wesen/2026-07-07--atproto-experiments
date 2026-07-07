## About moderation

The atproto model is that *speech* and *reach* should be two separate layers, built to work with 
each other. The “speech” layer should remain permissive, distributing authority and designed to 
ensure everyone has a voice. The “reach” layer lives on top, built for flexibility and designed 
to scale. Atproto moderation is implemented using [Labels](https://atproto.com/guides/labels).

Our moderation architecture is provided by two services: [*Osprey*](#algorithmic-moderation), an 
event stream decisions engine and analysis UI designed to investigate and take automatic action; 
and [*Ozone*](https://atproto.com/guides/using-ozone), a labeling service and web frontend for 
making moderation decisions.

[Read more](https://docs.bsky.app/blog/blueskys-moderation-architecture) about moderation on our 
blog.

## Algorithmic moderation

[Osprey](https://github.com/bluesky-social/osprey-atproto) is an event stream decisions engine and 
analysis UI designed to investigate and take automatic action, to enable sustainable at-scale 
moderation. It makes use of [Kafka](https://kafka.apache.org/) with its own [rules 
engine](https://github.com/roostorg/osprey/blob/main/docs/rules.md).

From another perspective, Osprey is a Python library for processing actions through human written 
rules and outputting labels, webhooks back to an API and other sinks. It evaluates events using 
structured logic, user-defined functions, and external signals to assign labels, verdicts, and 
actions. It can make use of fine-tuned LLMs and other classifiers that expose their own web 
endpoints to Osprey. LLMs can be a useful tool for surfacing moderation reports; these reports can 
be acted on automatically and/or manually depending on your configuration.

Osprey is maintained by [Roost](https://roost.tools/), who build open source moderation tools.

## Further Reading and Resources

Learn all about the types and format of moderation [labels](https://atproto.com/guides/labels). 
Then, you can [subscribe](https://atproto.com/guides/subscriptions) to moderation labelers to have 
their labels applied in your application. You can also [create your own 
labeler](https://atproto.com/guides/creating-a-labeler) to publish labels. If you need to moderate 
content manually, you can use [Ozone](https://atproto.com/guides/using-ozone) as a web interface 
for labeling content.
