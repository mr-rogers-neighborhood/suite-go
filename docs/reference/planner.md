# Planner inside Suite Go

Where this stands, what was proven, and the one decision that blocks wiring it.

## Proven: the renderer builds as a web bundle

`pnpm planner:build` runs `apps/go/planner.vite.config.ts`, which points Vite at
`suite-planner/apps/desktop/src/renderer` and writes into `apps/go/planner-dist`.

It succeeds with **no change to the Planner repository**: 2,572 modules, ~557 kB of JavaScript and the
3.6 MB Loro WASM. The renderer turned out to be a plain Vite app — no Node builtins, no Electron import,
and its only machine access is `window.suitePlanner` inside `bootDocument()`.

Two settings were needed and are worth remembering:

- `cacheDir` is redirected into `apps/go/.vite-planner`, so building the mobile app never writes into
  the Planner checkout.
- `vite-plugin-wasm` resolves `loro-crdt`'s `.wasm`, and `optimizeDeps.exclude` keeps it from being
  pre-bundled and losing its URL.

## The blocker: the first document

`bootDocument()` does this:

```ts
const bytes = await bridge.loadSnapshot();
const replica = new DocumentReplica(WorkspaceDocument.fromSnapshot(bytes));
bridge.onWorkspaceReplaced((snapshot) => replica.replace(snapshot));
```

`fromSnapshot` expects a **schema-initialised** snapshot — meta and settings written by
`WorkspaceDocument.create()` in `@suite/planner-core`. An empty or raw `new LoroDoc()` snapshot is not
enough, and a bridge that hands one over produces an app that throws on first open.

The obvious fix — import `@suite/planner-core` from the mobile app — is the wrong one. It would make
`suite-go`'s typecheck and build depend on a sibling checkout, which the public repository's pipeline
does not have. The mobile build would only work on a machine with all six repos cloned.

## The decision

Ship a **seed snapshot as a fixture**.

1. Generate one `.planner` snapshot once, from `planner-core`, and commit it under
   `apps/go/src/modules/planner/seed.planner`.
2. The bridge loads those bytes on first run, then persists whatever the app writes from then on.
3. `suite-go` keeps no runtime or type-level dependency on the sibling repo; the fixture is data.

The fixture has a cost worth stating: when Planner's schema version moves, the seed must be
regenerated, and the app's own schema-version path has to cope with an old seed. That is a smaller,
more honest cost than a hidden cross-repository build requirement — and it is testable, which the
alternative is not.

## Still to decide after that

- **CSS isolation.** The Planner bundle ships Tailwind, whose preflight is global. Mounted in the same
  document as the shell it will restyle the shell's own elements. Either the shell adopts Tailwind too,
  or Planner mounts in its own document (`./planner/index.html`) with a bridge prelude. The second is
  cleaner and closer to the process isolation desktop has, at the cost of a page navigation per open.
- **Reminders.** `onReminder` has no notification plugin yet; the bridge returns a no-op unsubscriber
  and the UI says so rather than silently dropping them.
