# ADR-0004: Sync is an event, not a state

- **Status:** accepted
- **Date:** 2026-11-08

## Context

The product promise is "sync any app to any device, collaborate in any app". Mobile operating systems will
not support the naive implementation of it: a backgrounded app is suspended and then destroyed, and no
amount of architecture changes that. WeChat, often cited as the model, suspends a mini program's JS thread
after about five seconds and destroys it after thirty minutes unused — and WeChat holds privileges this app
will never have.

A CRDT removes the need for liveness. A document that is diverged is still correct; convergence happens
whenever two peers next exchange.

## Decision

**A device's document is locally authoritative and lives on disk. Sync is an action taken when there is
something to exchange, not a property the app maintains.**

- Sync runs when the app comes to the foreground, and during a session while it stays there.
- Nothing attempts to sync while the app is backgrounded. Backgrounding persists and releases (ADR-0005);
  it does not schedule work.
- Two directions are named explicitly, because they are not symmetric:
  - **Push** — local updates since the last exchange with a given peer.
  - **Pull** — a device syncs on open partly because it may be _behind_, which it cannot know without
    asking. "Only when there is new data" is therefore incomplete, and the UI copy must not imply
    otherwise.

## Consequences

- A visibly honest sync affordance is part of the design, not a nicety: last synced, syncing, offline with
  changes pending. It turns the platform limitation into something a person can see and trust.
- Waking a sleeping device is out of scope until there is a channel for it — see ADR-0006.
- Nothing here depends on identity or membership, so the sync scope can grow from one device to several to
  collaboration without reopening this decision.
- The relay's role stays "deliver frames when someone is connected", which is what a blind relay can do
  without reading documents.
