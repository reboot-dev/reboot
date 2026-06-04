import { NativeLibrary, NativeServicer } from "@reboot-dev/reboot";

export * from "@reboot-dev/reboot-std-api/ciphertext/v1/ciphertext_rbt.js";

// The servicers are implemented in Python (the cryptography lives there);
// Node.js applications host them as "native" servicers.
export default {
  servicers: (): NativeServicer[] => {
    return [
      {
        nativeServicerModule: "reboot.std.ciphertext.v1.ciphertext",
      },
    ];
  },
};

/**
 * Serializes a string key/value map into canonical `associatedData`
 * bytes (an "encryption context", in AWS KMS terms).
 *
 * The same value must be supplied to `decrypt` as was passed to
 * `encrypt`, byte-for-byte, so the encoding is deterministic: the keys
 * are sorted, and each key and value is length-prefixed so that no value
 * can be confused for a delimiter. The Python `make_associated_data`
 * helper produces identical bytes, so a value encrypted from one
 * language decrypts from the other; use ASCII keys to keep the sort
 * order identical across languages.
 *
 *     associatedData: makeAssociatedData({ user_id: "42", purpose: "ssn" })
 */
export function makeAssociatedData(fields: Record<string, string>): Uint8Array {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (const key of Object.keys(fields).sort()) {
    const keyBytes = encoder.encode(key);
    const valueBytes = encoder.encode(fields[key]);
    for (const bytes of [
      uint32BigEndian(keyBytes.length),
      keyBytes,
      uint32BigEndian(valueBytes.length),
      valueBytes,
    ]) {
      chunks.push(bytes);
      length += bytes.length;
    }
  }
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function uint32BigEndian(value: number): Uint8Array {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, /* littleEndian= */ false);
  return bytes;
}

// Fixed id of the `KeyManager` singleton; crypto-shred a scope via
// `KeyManager.ref(APP_SHARED_KEY_MANAGER_ID).shred(context, { scope })`.
export const APP_SHARED_KEY_MANAGER_ID = "(key-manager)";

export const CIPHERTEXT_LIBRARY_NAME = "reboot.std.ciphertext.v1.ciphertext";

export function ciphertextLibrary(): NativeLibrary {
  return {
    nativeLibraryModule: "reboot.std.ciphertext.v1.ciphertext",
    nativeLibraryFunction: "ciphertext_library",
  };
}
