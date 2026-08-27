// `stateIdToRef` produces the state ref that every JS client
// interpolates into a `/__/reboot/rpc/<state ref>/...` URL path, and
// `reboot/routing/filters/mangled_http_path.lua` decodes back out of
// that path. The `luaDecode` helper below mirrors that filter, so
// these tests fail when either half drifts from the other.
import { stateIdToRef } from "@reboot-dev/reboot-api";
import { describe, expect, it } from "vitest";

const STATE_TYPE = "com.example.Foo";

// Spelled out rather than imported from `ILLEGAL_STATE_ID_CHARACTERS`,
// so that dropping a character from that constant fails this test
// instead of quietly narrowing it.
const ILLEGAL_CHARACTERS = ["\0", "\n", "\\"];

// Every printable ASCII character a state ID is allowed to hold.
const PRINTABLE_ASCII = Array.from({ length: 0x7e - 0x20 + 1 }, (_, offset) =>
  String.fromCharCode(0x20 + offset)
).filter((character) => !ILLEGAL_CHARACTERS.includes(character));

// `mangled_http_path.lua` decodes every `%XX` in one `gsub` pass,
// which never rescans its own replacements.
const luaDecode = (stateRef: string): string =>
  stateRef.replace(/%([0-9A-Fa-f]{2})/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16))
  );

// The inverse of `_state_id_encode` in `reboot/aio/types.py`, applied
// to what the Lua filter hands to the `x-reboot-state-ref` header.
const stateIdSeenByTheServer = (stateRef: string): string =>
  luaDecode(stateRef.slice(`${STATE_TYPE}:`.length)).replace(/\\/g, "/");

const rpcPath = (stateRef: string): string =>
  `/__/reboot/rpc/${stateRef}/rbt.v1alpha1.React/Query`;

describe("a state ref carried in a URL path", () => {
  it("spells out an id that needs no encoding", () => {
    expect(stateIdToRef(STATE_TYPE, "plain-id")).toBe(
      "com.example.Foo:plain-id"
    );
  });

  it("escapes a slash, which separates colocated components", () => {
    expect(stateIdToRef(STATE_TYPE, "a/b")).toBe("com.example.Foo:a%5Cb");
  });

  it("encodes characters that would otherwise end the path", () => {
    expect(stateIdToRef(STATE_TYPE, "a#b")).toBe("com.example.Foo:a%23b");
    expect(stateIdToRef(STATE_TYPE, "a?b")).toBe("com.example.Foo:a%3Fb");
  });

  it("refuses the characters the backend refuses", () => {
    for (const character of ILLEGAL_CHARACTERS) {
      expect(() => stateIdToRef(STATE_TYPE, `a${character}b`)).toThrow(
        /must not contain/
      );
    }
  });

  it.each(PRINTABLE_ASCII)(
    "leaves the path and the query intact around %j",
    (character) => {
      // A raw `#` or `?` truncates the path here, which used to leave
      // the method segment off the request entirely.
      const path = rpcPath(stateIdToRef(STATE_TYPE, `a${character}b`));
      const url = new URL(`https://app.example.com${path}`);
      expect(url.hash).toBe("");
      expect(url.search).toBe("");
      expect(url.pathname).toBe(path);
    }
  );

  it.each(PRINTABLE_ASCII)(
    "names a fragment-free WebSocket URL around %j",
    (character) => {
      // `new WebSocket()` throws a `SyntaxError` on any URL carrying a
      // fragment, so a `#` reaching it unencoded breaks every reactive
      // reader and every mutation on that state.
      const url = new URL(
        `wss://app.example.com` +
          rpcPath(stateIdToRef(STATE_TYPE, `a${character}b`))
      );
      expect(url.hash).toBe("");
    }
  );

  it.each(PRINTABLE_ASCII)(
    "round-trips an id holding %j back to the caller's spelling",
    (character) => {
      const id = `a${character}b`;
      expect(stateIdSeenByTheServer(stateIdToRef(STATE_TYPE, id))).toBe(id);
    }
  );

  it("round-trips the ids our own users have run into", () => {
    for (const id of [
      // An Auth0 `sub` looks like this.
      "google-oauth2|1234567890",
      // A literal `%` must not be read as the start of an escape.
      "100%25done",
      "a%23b",
      // A `/` is the one character with an encoding of its own.
      "some/nested/path",
    ]) {
      expect(stateIdSeenByTheServer(stateIdToRef(STATE_TYPE, id))).toBe(id);
    }
  });
});
