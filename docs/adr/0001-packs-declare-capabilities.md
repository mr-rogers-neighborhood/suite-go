# ADR-0001: A pack declares its capabilities, and the host enforces them

- **Status:** accepted
- **Date:** 2026-11-08

## Context

A pack receives a `ModuleHost` and, through it, every document the app holds, per-module storage, the
file service and the network. Nothing in the manifest says what it intends to use, and nothing in the host
checks.

That is defensible for three packs written by one person and read by the same person. It stops being
defensible the moment a pack comes from anywhere else, because the host has no way to answer "what may
this thing touch?" — and the answer today is "everything".

The discussion that prompted this record named the capability model as the unspoken hard part of the
platform framing. It is hard for a reason worth stating: a capability model is cheap to add before there
are packs and expensive to add after, because every existing pack has to be re-examined.

## Decision

The manifest gains a `capabilities` list, and **the host refuses anything not declared**.

```jsonc
{
  "id": "canvas",
  "capabilities": ["documents", "storage", "files"]
}
```

- Deny by default. An empty or absent list means the pack may render and do nothing else.
- Coarse on purpose. The first set is `documents`, `storage`, `files`, `network`, `recents` — a
  vocabulary a person can reason about without reading the code. A finer split (read versus write) waits
  until a pack needs the distinction.
- **Enforced per request** in the frame bridge, not at install time alone. A check at install protects
  nobody; the request is where the data would actually move.
- The built-in modules are exempt: they ship inside the binary and are reviewed as part of it. Being
  exempt is a property of the build, not a flag a pack can set.

## Consequences

- The manifest grows a field and the contract version moves with it. An older pack installs and then
  finds its requests refused, so the refusal has to name the capability and the pack version.
- The capability list becomes the thing to read before trusting a pack. That is the point: it turns
  "should I trust this?" into a list of four words.
- Refusals are per request, so a pack that half-works fails at the first undeclared call rather than at
  mount. That is later than ideal and is the price of checking where the data is.
- **`network` is declared but advisory.** The host cannot stop a pack from calling `fetch` while the
  pack shares the shell's origin (ADR-0002). It becomes enforceable with the origin boundary; until
  then the list is honest about which entries are checked.
- A pack cannot escalate by declaring more in a later version: an upgrade goes through the same
  verification and the same review, and a capability appearing in a diff is the signal to look.
