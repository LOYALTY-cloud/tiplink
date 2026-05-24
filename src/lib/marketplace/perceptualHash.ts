import sharp from "sharp";

/**
 * Computes an 8x8 Average Hash (aHash) of an image buffer.
 * Returns a 16-char lowercase hex string.
 *
 * aHash algorithm:
 *  1. Resize to 8×8 grayscale
 *  2. Calculate mean pixel value
 *  3. Each bit = 1 if pixel >= mean, else 0
 *  4. Convert 64 bits → 16 hex chars
 */
export async function computeAverageHash(imageBuffer: Buffer): Promise<string> {
  const { data } = await sharp(imageBuffer)
    .resize(8, 8, { fit: "fill" })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels = Array.from(data as Uint8Array);
  const avg = pixels.reduce((s, v) => s + v, 0) / pixels.length;

  let bits = "";
  for (const px of pixels) bits += px >= avg ? "1" : "0";

  let hex = "";
  for (let i = 0; i < bits.length; i += 4) {
    hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  }
  return hex; // 16 chars
}

/**
 * Hamming distance between two hex-encoded hashes.
 * Lower = more similar. ≤ 5 is considered a near-duplicate.
 */
export function hammingDistance(h1: string, h2: string): number {
  const len = Math.min(h1.length, h2.length);
  let dist = 0;
  for (let i = 0; i < len; i++) {
    const xor = parseInt(h1[i], 16) ^ parseInt(h2[i], 16);
    dist += xor.toString(2).split("1").length - 1;
  }
  return dist;
}

/** Returns true if two hashes are visually near-identical (≤ 5 bit difference). */
export function isNearDuplicate(h1: string, h2: string): boolean {
  return hammingDistance(h1, h2) <= 5;
}
