/**
 * The pack's half of the frame bridge.
 *
 * A domain calls `host.documents.save(...)` exactly as it would in the shell's document; this
 * turns that into a request and awaits the answer. The vocabulary is `ModuleHost`'s on purpose —
 * a pack that had a different shape in each mode would be two integrations, not one.
 *
 * Requests are serialised through one promise chain rather than fired in parallel, because the
 * shell answers in order and a save that overtook the create it depends on would fail in a way
 * that reads like a storage bug.
 */
import type { ModuleHost, ThemeTokens } from "./host.js";
export interface FrameHostOptions {
    readonly moduleId: string;
    /** The shell's window. Defaults to `window.parent`, which is why this only works in a frame. */
    readonly parent?: Window;
}
export declare function createFrameHost(options: FrameHostOptions): ModuleHost & {
    currentTheme(): Promise<ThemeTokens>;
    dispose(): void;
};
//# sourceMappingURL=frameClient.d.ts.map