import test from "node:test";
import assert from "node:assert/strict";
import {isGuideMention,newcomerGuideCard,GUIDE_URL} from "./guide.js";
const bot="1570103248453509281";
test("Guide mention handles both Discord mention forms, capitalization and punctuation",()=>{
 for(const message of [
  "<@"+bot+"> guide", "<@!"+bot+"> guide","  <@"+bot+"> GUIDE!  ","<@"+bot+"> guide?"
 ])assert.equal(isGuideMention(message,bot),true,message);
 for(const message of [
  "<@"+bot+"> wallet","<@"+bot+"> profile","guide",
  "<@123456789012345678> guide","please <@"+bot+"> guide",
  "<@"+bot+"> guide now","<@"+bot+"> guide @everyone"
 ])assert.equal(isGuideMention(message,bot),false,message);
 assert.equal(isGuideMention("<@"+bot+"> guide","not-an-id"),false);
});
test("Guide embed links to official field manual and uses real Discord fields",()=>{
 const payload=newcomerGuideCard();
 const card=payload.embeds[0].toJSON();
 assert.equal(card.url,GUIDE_URL);
 assert.match(card.title,/FIELD GUIDE/);
 assert.equal(card.fields.length,6);
 assert.match(card.fields[0].value,/accept|Workshop/i);
 assert.match(card.fields[1].value,/accept/);
 assert.match(card.fields[3].value,/\$ pay/);
 assert.match(card.fields[5].value,/thecompound\.cultofnixon\.com\/guide/);
 assert.deepEqual(payload.allowedMentions,{parse:[],repliedUser:false});
 assert.ok(JSON.stringify(payload).length<6000);
});
