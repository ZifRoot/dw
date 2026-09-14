"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bufferToUUID = bufferToUUID;
exports.uuidToBuffer = uuidToBuffer;
exports.normalizeUUID = normalizeUUID;
function bufferToUUID(buffer) {
    if (buffer == null)
        return "";
    const hex = buffer.toString("hex");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
function uuidToBuffer(uuid) {
    return new Uint8Array(Buffer.from(uuid.replace(/-/g, ""), "hex"));
}
function normalizeUUID(input) {
    if (typeof input !== "string")
        return null;
    let candidate = input;
    if (input.startsWith("file-")) {
        candidate = input.substring(5);
    }
    const cleaned = candidate.replace(/-/g, "").toLowerCase();
    const hexRegex = /^[0-9a-f]{32}$/;
    if (!hexRegex.test(cleaned)) {
        return null;
    }
    const parts = [cleaned.substring(0, 8), cleaned.substring(8, 12), cleaned.substring(12, 16), cleaned.substring(16, 20), cleaned.substring(20, 32)];
    return parts.join("-");
}
