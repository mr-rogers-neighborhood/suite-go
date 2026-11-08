# ADR-0005: Flush on lifecycle boundaries

- **Status:** accepted
- **Date:** 2026-11-08

## Context

Local-first means the file on the device is the truth. That is only true if it is on the device _before_
the process dies — and on a phone the process dies without warning: an out-of-memory kill, a swipe from the
task switcher, a battery decision.

The Scratch module saves on a 300 ms debounce. That is the right shape for typing and a real data-loss
window at the wrong moment, and the same window would apply to every pack unless the rule is set
somewhere.

## Decision

**Flush at every boundary where the person is no longer in the middle of an edit**, with a short debounce
between those boundaries:

- The app leaves the foreground (`appStateChange`).
- A module is released — back, hardware back, idle timeout, or a pack being uninstalled.
- A document is closed or replaced.

The debounce stays for the interval between boundaries. Write-through on every keystroke would be simpler
to reason about and worse to use.

## Consequences

- The teardown path is load-bearing. `closeModule` already awaits a module's cleanup, and that awaiting is
  what makes this decision true rather than aspirational.
- A pack must not be able to skip the flush. The host disposes it and does not ask it to cooperate, which
  is why `dispose()` returning a promise is part of the contract.
- A crash inside the debounce window still loses the tail of an edit. That is accepted; the alternative is
  a synchronous write per keystroke on a phone.
- Write amplification is bounded by boundaries rather than by keystrokes, so a long editing session
  produces as many writes as the person produces backgroundings plus a floor from the debounce.
