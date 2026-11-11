export type SampleProject = {
  id: string;
  kind: string;
  title: string;
  body: string;
  link_url: string;
  image_url: string;
  featured: boolean;
  author_name: string;
  published_at: string;
  category?: string;
  votes?: number;
  comments?: number;
  demo?: boolean;
};
export const samples: SampleProject[] = [
  [
    "otles",
    "OTLES",
    "A better home for technical documentation.",
    "Tools",
    "otlesdev",
    416,
    27,
  ],
  [
    "loopboard",
    "Loopboard",
    "Make a little noise with your friends.",
    "Apps",
    "loopboard",
    298,
    18,
  ],
  [
    "pixel-pantry",
    "Pixel Pantry",
    "A cozy recipe site for everyday cooking and kitchen experiments.",
    "Websites",
    "pixelpantry",
    372,
    24,
  ],
  [
    "retroterm",
    "RetroTerm",
    "A focused terminal for tasks, notes, and everyday productivity.",
    "Tools",
    "retroterm",
    521,
    31,
  ],
  [
    "night-shift",
    "Night Shift",
    "A simple, flexible scheduler for teams, events, and weird hours.",
    "Apps",
    "nightshift",
    265,
    12,
  ],
  [
    "tiny-worlds",
    "Tiny Worlds",
    "A tiny browser game for building and exploring pixel terrains.",
    "Experiments",
    "tinyworlds",
    405,
    29,
  ],
].map(([id, title, body, category, author, votes, comments]) => ({
  id: String(id),
  title: String(title),
  body: String(body),
  category: String(category),
  author_name: String(author),
  votes: Number(votes),
  comments: Number(comments),
  kind: "project",
  link_url: "",
  image_url: `/placeholders/${id}.svg`,
  featured: true,
  published_at: "2026-11-11",
  demo: true,
}));
