import test from "node:test";
import assert from "node:assert/strict";
import {ADJECTIVES,ANIMALS,codenameFor,slugFor} from "../shared/codenames.js";

test("each dictionary contains exactly 250 unique entries",()=>{
  assert.equal(ADJECTIVES.length,250);
  assert.equal(ANIMALS.length,250);
  assert.equal(new Set(ADJECTIVES).size,250);
  assert.equal(new Set(ANIMALS).size,250);
});
test("all 62,500 public codenames are unique and deterministic",()=>{
  const codenames=new Set(),slugs=new Set();
  for(let n=1;n<=62500;n++){
    const name=codenameFor(n),slug=slugFor(n);
    assert.ok(name.includes(" "));
    assert.match(slug,/^[a-z0-9]+-[a-z0-9]+$/);
    assert.ok(!codenames.has(name));
    assert.ok(!slugs.has(slug));
    codenames.add(name);
    slugs.add(slug);
  }
  assert.equal(codenameFor(1),codenameFor(1));
  assert.throws(()=>codenameFor(62501));
});
