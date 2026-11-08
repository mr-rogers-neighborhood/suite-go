# Copilot instructions — Suite Go

Read [AGENTS.md](../AGENTS.md) for the repo map, the two rules and the sharp edges, and
[docs/reference/contract.md](../docs/reference/contract.md) for what a module may do.

## Always

- Use pnpm from the repo root; never npm or yarn.
- Domain data goes through that domain's own core package, never raw Loro, and never through the
  container.
- The container carries bytes and a name. It does not parse an envelope, and it does not branch on a
  module id.
- Keep TypeScript strict; no `any` without a justified `biome-ignore`.
- Every subscription, timer and document handle a module takes must be released in `dispose`.
- Conventional commit messages; docs change with the code they describe.
- Run the local gate after each edit batch: `pnpm check`.
- All verification gates are local. Name the local command; never claim an external CI service gates
  `main`.

## Device work

- Verify on a device by asking the app, not by reading a screenshot: `pnpm android:eval "…"`. WebView
  content is invisible to `uiautomator` and screenshot diffing guesses.
- `pnpm doctor` is the first command when a build fails on the toolchain.
- Do not regenerate `apps/go/android`. `cap add android` would drop the hand-edited share intent.

## Files

Components are `PascalCase.tsx`; everything else is `camelCase.ts`; tests are co-located
`*.test.ts`. Type-only imports use `import type`.
