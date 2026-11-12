import test from "node:test";
import assert from "node:assert/strict";
import {
  PARTICIPATION, statusRole, safeParticipationRole, canonicalRoleName, assignNewMemberStatus,
  applyParticipationProgress, participationEvent,
} from "../bot/participation.js";
function fixture(initial = []) {
  const guild = { id: "123456789012345678", roles: { cache: new Map() }, members: {} };
  const roleNames = ["Initiated", "THE UNSPOKEN", "Observer", "Instigator"];
  const roles = roleNames.map((name, n) => ({
    id: String(100000000000000000n + BigInt(n)),
    guild, name, managed: false, permissions: { bitfield: 0n }, position: n,
  }));
  roles.forEach(r => guild.roles.cache.set(r.id, r));
  guild.members.me = { roles: { highest: { comparePositionTo: () => 1 } } };
  const current = new Set(initial.map(name => roles.find(r => r.name === name)?.id));
  const member = {
    id: "223456789012345678", user: { bot: false }, guild,
    roles: {
      cache: { has: id => current.has(id) },
      add: async (role) => {
        for (const item of Array.isArray(role) ? role : [role])
          current.add(typeof item === "string" ? item : item.id);
      },
      remove: async (role) => current.delete(typeof role === "string" ? role : role.id),
    },
  };
  guild.members.fetch = async () => member;
  return { guild, roles, member, current, names: () => roles.filter(r => current.has(r.id)).map(r => r.name) };
}
test("14 days, 30 messages and 5 message-days are the specified thresholds", () => {
  assert.deepEqual(PARTICIPATION, { minimumDays: 14, minimumMessages: 30, minimumActiveDays: 5 });
});
test("new members start as Initiated and THE UNSPOKEN", async () => {
  const setup = fixture();
  await assignNewMemberStatus(setup.member);
  assert.deepEqual(setup.names(), ["Initiated", "THE UNSPOKEN"]);
});
test("first participation removes Unspoken and grants Observer", async () => {
  const setup = fixture(["Initiated", "THE UNSPOKEN"]);
  await applyParticipationProgress(setup.guild, { user_id: setup.member.id, participated: true, eligible_instigator: false });
  assert.deepEqual(setup.names(), ["Initiated", "Observer"]);
});
test("eligible members gain Instigator and retire Observer, retaining Initiated", async () => {
  const setup = fixture(["Initiated", "Observer"]);
  await applyParticipationProgress(setup.guild, { user_id: setup.member.id, participated: true, eligible_instigator: true });
  assert.deepEqual(setup.names(), ["Initiated", "Instigator"]);
});
test("existing Instigators are never automatically downgraded", async () => {
  const setup = fixture(["Initiated", "Instigator"]);
  await applyParticipationProgress(setup.guild, { user_id: setup.member.id, participated: true, eligible_instigator: false });
  assert.deepEqual(setup.names(), ["Initiated", "Instigator"]);
});
test("role hierarchy and elevated role permissions block automatic assignment", async () => {
  const setup = fixture();
  setup.guild.members.me.roles.highest.comparePositionTo = () => -1;
  assert.equal(statusRole(setup.guild, "Instigator"), null);
  setup.guild.members.me.roles.highest.comparePositionTo = () => 1;
  setup.roles[3].permissions.bitfield = 8n;
  assert.equal(statusRole(setup.guild, "Instigator"), null);
});
test("reaction records remain separate from message records", () => {
  const event = participationEvent("reaction", "123456789012345678", "223456789012345678",
    "323456789012345678", 1794510000000, "1f3ae");
  assert.equal(event.type, "reaction");
  assert.match(event.event_id, /:1f3ae$/);
});

test("Unicode small caps and original role names resolve identically", async () => {
  const samples = [
    ["ɪɴɪᴛɪᴀᴛᴇᴅ", "Initiated"],
    ["ᴛʜᴇ ᴜɴꜱᴘᴏᴋᴇɴ", "The Unspoken"],
    ["ᴏʙꜱᴇʀᴠᴇʀ", "Observer"],
    ["ɪɴꜱᴛɪɢᴀᴛᴏʀ", "Instigator"],
  ];
  for (const [styled, plain] of samples)
    assert.equal(canonicalRoleName(styled), canonicalRoleName(plain));
  const setup = fixture();
  setup.roles.forEach((role, i) => { role.name = samples[i][0]; });
  await assignNewMemberStatus(setup.member);
  assert.deepEqual(setup.names(), ["ɪɴɪᴛɪᴀᴛᴇᴅ", "ᴛʜᴇ ᴜɴꜱᴘᴏᴋᴇɴ"]);
  await applyParticipationProgress(setup.guild, {
    user_id: setup.member.id, participated: true, eligible_instigator: false,
  });
  assert.deepEqual(setup.names(), ["ɪɴɪᴛɪᴀᴛᴇᴅ", "ᴏʙꜱᴇʀᴠᴇʀ"]);
});

test("Observer with ordinary channel visibility is manageable while staff privileges are blocked", () => {
  const setup = fixture();
  setup.roles[2].permissions.bitfield = 1024n | 2048n | 65536n;
  assert.equal(statusRole(setup.guild, "Observer")?.id, setup.roles[2].id);
  setup.roles[2].permissions.bitfield |= 268435456n;
  assert.equal(statusRole(setup.guild, "Observer"), null);
  setup.roles[2].permissions.bitfield = 536870912n;
  assert.equal(safeParticipationRole(setup.roles[2]), false);
});
