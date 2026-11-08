/**
 * Things the phone hands the suite from outside it: a share sheet, a link, a file.
 *
 * The container's job here is small and worth protecting. It receives an intent,
 * matches its `kind` against what each module *declared* it accepts, and hands the
 * payload to one module. It never inspects the payload beyond the MIME type and
 * it never learns what the payload means — a URL shared from a browser is the same
 * shape of thing whether a planner or a budget ends up owning it.
 */
export {};
//# sourceMappingURL=capture.js.map