# Proposal: `loadSnapshot` may return null

For the Planner bridge, and for whoever owns `docs/reference/bridges.md` in suite-dev. Written from the
mobile side, where the container cannot do what the current signature asks.

## The problem

```ts
// suite-planner/packages/core/src/ports.ts
loadSnapshot(): Promise<Uint8Array>;

// suite-planner/apps/desktop/src/renderer/src/store/snapshotStore.ts
const bytes = await bridge.loadSnapshot();
const replica = new DocumentReplica(WorkspaceDocument.fromSnapshot(bytes));
```

`fromSnapshot` requires a **schema-initialised** snapshot — meta and settings written by
`WorkspaceDocument.create()`. A container that hosts Planner has no way to produce one that stays valid
as the schema moves, and asking it to is asking the host to manufacture a domain document.

The two workarounds available to a host are both worse:

- **Ship a seed `.planner` fixture.** The container carries a domain artifact, it goes stale on every
  schema bump, and it makes `suite-go` depend on generating files from `planner-core` — which would tie
  this repository's build to a sibling checkout.
- **Import `@suite/planner-core` in the host** to call `create()`. Same coupling, and now the container
  imports a domain, which is the rule the whole architecture exists to keep.

## The change

```ts
loadSnapshot(): Promise<Uint8Array | null>;
```

and in `bootDocument`:

```ts
const bytes = await bridge.loadSnapshot();
const replica = new DocumentReplica(
  bytes === null ? WorkspaceDocument.create() : WorkspaceDocument.fromSnapshot(bytes),
);
```

Three lines in the app, one in the ports file.

## Why `null` is the right default, not a shrug

It is the same shape as `wasCreated()`, which landed as optional in W0 and reads exactly this way: a
host that cannot answer is a host that did not invent anything, and the app decides. `null` says "there
is no document here yet" and the domain makes its own — which is where document creation belongs.

It also makes the desktop path explicit rather than implied. Today the desktop bridge always has bytes
because it always opens a file; `null` would only ever come from a host that starts empty.

## What it unblocks

Planner running inside Suite Go as an isolated pack, which is the last blocker on that integration. It
also means a future `isolation: "isolated"` pack for Planner ships no domain-specific fixture at all.

## Cost if declined

The container either ships a stale fixture or takes a dependency on a sibling checkout. Both are
recoverable, and neither is a reason to hold up anything else — but neither is the architecture either
side is trying to build.
