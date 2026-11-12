import test from "node:test";
import assert from "node:assert/strict";
import { emojiKey, matchingRole, safeAccessRole } from "../bot/reaction-roles.js";

function role(name, permissions = 0n) {
  const guild = { id: "123456789012345678" };
  return { guild, name, id: "223456789012345678", managed: false,
    editable: true, permissions: { bitfield: permissions } };
}
test("only dedicated access roles are self-assignable", () => {
  assert.equal(safeAccessRole(role("ᴄᴏᴍᴘᴏᴜɴᴅ ᴀᴄᴄᴇꜱꜱ")), true);
  assert.equal(safeAccessRole(role("ᴡᴏʀᴋꜱʜᴏᴘ ᴀᴄᴄᴇꜱꜱ")), true);
  assert.equal(safeAccessRole(role("ɪɴꜱᴛɪɢᴀᴛᴏʀ")), false);
  assert.equal(safeAccessRole(role("ᴛʜᴇʀᴀᴘɪꜱᴛꜱ")), false);
  assert.equal(safeAccessRole(role("ᴄᴏᴍᴘᴏᴜɴᴅ ᴀᴄᴄᴇꜱꜱ", 8n)), false);
});
test("Unicode emoji variation selectors do not break mappings", () => {
  assert.equal(emojiKey("🎙️"), emojiKey("🎙"));
  const message = { id: "123456789012345678", channelId: "223456789012345678",
    guildId: "323456789012345678" };
  const config = { guild_id: message.guildId, channel_id: message.channelId,
    message_id: message.id, mappings: [{ emoji: "🎙️", role_id: "423456789012345678" }] };
  assert.equal(matchingRole(config, { message, emoji: { name: "🎙" } }), "423456789012345678");
});
