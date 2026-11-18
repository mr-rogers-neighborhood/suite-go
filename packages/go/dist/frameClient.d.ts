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
    /**
     * How long a request may wait for an answer before it is rejected.
     *
     * There was no timeout, and the consequence was worse than it looks: requests are serialised through
     * one chain, so a single unanswered request stalled **every** later one — including the debounced
     * save. A reply is dropped when the frame's window is gone (`serveFrame` returns early), so this is
     * reachable, not theoretical; it was only invisible because a frame usually dies with its realm.
     *
     * Ten seconds is generous on purpose: a cold start loads 3.6 MB of WebAssembly before the first
     * document call, and rejecting a slow boot would be a worse bug than the one this fixes.
     */
    readonly requestTimeoutMs?: number;
}
export declare function createFrameHost(options: FrameHostOptions): ModuleHost & {
    currentTheme(): Promise<ThemeTokens>;
    dispose(): void;
};
//# sourceMappingURL=frameClient.d.ts.map