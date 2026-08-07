import { compressSync, decompressSync, strFromU8, strToU8 } from "fflate";

export const COMPRESSED_STORAGE_PREFIX = "fitlog:deflate:v1:";
export const STORAGE_COMPRESSION_THRESHOLD_BYTES = 256 * 1024;

export interface EncodedStorageValue {
  value: string;
  rawBytes: number;
  storedBytes: number;
  compressed: boolean;
}

function utf8Bytes(value: string) {
  return strToU8(value).length;
}

/** A conservative quota estimate because several browsers account UTF-16 code units. */
export function localStorageBytes(value: string) {
  return value.length * 2;
}

function bytesToBase64(value: Uint8Array) {
  return btoa(strFromU8(value, true));
}

function base64ToBytes(value: string) {
  return strToU8(atob(value), true);
}

export function encodeStorageValue(input: unknown): EncodedStorageValue {
  const json = JSON.stringify(input);
  const rawBytes = utf8Bytes(json);
  const raw: EncodedStorageValue = {
    value: json,
    rawBytes,
    storedBytes: localStorageBytes(json),
    compressed: false,
  };
  if (rawBytes < STORAGE_COMPRESSION_THRESHOLD_BYTES) return raw;

  const compressed = compressSync(strToU8(json), { level: 3, mem: 8 });
  const value = `${COMPRESSED_STORAGE_PREFIX}${bytesToBase64(compressed)}`;
  // Keep plain JSON if compression does not create meaningful quota headroom.
  if (value.length >= json.length * 0.9) return raw;
  return {
    value,
    rawBytes,
    storedBytes: localStorageBytes(value),
    compressed: true,
  };
}

export function decodeStorageValue(value: string): unknown {
  if (!value.startsWith(COMPRESSED_STORAGE_PREFIX)) return JSON.parse(value);
  const payload = value.slice(COMPRESSED_STORAGE_PREFIX.length);
  if (!payload) throw new Error("压缩存储内容为空");
  const json = strFromU8(decompressSync(base64ToBytes(payload)));
  return JSON.parse(json);
}
