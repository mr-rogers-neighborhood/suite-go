import type { ColorScheme, ThemeDensity, ThemeTokens } from "@suite/go";
import {
  applyTheme,
  colorSchemeFor,
  cssVariables,
  defaultTheme,
  type ThemeMode,
} from "@suite/theme";

/**
 * The palette belongs to `@suite/theme`, not to this app.
 *
 * Everything here is wiring: resolve which mode the phone is in, hand the theme and the
 * mode to the suite's `applyTheme`, and keep our own density as an attribute. No colour is
 * named in this file, and none should ever be.
 */

export const DENSITIES: readonly ThemeDensity[] = ["compact", "cozy", "comfortable"];

export const DEFAULT_DENSITY: ThemeDensity = "comfortable";

const DENSITY_KEY = "suite-go:shell:density";

function preferredMode(): ThemeMode {
  return globalThis.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** What the theme resolves to right now, for anything that needs the values rather than the paint. */
export function resolveTheme(density: ThemeDensity = readDensity()): ThemeTokens {
  const mode = preferredMode();
  return {
    scheme: colorSchemeFor(mode) as ColorScheme,
    density,
    cssVariables: cssVariables(defaultTheme(), mode),
  };
}

/** Paint the suite's theme onto the document. Idempotent; call it on every mode change. */
export function paintTheme(): ThemeTokens {
  const mode = preferredMode();
  applyTheme(defaultTheme(), mode, document.documentElement);
  applyDensity(readDensity());
  return resolveTheme(readDensity());
}

/** Repaint when the phone switches between light and dark. Returns the unsubscribe. */
export function watchColorScheme(onChange: (tokens: ThemeTokens) => void): () => void {
  const query = globalThis.matchMedia?.("(prefers-color-scheme: dark)");
  if (!query) return () => undefined;
  const listener = () => onChange(paintTheme());
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}

export function readDensity(): ThemeDensity {
  const stored = localStorage.getItem(DENSITY_KEY);
  return DENSITIES.includes(stored as ThemeDensity) ? (stored as ThemeDensity) : DEFAULT_DENSITY;
}

export function applyDensity(density: ThemeDensity): void {
  document.documentElement.dataset.density = density;
  localStorage.setItem(DENSITY_KEY, density);
}
