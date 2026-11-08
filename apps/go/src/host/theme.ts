import type { ColorScheme, ThemeDensity, ThemeTokens } from "@suite/go";

/**
 * The seam the theme system plugs into.
 *
 * The values here are resolved once, at the root, and handed to every module. A
 * module reads CSS variables from the shell's stylesheet instead of naming a colour,
 * so a palette change is one file and no module moves.
 *
 * **This is the swap point.** When the suite's shared theme tokens land, this
 * function returns them and the shell's placeholder custom properties in
 * `styles.css` are replaced by the token source. Nothing else changes: no module
 * imports a colour, and `ThemeTokens` already carries the shape they arrive in.
 */

export const DENSITIES: readonly ThemeDensity[] = ["compact", "cozy", "comfortable"];

export const DEFAULT_DENSITY: ThemeDensity = "comfortable";

function currentScheme(): ColorScheme {
  return globalThis.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function resolveTheme(density: ThemeDensity = DEFAULT_DENSITY): ThemeTokens {
  return {
    scheme: currentScheme(),
    density,
    // Empty on purpose: the shell's custom properties are the token source for now,
    // and inventing a second set of values here would be two places to keep in sync.
    cssVariables: {},
  };
}

/**
 * Apply a density without a stylesheet reload: the scale is a single multiplier the
 * CSS reads, so changing it is one variable write.
 */
export function applyDensity(density: ThemeDensity): void {
  const scale = density === "compact" ? 0.875 : density === "cozy" ? 0.9375 : 1;
  document.documentElement.style.setProperty("--density-scale", String(scale));
  document.documentElement.dataset.density = density;
}
