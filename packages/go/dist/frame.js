export const FRAME_PROTOCOL = "suite.frame.v1";
/**
 * Is this message from the frame protocol at all?
 *
 * Checked before anything else touches a message: a page receives messages from anything that
 * holds a reference to it, and reading `request.method` off a stranger is how a typo becomes a
 * crash in a domain's mount.
 */
export function isFrameEnvelope(value) {
    if (typeof value !== "object" || value === null)
        return false;
    const candidate = value;
    if (candidate.protocol !== FRAME_PROTOCOL)
        return false;
    if (typeof candidate.id !== "number")
        return false;
    if (typeof candidate.request !== "object" || candidate.request === null)
        return false;
    const request = candidate.request;
    return typeof request.method === "string";
}
export function isFrameReply(value) {
    if (typeof value !== "object" || value === null)
        return false;
    const candidate = value;
    return (candidate.protocol === FRAME_PROTOCOL &&
        typeof candidate.id === "number" &&
        typeof candidate.ok === "boolean");
}
//# sourceMappingURL=frame.js.map