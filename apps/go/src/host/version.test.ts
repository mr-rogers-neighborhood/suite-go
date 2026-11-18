import { describe, expect, it } from "vitest";
import appConfig from "../../app.config.json" with { type: "json" };
import pkg from "../../package.json" with { type: "json" };
import gradle from "../../android/app/build.gradle?raw" with { type: "raw" };

/**
 * One version, three places that must agree.
 *
 * `release.mjs` refuses a desktop release when `package.json` and `suite.app.json` disagree, because
 * an artifact whose tag names a version it does not contain tells every install there is no update.
 * An APK has the same trap one layer down: the JS package, the config the script reads, and the
 * numbers Gradle stamps are three separate files.
 *
 * The Gradle values are defaults only — the script overrides them — so what is checked here is that
 * the defaults have not been left behind.
 */
describe("the app's version", () => {
  it("is the same in package.json and app.config.json", () => {
    expect(pkg.version).toBe(appConfig.version);
  });

  it("is what Gradle would stamp if nobody passed a property", () => {
    expect(gradle).toContain(`?: "${appConfig.version}"`);
    expect(gradle).toContain(`?: "${String(appConfig.versionCode)}"`);
  });

  it("is a version a person can read", () => {
    expect(appConfig.version).toMatch(/^\d+\.\d+\.\d+$/u);
    expect(appConfig.versionCode).toBeGreaterThan(0);
  });
});
