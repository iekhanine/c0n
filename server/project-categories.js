export const baseCategories = [
  "Apps", "Websites", "Tools", "Experiments",
  "Photography", "Art", "Design", "Crafts & Handmade",
  "Music", "Film & Video", "Games", "Writing", "Services", "Other",
];
export function normalizeCategory(value) {
  if (typeof value !== "string") throw Object.assign(Error("Enter a category name."), { status:400 });
  const name = value.trim().replace(/\s+/g, " ");
  if (!/^[\p{L}\p{N}][\p{L}\p{N} &'\-+()./]{1,38}$/u.test(name))
    throw Object.assign(Error("Category must be 2–39 readable characters."), { status:400 });
  return name;
}
export async function ensureCategories(db) {
  await db.query(`CREATE TABLE IF NOT EXISTS con.project_categories(
    name text PRIMARY KEY, active boolean NOT NULL DEFAULT true,
    created_by text, created_at timestamptz NOT NULL DEFAULT now()
  )`);
  await db.query("ALTER TABLE con.project_categories ENABLE ROW LEVEL SECURITY");
  await db.query("REVOKE ALL ON con.project_categories FROM PUBLIC");
  for (const name of baseCategories)
    await db.query("INSERT INTO con.project_categories(name) VALUES($1) ON CONFLICT(name) DO NOTHING", [name]);
}
export async function categories(db) {
  await ensureCategories(db);
  return (await db.query("SELECT name,active,created_by FROM con.project_categories ORDER BY name")).rows;
}
export async function addCategory(db, value, creator) {
  const name = normalizeCategory(value);
  await ensureCategories(db);
  const existing = (await db.query("SELECT name FROM con.project_categories WHERE lower(name)=lower($1) LIMIT 1", [name])).rows[0];
  if (existing) {
    await db.query("UPDATE con.project_categories SET active=true WHERE name=$1", [existing.name]);
    return existing.name;
  }
  const count = (await db.query("SELECT count(*)::int AS n FROM con.project_categories")).rows[0].n;
  if (count >= 100) throw Object.assign(Error("Category limit reached. Contact an administrator."), { status:429 });
  await db.query("INSERT INTO con.project_categories(name,created_by) VALUES($1,$2) ON CONFLICT(name) DO NOTHING", [name,creator]);
  return name;
}
