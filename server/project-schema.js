export const projectMigration = `
CREATE TABLE con.projects (
 id uuid PRIMARY KEY, owner_id text NOT NULL, owner_name text NOT NULL,
 draft jsonb NOT NULL, published jsonb, status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','pending','approved','rejected')),
 version integer NOT NULL DEFAULT 1, review_note text NOT NULL DEFAULT '', reviewed_by text,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),published_at timestamptz
);
CREATE TABLE con.project_votes(project_id uuid NOT NULL REFERENCES con.projects(id) ON DELETE CASCADE,user_id text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(project_id,user_id));
CREATE TABLE con.project_comments(id uuid PRIMARY KEY,project_id uuid NOT NULL REFERENCES con.projects(id) ON DELETE CASCADE,user_id text NOT NULL,user_name text NOT NULL,body text NOT NULL CHECK(length(body) BETWEEN 1 AND 2000),created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX con_project_comments_order ON con.project_comments(project_id,created_at);
CREATE INDEX con_project_owner ON con.projects(owner_id);
ALTER TABLE con.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE con.project_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE con.project_comments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON con.projects,con.project_votes,con.project_comments FROM PUBLIC,anon,authenticated;
INSERT INTO con.projects(id,owner_id,owner_name,draft,published,status,published_at)
 SELECT id,author_id,author_name,jsonb_build_object('category','Tools') || coalesce(published_snapshot,jsonb_build_object('title',title,'body',body,'link_url',link_url,'image_url',image_url,'category','Tools')),
 published_snapshot,CASE WHEN published_snapshot IS NOT NULL THEN 'approved' ELSE 'draft' END,published_at FROM con.posts WHERE kind='project';
INSERT INTO con.schema_migrations(version,app) VALUES(4,'cult-of-nix0n');
`;
