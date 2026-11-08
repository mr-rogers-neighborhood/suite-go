import type { CapacitorConfig } from "@capacitor/cli";
import { appId, appName, webDir } from "./app.config.json";

/**
 * The one native identity for Suite Go.
 *
 * `appId` is also the Android applicationId, so it is what `scripts/android.mjs`
 * launches and what a future invite link would name. It is read from the shared
 * JSON rather than written twice.
 */
const config: CapacitorConfig = {
  appId,
  appName,
  webDir,
  android: {
    // The app is local-first and serves its own bundle from the APK. Nothing should
    // ever be loaded over cleartext, so the allowance is off rather than narrowed.
    allowMixedContent: false,
  },
};

export default config;
