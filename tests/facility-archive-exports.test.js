import test from "node:test";
import assert from "node:assert/strict";
import {facilityHandler} from "../server/facility.js";
import {archiveHandler} from "../server/archive.js";

test("the production integration exports the server-authorized handlers",()=>{
  assert.equal(typeof facilityHandler,"function");
  assert.equal(typeof archiveHandler,"function");
});
