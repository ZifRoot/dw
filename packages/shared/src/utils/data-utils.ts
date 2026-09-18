export function delay(ms: number) {
  if (ms <= 0) return;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function safe<T>(fn: () => Promise<T>, _default?: T) {
  try {
    return await fn();
  } catch (error) {
    console.error(error);
    return _default;
  }
}

export function safeSync<T>(fn: () => T, _default?: T) {
  try {
    return fn();
  } catch (error) {
    console.error(error);
    return _default;
  }
}

export function subtractSets<T>(A: T[], B: T[]) {
  let setB = new Set([...B]);
  return [...new Set([...A].filter((x) => !setB.has(x)))];
}

export function removeByIndices<T>(arr: T[], indices: number[], del: (p: T) => void, add: (index: number, p: T) => void): void {
  // Уникальные индексы, отсортированные по убыванию
  const toDelete = indices.filter((i) => i >= 0 && i < arr.length).sort((a, b) => b - a);
  let prev = -1;
  for (const idx of toDelete) {
    if (idx === prev) continue;
    prev = idx;
    if (idx >= arr.length) continue;
    const removedObj = arr[idx];
    del(removedObj);
    if (idx === arr.length - 1) {
      arr.pop();
    } else {
      add(idx, (arr[idx] = arr.pop()!));
    }
  }
}

export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

const regex = /^```(?<lang>[^\r\n]*)(?:\r\n|\n|\r)(?<code>[\s\S]*?)^```$/gm;

export function md(text: string) {
  return [...text.matchAll(regex)].map((match) => ({ lang: match.groups!.lang, code: match.groups!.code }));
}

// --- FNV-1a 64-bit ---
const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const MASK = 0xffffffffffffffffn;

function fnv1a64(str: string) {
  let hash = FNV_OFFSET;
  for (let i = 0; i < str.length; i++) {
    hash ^= BigInt(str.charCodeAt(i));
    hash = (hash * FNV_PRIME) & MASK;
  }
  return hash; // BigInt, 0 .. 2^64-1
}

// --- BigInt (uint64) -> Uint8Array(8 байт, big-endian) ---
function longToBytes(n: bigint) {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigUint64(0, n, false); // false = big-endian
  return bytes;
}

// --- Uint8Array -> base64url (новый нативный метод) ---
function bytesToBase64url(bytes: Uint8Array<ArrayBuffer>) {
  return bytes.toBase64({ alphabet: "base64url", omitPadding: true });
}

// --- Одним вызовом ---
export function hashX1(str: string) {
  return bytesToBase64url(longToBytes(fnv1a64(str)));
}
