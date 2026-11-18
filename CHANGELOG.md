# Changelog

What changed, in a person's words rather than commits.

## Unreleased

No changes yet.

## [0.1.0] - 2026-11-18

The first version with a real domain in it, and the first with a number in more than one place.

### Added

- **Planner runs here.** It installs as a signed pack and opens a real `.planner`: edit, leave the
  module, come back, kill the app and reopen, and the document is there. The container still knows no
  domain — everything Planner knows about itself lives in its own repository.
- **`android:release`**, which builds a release APK from a keystore in the environment and refuses to
  start without one. A debug build is what you iterate with; this is the one that is a promise.
- **A version**, in `app.config.json`, repeated in `package.json` and passed to Gradle. A test fails
  if the three disagree, because an APK whose version disagrees with its own package tells every
  install there is no update.

### Changed

- **A pack that does not declare `network` now has to prove it cannot reach one.** Its entry document
  must carry a `Content-Security-Policy` with `default-src 'self'` and `connect-src 'self'` (or
  `'none'`), and the install refuses it otherwise. `'self'` rather than `'none'` because Loro's wasm
  is fetched same-origin — `'none'` produces a blank frame.
- **`pnpm check` verifies the committed package output.** It ships for git consumers, and a `dist`
  that disagrees with its source hands them something nobody built.

### Fixed

- **A pack asking for its own documents received every module's.** The module filter was dropped on
  the way to the shell, so a pack could open another domain's file — and could enumerate them.
- **A request that was never answered stalled every later one.** Replies are dropped when a frame's
  window is gone, and the requests share one queue, so a lost reply silently stopped the debounced
  save. It now fails after ten seconds and names the method.

**The container exists, and it has not been sold a lie yet.**

`@suite/go` is the module contract: a domain declares an id, a name, which capabilities it claims and
which capture kinds it accepts, and the container routes on that declaration without running a line of
domain code. `ModuleHost` hands a mounted module a document store that carries bytes and cannot read
them, namespaced key-value storage, the container's chrome, and resolved theme values.

The shell is a Capacitor app with a home screen in three bands: a capture bar that doubles as the
target picker, pinned domain tiles, and recents. With no domains installed it says so, in the places
the content will appear rather than in a modal that apologises for an empty state.

`pnpm android:install` builds an APK, installs it over USB and launches it; `pnpm android:watch` repeats
that on every save. `pnpm doctor` reports the toolchain and prints the command that fixes whatever is
missing — including the two failures that only ever happen to a person setting this up once.
