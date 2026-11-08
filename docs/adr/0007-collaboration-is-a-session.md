# ADR-0007: Collaboration is a foreground session

- **Status:** accepted
- **Date:** 2026-11-08

## Context

"Sync in any app" is a data problem a CRDT mostly solves. "Collaborate in any app" is a different problem:
presence, cursors, who is here, who may write. Presence is _liveness_, and liveness is exactly what a
suspended app cannot provide.

Treating the two as one feature is how a platform ends up promising collaboration it can only deliver
intermittently.

## Decision

**Collaboration is live only while both people have the app open.** Presence is a session protocol, not
stored state.

- A session is a foreground connection; when either side leaves, presence ends and the document converges
  through ordinary sync.
- Nothing stores "who was here". A cursor that outlives its author is a bug in an editor and a promise the
  platform cannot keep.
- Runtime-supplied presence primitives — cursors, awareness, a sharing model — are **deferred** until a
  second app needs them. Building a platform API from one consumer is how an interface gets a shape
  nobody else can use.

## Consequences

- No "tell me when someone edits" notifications in v1, which aligns with ADR-0006: there is no channel to
  send them on.
- Two people editing the same document at different times is ordinary sync and needs nothing from this
  decision. Two people editing at once is the session case, and it is the only case that needs a live
  connection.
- The deferred runtime primitives are the largest known unknown in the platform framing. When they are
  designed, this record is the one to revisit, because it deliberately leaves the question open rather
  than answering it with a guess.
