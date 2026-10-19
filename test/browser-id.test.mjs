import { test } from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { createLocalId } from "../src/browser-id.ts";
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test("HTTP-style crypto without randomUUID reproduces the previous task-add failure and supports draft IDs", () => {
  const httpCrypto = {
    getRandomValues: webcrypto.getRandomValues.bind(webcrypto),
  };
  assert.throws(() => httpCrypto.randomUUID(), TypeError);
  const ids = Array.from({ length: 1000 }, () => createLocalId(httpCrypto));
  assert.ok(ids.every((id) => uuid.test(id)));
  assert.equal(new Set(ids).size, ids.length);
});
test("native randomUUID is called with its crypto receiver", () => {
  const source = {
    randomUUID() {
      assert.equal(this, source);
      return "native-id";
    },
    getRandomValues() {
      throw Error("Fallback should not be called");
    },
  };
  assert.equal(createLocalId(source), "native-id");
});
test("fallback sets UUID version and variant bits even when random bytes are all zero or all ones", () => {
  for (const fill of [0, 255]) {
    assert.match(
      createLocalId({ getRandomValues: (bytes) => bytes.fill(fill) }),
      uuid,
    );
  }
});
