/**
 * Things the phone hands the suite from outside it: a share sheet, a link, a file.
 *
 * The container's job here is small and worth protecting. It receives an intent,
 * matches its `kind` against what each module *declared* it accepts, and hands the
 * payload to one module. It never inspects the payload beyond the MIME type and
 * it never learns what the payload means — a URL shared from a browser is the same
 * shape of thing whether a planner or a budget ends up owning it.
 */
/**
 * The kinds a share intent can arrive as.
 *
 * `file` is here from the start because Android can send one, and a container that
 * accepts text but crashes on an image share is worse than one that says it has
 * nowhere to put it. No module has to accept it.
 */
export type CaptureKind = "text" | "url" | "file";
export interface CaptureIntent {
    readonly kind: CaptureKind;
    /** The text, the URL, or a `content://` URI. Opaque to the container. */
    readonly body: string;
    readonly mimeType?: string;
    /** Where it came from, for a module that wants to say so. e.g. `android.share`. */
    readonly source?: string;
}
/**
 * What a module did with an intent.
 *
 * `ok: false` is a real answer, not an error: a module may decline after accepting
 * the kind, and the person should be told why rather than shown a generic failure.
 */
export type CaptureOutcome = {
    readonly ok: true;
    readonly documentId?: string;
    readonly message?: string;
} | {
    readonly ok: false;
    readonly reason: "refused" | "failed";
    readonly message: string;
};
/** Runs after the module is mounted. Routing happened on the declaration. */
export type CaptureHandler = (intent: CaptureIntent) => Promise<CaptureOutcome>;
//# sourceMappingURL=capture.d.ts.map