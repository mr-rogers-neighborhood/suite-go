# ADR-0009: A schema bump is a migration the app performs, and the host stays blind

- **Status:** proposed
- **Date:** 2026-11-18
- **Related:** `0002` (isolation), `0005` (durability), ADR-0008 (references), `packages/go/src/pack.ts`
  (`contractVersion`), `suite-dev/docs/ALPHA.md`

## Context

Two version numbers already exist and they are easy to confuse:

| Field                                    | Answers                                 | Enforced by                |
| ---------------------------------------- | --------------------------------------- | -------------------------- |
| `contractVersion` / `minimumHostVersion` | "Can this host run this pack's _code_?" | `packFitsHost`, at install |
| (nothing)                                | "Can this app read this _document_?"    | nothing                    |

The second is a real gap, and `ALPHA.md` says so: _"Documents carry no upgrade guarantee between app
versions."_ Shipping Planner as a pack made it sharper rather than creating it. A pack upgrades on its own
schedule, so a person can hold pack v0.2 against host v0.1 with no relationship between the two — and the
reverse, an old pack opening a document a newer pack wrote, is the case that produces a data-loss bug rather
than an error message.

The host cannot help here, and that is not a limitation to work around. `contract.md` makes it a rule: the
container carries bytes and never parses them. A host that decided whether a `.planner` file was readable
would have learned a domain.

## Decision

**The app owns its schema, its version, and its migrations. The host owns nothing about them.**

Four parts:

1. **Every document carries its schema version, written by the app.** Planner already writes
   `meta.schemaVersion` through `initializeMeta`; Budget and Canvas do the same. The field is not new; what
   is missing is a rule about what happens when it differs.
2. **On open, the app compares and decides, in this order:**
   - **equal** → open.
   - **older** → migrate forward, in one step per version, then write at the current version. A migration
     that cannot complete leaves the file untouched.
   - **newer** → **refuse to edit**, open read-only if the app can, and say what it would need. Never
     "try anyway": writing an older schema over a newer document is how a person loses fields they cannot
     see.
3. **No migration ever runs in the host, and none is triggered by opening a pack.** Installing a pack is a
   code change; opening a document is the only moment a schema is touched.
4. **`packFitsHost` stays about code.** A pack whose `contractVersion` is too new for the host is refused at
   install; a document whose schema is too new for the app is refused at open. Two failures, two sentences,
   because they are two different problems with two different remedies.

## The test that proves it

One fixture per domain, committed, written at the _previous_ schema version, opened by the current build:

- it opens,
- it migrates,
- the migrated document contains everything a person would notice (the fixture asserts on content, not on a
  version number),
- and it is written back at the current version.

The reverse case is a second test with a hand-written document whose version is one higher than the app
knows: the app must refuse rather than silently truncate. That test is the important one, because the
forward case fails loudly and the backward case fails by losing data.

## What this deliberately does not do

- **No lens library.** Cambria (`inkandswitch/cambria-project`) is the research answer to schema evolution
  for _shared_ documents: two versions of a schema operating on one document at the same time. Our unit is a
  file with one writer, and a migration is a step, not a projection. Adopting a lens library now would add a
  dependency to solve the case we do not have.
- **No automatic downgrade.** A person who opens a document in an older app keeps their data; they do not get
  a silently reduced copy of it.
- **No host-side verification of the version.** The host cannot read it, and a host that could would be one
  `parse` away from the monolith `contract.md` forbids.

## Consequences

- A schema bump is a **release note item**, not an implementation detail: "documents written by 0.2 cannot be
  edited by 0.1" is something a person has to be able to read before they upgrade.
- Every domain needs a fixture and a migration chain, which is real work the first time and cheap afterwards.
- Refusing a newer document means an app can be _too old_ to open a file, and the honest message is "update
  Planner", not "this file is corrupt".
- Sync does not change any of this. Two peers at different app versions converge at the CRDT level and can
  still disagree about schema, which is why the version is in the document rather than in the transport.

## What would make this wrong

If two domains ever share one document — the case ADR-0008 declines for v1 — then one writer becomes several
and a stepwise migration stops being sufficient. That is the moment to look at lenses.
