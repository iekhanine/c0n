// Resolve author images from Discord's member cache, falling back to saved profile photos.
// Older installations may not yet have either table. Missing tables are not fatal.
export async function authorAvatars(db, ids) {
  const unique = [...new Set(ids.filter(id => typeof id === "string" && /^\\d{17,20}$/.test(id)))];
  const avatars = new Map();
  if (!unique.length) return avatars;
  try {
    const result = await db.query(
      "SELECT user_id,avatar_url FROM con.profiles WHERE user_id=ANY($1::text[])",
      [unique],
    );
    for (const row of result.rows)
      if (row.avatar_url?.startsWith("https://")) avatars.set(row.user_id, row.avatar_url);
  } catch (e) {
    if (e.code !== "42P01" && !/does not exist/i.test(e.message || "")) throw e;
  }
  try {
    const result = await db.query(
      "SELECT discord_id,avatar FROM con.discord_members WHERE discord_id=ANY($1::text[]) AND active=true AND is_bot=false",
      [unique],
    );
    for (const row of result.rows) {
      if (row.avatar && /^[a-zA-Z0-9_]+$/.test(row.avatar))
        avatars.set(row.discord_id,
          `https://cdn.discordapp.com/avatars/${row.discord_id}/${row.avatar}.png?size=128`);
    }
  } catch (e) {
    if (e.code !== "42P01" && !/does not exist/i.test(e.message || "")) throw e;
  }
  return avatars;
}
