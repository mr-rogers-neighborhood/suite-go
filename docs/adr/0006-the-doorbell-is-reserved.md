# ADR-0006: The doorbell is reserved, not built

- **Status:** accepted
- **Date:** 2026-11-08

## Context

ADR-0004 makes sync an event triggered by the app coming to the foreground. That leaves an obvious gap: a
device with the app closed never learns that it is behind until someone opens it.

The usual answer is push. Three facts make it unavailable here:

1. **The first real device is de-Googled.** GrapheneOS ships no Play Services, so FCM cannot reach it.
   Verified on the device: TalkBack had to be a sideloaded system app.
2. **No hosted server.** The product promise is that Suite operates no server, so there is no party that
   can send a push on our behalf.
3. **The relay is blind** (suite-sync ADR-0005). It cannot know which document advanced, so it cannot
   compose a message that says so.

## Decision

**Define the seam, ship nothing behind it.**

- A `SyncTrigger` interface with one implementation: poll on foreground. No push channel exists in v1.
- If a channel is added, **the ping is opaque**: "you have frames", addressed to a device. It carries no
  workspace or document identifier, which is what keeps the relay blind. Wake-up is therefore group-wide
  and coarse, and per-document clumping stays a client-side projection of version vectors rather than
  something the relay produces.
- A person can always see their own state without being notified: the sync affordance from ADR-0004 is the
  honest substitute for a doorbell that cannot ring.

## Consequences

- A closed app learns nothing until it is opened. For a local-first tool where the document is on the
  device, that is a smaller loss than it sounds: nothing is missing, it is only unmerged.
- Two paths keep both promises, and both are the user's infrastructure rather than ours: UnifiedPush or a
  self-hosted ntfy-compatible endpoint, or a push endpoint on _their_ relay. Nothing in this repository
  commits to either.
- Because no channel exists, no UX may promise "we will tell you when something changes". Copy has to say
  what is true: it syncs when you open it.
- The proposal for the protocol side is
  [docs/reference/blind-doorbell-proposal.md](../reference/blind-doorbell-proposal.md), addressed to
  suite-sync rather than decided here.
