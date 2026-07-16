import assert from "node:assert/strict";
import { evaluateVisualDelivery } from "../lib/visual-compiler/visual-delivery-policy.ts";

const expected = ["slide-1", "slide-2", "slide-3"];
const native = evaluateVisualDelivery(expected, {});
assert.equal(native.allowed, true);
assert.equal(native.mode, "native_fallback");
assert.equal(native.missingVisualIds.length, 3);

const complete = evaluateVisualDelivery(expected, {
  "slide-1": "data:image/png;base64,one",
  "slide-2": "data:image/png;base64,two",
  "slide-3": "data:image/png;base64,three",
});
assert.equal(complete.allowed, true);
assert.equal(complete.mode, "generated_complete");
assert.equal(complete.missingVisualIds.length, 0);

const partial = evaluateVisualDelivery(expected, { "slide-1": "data:image/png;base64,one" });
assert.equal(partial.allowed, false);
assert.equal(partial.mode, "generated_partial");
assert.deepEqual(partial.missingVisualIds, ["slide-2", "slide-3"]);

console.log(JSON.stringify({ pass: true, native, complete, partial }, null, 2));
