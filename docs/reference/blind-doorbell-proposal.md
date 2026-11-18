# Proposal: a blind relay can still ring the doorbell

Addressed to `suite-sync`, which owns the protocol and is not this repository's to change. Written from
the mobile side, where ADR-0006 says there is no way to wake a sleeping device.

## The tension

Mobile needs a way to say "you are behind" to a device with the app closed. The obvious design — "the
relay notifies peers when a document advances" — cannot be built against a blind relay
([suite-sync ADR-0005](https://github.com/mr-rogers-neighborhood/suite-sync/blob/main/docs/decisions/0005-blind-server.md)).
The relay stores and forwards opaque encrypted records; it does not decrypt bodies, does not hold keys, and
does not compute diffs. It cannot know a document advanced, because "advanced" is a fact about plaintext.

So the design cannot live on our side at all: the _sender_ is the only party that knows a change happened,
and the _relay_ is the only party that can reach a sleeping device.

## The shape that preserves blindness

An **opaque wake frame**: the relay is asked to ping a device, and the frame it sends carries routing and
nothing else.

```jsonc
{
  "kind": "wake",
  "workspace": "<opaque id>", // a group the device already belongs to; it learns nothing new
  "device": "<device id>", // who to wake
  "sentAt": "<timestamp>" // for coalescing, not for meaning
}
```

What it must **not** carry, and why:

| Field                | Why not                                                                                 |
| -------------------- | --------------------------------------------------------------------------------------- |
| Document id          | Metadata. A relay that knows which document moved knows your document graph             |
| Version vector       | Encrypted frames already carry it end to end; the relay would be duplicating a secret   |
| Author               | Says who is working and when, which is exactly what a blind relay promises not to learn |
| Change size or count | Side channel. "Three edits to doc X" is content                                         |

The recipient's action is therefore always the same: **connect and sync**. Everything else it learns from
encrypted frames it was going to fetch anyway.

## What this costs

- **Coarseness.** The relay cannot say which document, so every wake is group-wide. A person in five
  workspaces with three devices gets pings that are not about anything they are looking at. Coalescing and
  batching happen on the client, as a projection of version vectors — the per-document "clump" from the
  discussion is a client-side idea, not something the relay can produce.
- **A sender.** Something has to tell the relay to wake a peer. Either the committing client does it (best:
  it knows, and it is already connected), or the relay infers "frames arrived for device X" — which needs
  no document knowledge at all and is the simplest version.
- **A delivery channel.** None of this works without push, and
  [ADR-0006](../adr/0006-the-doorbell-is-reserved.md) records why this build has none: no Play Services on
  the target device, no hosted server, and no third party that may send on our behalf. UnifiedPush or a
  push endpoint on the user's own relay are the two paths that keep both promises.

## The same argument, as a session type

The table above says what a wake frame must not carry. That is an assertion; a projection makes it a
structure. Three participants — the device that committed (`S`), the relay (`R`), the device to wake (`T`) —
and the document payload abstracted as `τ`:

```text
Doorbell(τ) =
    S → R : frames(workspace, device = T, seal(τ)*)
    R → R : note "T has frames"                       -- the relay's own bookkeeping
    R → T : wake(workspace)
    T → R : since(after)
    R → T : frame(index, epoch, seal(τ))*
    T → T : apply conforming frames only
```

Project to the relay:

```text
R_local : frames(ws, device, seal(τ)*) . (wake(device)?) . since? . frame(seal(τ))*
```

`R_local` mentions `τ` nowhere it can open, mentions no author, no version vector and no document id —
**because none of them is a message it ever sends or receives.** The table in this document is now derivable
rather than argued: every field it forbids is a field the projection would have to carry, and the projection
does not.

Two things the type makes obvious that the prose only implies:

- **`wake` carries `workspace` and nothing else that identifies content.** The recipient's only legal
  response is `since(after)` — the type has no branch in which a wake tells it _what_ changed, which is the
  same reason the relay cannot be asked to say.
- **Coalescing is a relay-local behaviour.** "Note that T has frames" is an internal transition, not a
  message, so a relay may collapse twenty of them into one `wake` without any device learning anything new.
  That is where the coarseness lives, and it is the right place for it.

The full sync session type, with this conversation as one branch of it, is in
[suite-sync's protocol note](https://github.com/mr-rogers-neighborhood/suite-sync/blob/main/docs/protocol-sessions.md).

## What is being asked

Not a decision, and not code. Two things worth recording in `suite-sync` when it is convenient:

1. That a wake frame is _allowed_ to be opaque, and that the relay may act on "frames arrived for a
   device" without knowing more.
2. That a wake frame carries no document identity, so a future implementer does not add one because it
   would make the notification nicer.

Until then, the mobile side ships [ADR-0004](../adr/0004-sync-is-an-event.md)'s trigger — sync on
foreground — and nothing else.
