# The module contract

What a domain may do, what the container guarantees, and the two rules that keep the container from
becoming the monolith it exists to avoid.

`@suite/go` lives in `packages/go`. It is pure types and pure functions: no I/O, no React at runtime,
no dependency on any domain.

## One declaration, one mount

```ts
interface SuiteGoModule {
  readonly id: string; // lower kebab-case, same rule as a suite app id
  readonly name: string; // shown on a tile
  readonly icon: string; // an icon key the shell resolves; never a URL
  readonly capabilities: readonly SuiteGoCapability[]; // "capture" | "documents"
  readonly accepts: readonly CaptureKind[]; // "text" | "url" | "file"
  register(host: ModuleHost): SuiteGoModuleRegistration;
}
```

The declaration is what the container routes on. `register` runs only when a person opens the module,
and returns:

```ts
interface SuiteGoModuleRegistration {
  readonly view: ComponentType<{ host: ModuleHost }>;
  readonly capture?: CaptureHandler; // required when the module claims "capture"
  dispose(): void | Promise<void>; // must release listeners, timers and handles
}
```

### Why `accepts` is declared rather than discovered

Asking a module "could you take this link?" by mounting it would mean the container cannot route a
share until every domain has loaded — which is the laziness the whole design is for. So matching
happens on the declaration, and only the winner is mounted.

`resolveCapture` therefore has three answers, and the third is not an error:

| Answer              | Meaning                              | Who decides                            |
| ------------------- | ------------------------------------ | -------------------------------------- |
| `ok`                | Exactly one module claimed this kind | The container routes                   |
| `no-capable-module` | Nothing claimed it                   | The container says so, naming the kind |
| `ambiguous`         | More than one claimed it             | **The person**, from the candidates    |

Silently preferring the first registered module is how a share to the wrong domain becomes a bug
nobody can reproduce.

## What the host provides, and what it refuses to

`ModuleHost` gives a mounted module four things:

| Service      | Shape                            | The refusal                                                            |
| ------------ | -------------------------------- | ---------------------------------------------------------------------- |
| `documents`  | list, create, open, save, remove | Never returns a parsed document. Bytes, a name, a title, a timestamp   |
| `storage`    | get, set, delete, keys           | Already namespaced per module, so one module cannot read another's key |
| `navigation` | `setTitle`, `close`              | Not a general stack: leaving a module returns to home, always          |
| `theme`      | scheme, density, CSS variables   | Names no colour and no spacing value                                   |

Two consequences follow from the document refusal, and both are load-bearing:

1. **A recents entry's title comes from the module**, supplied when it saves. A base64 Loro snapshot has
   no human name in it, and a container that learned to read one would have learned a domain.
2. **The container cannot tell a `.planner` from a `.budget`**, which is exactly why adding the second
   domain will not require touching it.

## Registration is checked, loudly

`createModuleRegistry` refuses a declaration rather than accepting a broken one:

| Rejection                 | Cause                                               |
| ------------------------- | --------------------------------------------------- |
| `invalid-id`              | Not lower kebab-case, or longer than 32 characters  |
| `duplicate-id`            | Two modules claiming the same id                    |
| `capture-without-accepts` | Claims `capture` but can never be chosen            |
| `accepts-without-capture` | Accepts kinds the container would never route to it |

The id rule is deliberately identical to `suiteAppIdSchema` in `@suite/contracts`, so a suite app id is
always a legal module id. That is why `isSuiteGoModuleId("notes-")` is `true`: the suite's pattern
permits a trailing hyphen, and being stricter here would break the promise that an id can carry over.

## Teardown survives a bad module

`disposeAll` releases every mounted module and keeps going when one throws. A domain with a bug in its
`dispose` must not be able to keep the container from releasing the others — that would turn one bad
module into a leak across the whole app. The report names what was disposed and what failed.

## The two rules, as tests

- _Never read a document_: `DocumentStore` has no member that returns anything but bytes and metadata.
- _Never learn a domain_: `packages/go` contains no domain name. If a change needs one, it belongs in
  that domain's module instead.
