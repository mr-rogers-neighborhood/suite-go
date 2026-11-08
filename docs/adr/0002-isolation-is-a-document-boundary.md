# ADR-0002: Isolation is a document boundary, not a sandbox

- **Status:** accepted
- **Date:** 2026-11-08

## Context

An `isolated` pack renders in an `<iframe>` served from the pack's own install directory. It was tempting
to call this a sandbox. Two facts say otherwise.

**Measured, on the emulator:**

|                          | Shell JS heap |
| ------------------------ | ------------- |
| Before opening the frame | 14 MB         |
| Frame open               | 14 MB         |
| Frame holding 640 MB     | **14 MB**     |

So the frame has its own JS heap and a runaway allocation exhausts its own isolate rather than the
shell's. That is real and worth having.

**Also measured:** the frame is same-origin. `contentDocument` is reachable from the shell, and the frame
can reach `window.parent`. The bridge uses `postMessage` because that is the contract, not because the
browser forces it. A pack that wanted to reach into the shell could.

## Decision

Call it what it is: **document isolation**. Separate document, separate CSS scope, separate JS heap.

Two boundaries are named separately, because conflating them is how a doc ends up claiming a guarantee it
does not have:

1. **The capability boundary protects data.** The host only answers for declared capabilities (ADR-0001).
   This works at any origin and is the boundary that stops one pack reading another's documents.
2. **The origin boundary protects the shell.** Not present today. A frame served from a distinct origin is
   the browser's real sandbox: no parent access, `postMessage` only — which the bridge already uses.

**The word "sandbox" does not appear in this repository's docs** until the origin boundary exists. Not as
style: a claim of sandboxing that a reader could disprove in the WebView console is worse than no claim.

## Consequences

- A pack can reach the shell's DOM today. That is acceptable while every pack is first-party and is
  stated in `docs/reference/packs.md` rather than left for someone to discover.
- The upgrade path is web work, not native: serve packs under a synthetic hostname instead of `localhost`,
  which Capacitor can do by intercepting requests. It is written down here as the next step and a spike,
  not as a promise.
- What no boundary short of a separate APK provides is protection against a pack exploiting the browser
  itself. That risk is the same as any web content and is not solved by anything in this repository.
- A second pack author makes the origin work a prerequisite rather than a nicety.
