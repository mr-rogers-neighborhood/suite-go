# Positioning: internal and external are different sentences

A record of a framing decision, not a claim about features. Nothing here should appear in the app.

## The two sentences

**External, one line:** a local-first mini-app runtime — an app platform where your data stays on your
device, and the apps you add are packages rather than installs.

**Internal, one line:** a distributed, FOSS, local-first WeChat, with JetBrains Toolbox as its desktop
instantiation.

Both are true. They are not interchangeable, and the reason is worth writing down because the internal one
is much more fun to say.

## Why the internal one is internal

"WeChat" compresses the entire thesis for someone who already knows the model: a host, a set of downloaded
functional packages, a runtime that owns the frame. It also anchors on the one thing that is _least_ like
this project — WeChat is centralized, cloud-authoritative and platform-controlled on both axes this project
inverts.

To anyone else, "WeChat" reads as "a chat app". A pitch that needs three minutes of correction before it
starts is a pitch that has already lost the room.

"Toolbox" survives the trip. It is legible to developers, it is genuinely the desktop model, and it implies
the right thing: recommended, never required.

## Why they must not be merged

The internal framing makes claims the product does not meet yet: collaboration is a foreground session
([ADR-0007](../adr/0007-collaboration-is-a-session.md)), waking a sleeping device is unreserved
([ADR-0006](../adr/0006-the-doorbell-is-reserved.md)), and packs share an origin with the shell
([ADR-0002](../adr/0002-isolation-is-a-document-boundary.md)). A slogan may be aspirational; the docs in
this repository may not.

The rule this file exists to keep: **the ADRs are the source of truth, and the slogan never overrules
them.** If a future sentence needs a decision to be true, the decision goes in an ADR first.

## What the external sentence commits to

Only what is already true: local-first documents, no account, no server operated by us, apps that install
and uninstall. It does _not_ claim offline collaboration, background sync, or a sandbox — one of those is a
session feature, one is not built, and one does not exist.
