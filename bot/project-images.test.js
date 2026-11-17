import test from "node:test";
import assert from "node:assert/strict";
import {imagePromptForBuild,buildCompletionDM,PROJECT_IMAGE_STYLE} from "./project-images.js";

const completed={
 project_id:"00000000-0000-4000-8000-000000000101",
 title:"Survey the Hidden Entrance",
 location:"North service bunker",
 delivered_materials:{scrap:50,work_units:100},
 next_project:"Open the Blast Doors",
 style_notes:PROJECT_IMAGE_STYLE
};

test("completed project creates visual prompt grounded in actual build and unlock",()=>{
 const prompt=imagePromptForBuild(completed);
 assert.match(prompt,/Survey the Hidden Entrance/);
 assert.match(prompt,/scrap \(50\)/);
 assert.match(prompt,/Open the Blast Doors/);
 assert.match(prompt,/post-apocalyptic|post-collapse/i);
 assert.match(prompt,/16:9/);
 assert.doesNotMatch(prompt,/generate a new image automatically/i);
});
test("overseer DM is a valid Discord embed with copyable image prompt",()=>{
 const dm=buildCompletionDM(completed);
 const e=dm.embeds[0].toJSON();
 assert.match(e.title,/CONSTRUCTION COMPLETE/);
 assert.match(e.fields[0].value,/Survey the Hidden Entrance/);
 assert.match(e.fields[2].value,/Open the Blast Doors/);
 assert.match(e.fields[3].value,/scrap/);
 assert.match(e.fields[4].value,/ChatGPT|COMPLETED BUILD/);
 assert.deepEqual(dm.allowedMentions,{parse:[]});
 assert.equal(e.fields.every(f=>f.value.length<=1024),true);
 assert.ok(!dm.content||dm.content.length<2000);
});
test("missing optional materials never crashes or fabricates participants",()=>{
 const dm=buildCompletionDM({title:"Power restored",location:"Substation"});
 assert.match(dm.embeds[0].toJSON().fields[3].value,/Recorded in the construction ledger/);
 assert.match(imagePromptForBuild({title:"Power restored"}),/Power restored/);
});
