import test from "node:test";
import assert from "node:assert/strict";
import { FIRST_CONTACT_NAME, isFirstContactChannel, firstContactChannel, onboardingEligible, memberCanSelectRoles, ensureWelcomePost } from "../bot/onboarding.js";

function fakeGuild(names = ["ꜰɪʀꜱᴛ-ᴄᴏɴᴛᴀᴄᴛ"]) {
  const guild = { id: "123456789012345678", channels: { cache: new Map() }, roles: { cache: new Map() }, members: {} };
  guild.members.me = { roles: { highest: { comparePositionTo: () => 1 } } };
  names.forEach((name, index) => {
    const id = String(223456789012345678n + BigInt(index));
    guild.channels.cache.set(id, { id, name, type: 0, guild });
  });
  return guild;
}
test("small-caps first-contact name is detected without matching unrelated channels", () => {
  assert.equal(FIRST_CONTACT_NAME, "firstcontact");
  const guild = fakeGuild(["ꜰɪʀꜱᴛ-ᴄᴏɴᴛᴀᴄᴛ", "ɪɴᴛʀᴏᴅᴜᴄᴛɪᴏɴꜱ"]);
  assert.equal(firstContactChannel(guild)?.name, "ꜰɪʀꜱᴛ-ᴄᴏɴᴛᴀᴄᴛ");
  assert.equal(isFirstContactChannel({ name: "INTRODUCTIONS" }), false);
  assert.equal(firstContactChannel(fakeGuild(["first-contact","ꜰɪʀꜱᴛ-ᴄᴏɴᴛᴀᴄᴛ"])), null);
});
test("only first-contact messages and the designated waving reaction clear onboarding", () => {
  const welcome = { channelId: "223456789012345678", messageId: "323456789012345678" };
  const base = { type: "message", channel_id: welcome.channelId, event_id: "423456789012345678" };
  assert.equal(onboardingEligible(base, welcome), true);
  assert.equal(onboardingEligible({ ...base, channel_id: "999999999999999999" }, welcome), false);
  assert.equal(onboardingEligible({ ...base, type: "reaction", event_id: welcome.messageId + ":1f44b" }, welcome), true);
  assert.equal(onboardingEligible({ ...base, type: "reaction", event_id: welcome.messageId + ":1f525" }, welcome), false);
  assert.equal(onboardingEligible({ ...base, type: "reaction", event_id: "999999999999999999:1f44b" }, welcome), false);
  assert.equal(onboardingEligible({ ...base, type: "reaction", event_id: welcome.messageId + ":1f44b" }, { ...welcome, messageId: null }), false);
});
test("welcome post is reused instead of duplicating posts", async () => {
  const guild = fakeGuild();
  const channel = firstContactChannel(guild);
  let sent = 0, reacted = 0;
  const original = { id: "323456789012345678", author: { id: "423456789012345678" }, content: "**[  ꜰɪʀꜱᴛ ᴄᴏɴᴛᴀᴄᴛ  ]**", reactions: { cache: new Map() }, react: async () => { reacted++; } };
  channel.permissionsFor = () => ({ has: () => true });
  channel.messages = { fetch: async () => new Map([[original.id, original]]) };
  channel.send = async () => { sent++; return original; };
  const result = await ensureWelcomePost(guild, original.author.id);
  assert.deepEqual(result, { channelId: channel.id, messageId: original.id });
  assert.equal(sent, 0);
  assert.equal(reacted, 1);
});
test("roles cannot be selected before Observer or Instigator", () => {
  const guild = fakeGuild();
  for (const [name, id] of [["ᴏʙꜱᴇʀᴠᴇʀ", "523456789012345678"], ["ɪɴꜱᴛɪɢᴀᴛᴏʀ", "623456789012345678"]]) {
    guild.roles.cache.set(id, { id, name, guild, managed: false, permissions: { bitfield: 0n } });
  }
  const cache = new Set();
  const member = { guild, roles: { cache: { has: id => cache.has(id) } } };
  assert.equal(memberCanSelectRoles(member), false);
  cache.add("523456789012345678");
  assert.equal(memberCanSelectRoles(member), true);
});
