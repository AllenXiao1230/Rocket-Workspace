type SignatureMatch = { mimeType: string; offset?: number; signature: number[] };

const signatures: SignatureMatch[] = [
  { mimeType: "image/jpeg", signature: [0xff, 0xd8, 0xff] },
  { mimeType: "image/png", signature: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mimeType: "image/gif", signature: [0x47, 0x49, 0x46, 0x38, 0x37, 0x61] },
  { mimeType: "image/gif", signature: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61] },
  { mimeType: "application/pdf", signature: [0x25, 0x50, 0x44, 0x46, 0x2d] },
];

function hasSignature(payload: Uint8Array, signature: number[], offset = 0) {
  return signature.every((byte, index) => payload[offset + index] === byte);
}

function detectedMimeType(payload: Uint8Array) {
  if (hasSignature(payload, [0x52, 0x49, 0x46, 0x46]) && hasSignature(payload, [0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  return signatures.find((item) => hasSignature(payload, item.signature, item.offset))?.mimeType;
}

function isKnownExecutable(payload: Uint8Array) {
  return hasSignature(payload, [0x4d, 0x5a]) || hasSignature(payload, [0x7f, 0x45, 0x4c, 0x46]);
}

/**
 * Verifies file bytes at the upload seam and returns the MIME type safe to
 * persist. Binary formats with stable signatures must agree with the browser's
 * claimed type; known executable formats are never accepted as attachments.
 */
export function inspectUploadedFile(payload: Uint8Array, claimedMimeType: string) {
  const claimed = claimedMimeType.trim().toLowerCase();
  if (isKnownExecutable(payload)) throw new Error("不支援上傳可執行檔案");
  const detected = detectedMimeType(payload);
  if (detected && claimed && detected !== claimed) throw new Error("檔案內容與宣告的類型不符");
  if (["image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf"].includes(claimed) && !detected) throw new Error("無法驗證檔案內容類型");
  return { mimeType: detected || claimed || "application/octet-stream" };
}
