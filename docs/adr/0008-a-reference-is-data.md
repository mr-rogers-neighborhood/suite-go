# ADR-0008: A reference is data, and the host only opens it

- **Status:** proposed
- **Date:** 2026-11-18
- **Narrows:** [ADR-0007](0007-collaboration-is-a-session.md) — the presence deferral is about presence.
- **Related:** `suite-canvas` ADR-0062 (a link carries no data), `suite-start`'s `deepLink.ts`.

## Context

A container with several domains is not a container until one domain can point at another. Today a
Planner entry cannot name the Canvas board it belongs to, and a Budget expense cannot name the project
it was for. The only cross-app surface that exists is Start's document index, which lists files and
can open one — a launcher, not a reference.

Two questions have been conflated in earlier discussion, and separating them is most of this record:

1. **What does a reference contain?** Content, a live view, or a pointer.
2. **Who acts on it?** The domain, or the host.

ADR-0007 defers "runtime-supplied presence primitives — cursors, awareness, a sharing model" and calls
them the largest unknown in the platform framing. That is true of _presence_. It is not true of
references: a reference needs no live connection, no awareness protocol, and no second app running. A
reader who cites ADR-0007 to postpone this is citing it for something it did not decide.

## Decision

**A reference is data, and opening one is a host capability.**

```ts
interface Reference {
  readonly appId: string; // lower kebab-case, the same id space as a suite app id
  readonly documentId: string; // opaque to the host: a workspace id, a path, a name
  readonly target?: string; // a node, a date, a row — whatever the owning app defines
}
```

- **Stored by the domain, in its own document.** A Planner entry that references a Canvas board
  carries `{appId: "canvas", documentId: "…"}` inside its own `.planner` file. Nothing subscribes,
  nothing copies content, nothing merges. It survives offline, it exports with the document, and it
  has no lifetime of its own.
- **Opened by the host.** `ModuleHost.navigation.open(reference)` resolves the app, launches or
  focuses it at the target, and returns an opaque result token. This is the WeChat
  `navigateToMiniProgram` / `navigateBack` shape, with the host brokering it.
- **The host never interprets `documentId` or `target`.** It matches `appId` against installed apps
  and hands the rest to the app's own deep-link parser. `suite-start`'s `deepLink.ts` already refuses
  the tricks that matter — other schemes, credentials, ports, `.`/`..` segments — so the reference
  reuses that parser instead of adding a second, laxer one.
- **`appId` is validated, `documentId` is not beyond safety.** A container that validated a
  document id would have to know what a document id is.

## Not decided here: embeds

A reference points; it does not render. Showing another document's _content_ inside a document is a
cross-document synchronisation design — two documents in one view, two subscriptions, two permission
stories — and it is not v1. ADR-0062 draws the same fence from the other side: a link carries no data.

## Consequences

- A reference to an app that is not installed is a normal state, not an error: the host says so and
  offers the app, and the reference stays valid because it is just data.
- The reference is not a foreign key. Nothing enforces that the target exists, and a deleted document
  leaves a reference that opens into "not found". That is the honest behaviour for a local-first
  system with no coordinating server: a reference is a memory, not a constraint.
- A QR payload and a reference are now the same shape, which is why invite-and-join can wait until
  this exists rather than inventing a third vocabulary.
- Domain documents gain a field they did not have, so the schema version moves. That is the cost, and
  it is smaller than adding a cross-document subscription model.

## What would make this wrong

If two domains need to show each other _live_ state — a Planner counter that updates when a Budget
number changes — then a reference is insufficient, and the answer is not "embed", it is a third
document both apps write to. That is a different decision and should be its own record.
