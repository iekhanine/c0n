import { initializeDatabase } from "./db.js";
export const STARTER_PROJECTS = [
  {
    id: "cb0184c8-5c8b-4ed0-9d50-0d3d232b8431",
    title: "Cult of nix0n",
    category: "Websites",
    body: "A Discord-connected community for sharing apps, websites, tools, and small projects. Build things, share what you know, and preserve the weird internet.",
    link_url: "https://c0n.ivansays.com/",
    git_url: "https://github.com/iekhanine/c0n",
    image_url: "https://c0n.ivansays.com/con-logo.png",
  },
  {
    id: "a9d1215b-e852-47ae-a614-01fe3a4363bf",
    title: "OneTime Labs",
    category: "Websites",
    body: "The home of OneTime Labs: software projects, practical tools, and ideas built to solve real problems.",
    link_url: "https://onetimelabs.net/",
    git_url: "",
    image_url: "https://c0n.ivansays.com/onetimelabs-card.svg",
  },
];
// Called only by the owner-authorized seed action. A durable marker prevents re-creating or republishing entries later.
export async function seedOwnerProjects(db, user) {
  const existing = await db.query(
    "SELECT to_regclass('con.project_bootstrap')::text AS marker",
  );
  if (
    existing.rows[0].marker &&
    (
      await db.query(
        "SELECT key FROM con.project_bootstrap WHERE key='owner-starters-v1'",
      )
    ).rows.length
  )
    return { seeded: 0 };
  await initializeDatabase(db);
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('con-owner-starters-v1'))",
    );
    await client.query(
      `CREATE TABLE IF NOT EXISTS con.project_bootstrap(key text PRIMARY KEY,owner_id text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());ALTER TABLE con.project_bootstrap ENABLE ROW LEVEL SECURITY;REVOKE ALL ON con.project_bootstrap FROM PUBLIC,anon,authenticated;`,
    );
    if (
      (
        await client.query(
          "SELECT key FROM con.project_bootstrap WHERE key='owner-starters-v1'",
        )
      ).rows.length
    ) {
      await client.query("COMMIT");
      return { seeded: 0 };
    }
    let seeded = 0;
    for (const { id, ...snapshot } of STARTER_PROJECTS) {
      const result = await client.query(
        "INSERT INTO con.projects(id,owner_id,owner_name,draft,published,status,published_at,reviewed_by)VALUES($1,$2,$3,$4::jsonb,$4::jsonb,'approved',now(),$2) ON CONFLICT(id) DO NOTHING RETURNING id",
        [id, user.id, user.name, JSON.stringify(snapshot)],
      );
      seeded += result.rows.length;
    }
    await client.query(
      "INSERT INTO con.project_bootstrap(key,owner_id)VALUES('owner-starters-v1',$1)",
      [user.id],
    );
    await client.query("COMMIT");
    return { seeded };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
