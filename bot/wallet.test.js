import test from "node:test";
import assert from "node:assert/strict";
import {isTreasuryMention,personalWalletCard,compoundTreasuryCard} from "./wallet.js";
const bot="1570103248453509281";
test("Recognizes actual Discord mentions without over-escaped whitespace",()=>{
 for(const msg of ["<@"+bot+"> wallet","<@!"+bot+"> wallet","  <@"+bot+"> WALLET  ","<@"+bot+"> wallet!"])
  assert.equal(isTreasuryMention(msg,bot),true,msg);
 for(const msg of ["<@"+bot+"> profile","wallet","<@123456789012345678> wallet","I said <@"+bot+"> wallet"])
  assert.equal(isTreasuryMention(msg,bot),false,msg);
});
test("Personal wallet embed has actual Discord fields and no escaped newline strings",()=>{
 const data=personalWalletCard({balance:350,earned:700});
 const card=data.embeds[0].toJSON();
 assert.match(card.title,/RESIDENT WALLET/);
 assert.equal(card.fields[0].value,"**350 Credits**");
 assert.equal(card.fields[1].value,"700 Credits");
 assert.doesNotMatch(JSON.stringify(card),/\\\\n/);
 assert.deepEqual(data.allowedMentions,{parse:[]});
});
test("Treasury embeds format very large balances without numeric rounding",()=>{
 const data=compoundTreasuryCard({balance:"37000000000"});
 const card=data.embeds[0].toJSON();
 assert.equal(card.fields[0].value,"**37,000,000,000 Credits**");
 assert.doesNotMatch(JSON.stringify(card),/\\\\n/);
});
test("Invalid currency values are rejected",()=>{
 assert.throws(()=>personalWalletCard({balance:"not money",earned:0}),/Invalid credit/);
});
