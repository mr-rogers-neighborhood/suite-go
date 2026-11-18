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

## Amendment — 2026-11-18: the upgrade path is not web work

One consequence above is wrong on the mechanism, and the correction changes who does the work.

> _The upgrade path is web work, not native: serve packs under a synthetic hostname instead of
> `localhost`, which Capacitor can do by intercepting requests._

Capacitor does intercept requests, but it routes by **path** on **one** origin, not by host:

- `@capacitor/android@8.6.0` has exactly one hostname (`CapConfig.hostname`, default `"localhost"`,
  set from `server.hostname` — `CapConfig.java`). There is no per-host setting.
- `WebViewLocalServer.shouldInterceptRequest` matches the request against a `UriMatcher` of registered
  **paths** (`WebViewLocalServer.java`), and `isMainUrl` compares against that single hostname.

A synthetic hostname therefore buys a rename, not a partition: every pack would still share one origin
with the shell, because path prefixes do not create origins. Distinct origins per pack need a
`WebViewClient` that dispatches on `Uri.getHost()` (Android) and the equivalent handler on iOS —
**native work**, in this repository's Android project and again in the iOS one that does not exist yet.

What that changes:

1. **"A second pack author makes the origin work a prerequisite"** still holds, but the prerequisite
   costs native code, not a config value. It should be scoped as an Android spike with a measurement,
   the way this record scoped the heap question, rather than described as a setting.
2. **The trigger is narrower than authorship.** A pack whose build passes through _this_ repository's
   review is covered by the capability boundary. One whose build arrives from another repository's
   gate is not, even when it is signed by the same key — "first-party" then means "we pinned the key",
   not "we read the code in the same change". That is the moment the origin boundary stops being a
   nicety, and it arrives before a third-party author does.
3. **Nothing about the isolation claim changes.** This record's refusal of the word "sandbox" is
   correct today and stays correct after the origin work lands; a distinct origin is a browser
   boundary, not a process one.

## Amendment 2 — 2026-11-18: the first amendment over-corrected

Amendment 1 replaced "web work" with "native work", which is true of one platform and false of another.
The distinction is not pedantic; it decides whether the work can be done here at all.

| Platform                        | Can a host give each pack its own origin from configuration? | Mechanism                                                                                                                                                                                                                                                 |
| ------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Electron**                    | **Yes, in ordinary code**                                    | A custom scheme registered as privileged (`protocol.handle`), served per pack. **Documented:** OpenYoghurt does exactly this — a `miniapp://` scheme per mini app, in a sandboxed iframe, with `connect-src 'none'` enforced by the iframe's own policy   |
| **Capacitor** (this repository) | **No**                                                       | One `server.hostname` for the whole app (`CapConfig.hostname`), and `WebViewLocalServer` routes by **path** through a `UriMatcher`. Distinct origins require a `WebViewClient` dispatching on `Uri.getHost()` — native code, on Android, and again on iOS |

So the correct statement is: **per-pack origins are cheap wherever the host owns its request handling, and
native where it does not.** We ship Capacitor, so for us it is native — for now.

A consequence worth recording, because it is the part that scales: a pack's **own** Content-Security-Policy
is enforced by the browser regardless of the origin it shares. That is why `packDocumentSealsNetwork` exists:
it turns `network` from advisory into a condition of installation without needing the origin boundary at
all. The origin boundary is still the only thing that stops a pack reaching `window.parent`; the policy
stops it reaching the internet.
