# ADR-0003: Every pack carries its own React

- **Status:** accepted; supersedes the "shared" hosting mode
- **Date:** 2026-11-08

## Context

The plan for two hosting modes assumed an import map: the shell publishes React at a stable URL, packs
mark `react` external, and both resolve to one module instance — necessary because hooks are per-renderer
and two copies throw `invalid hook call` at the first `useState`.

It was attempted and failed, twice, at runtime rather than at build:

1. `react`, `react-dom` and `react-dom/client` external → **`Dynamic require of "react" is not supported`**.
2. Only `react` external → **`Calling require for "react" in an environment that doesn't expose the
   require function`**.

The cause is not configuration. **React 19 ships CommonJS only**, and Vite 8's bundler will not externalise
a CJS dependency into a browser ESM graph. Along the way the toolchain also produced a 0-byte vendor file
from `export *` over an external, and a 7.9 kB file with no `export` statements at all — each of which
looked fine in the build log and failed as a blank screen on a device.

esbuild does produce real ESM exports, which is how the failure was diagnosed: the problem was never
export generation, it was the shell's own graph needing a `require` that does not exist.

## Decision

**A pack bundles its own React and renders in its own document.** `isolation: "shared"` is withdrawn: a
manifest declaring it is refused with a sentence that names the replacement, rather than mounting a frame
that will not work.

## Consequences

- Every pack carries React and ReactDOM, roughly 200 kB before its own code. Acceptable for the domains
  this hosts; it is a real cost and this is where it is recorded.
- No shared React context between the shell and a pack. State crosses only through the frame bridge,
  which was already true by design.
- A pack is isolated by construction rather than by choice, which simplifies the contract: there is one
  hosting mode, not two.
- The vendor-entry machinery was reverted rather than left inert. Dead build steps that look meaningful
  are worse than none.
- **This is the record to supersede** if the bundler situation changes — a bundler that externalises CJS
  into browser ESM, or a React build that ships ESM. The import map is a good idea the toolchain does not
  currently support.
