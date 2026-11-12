import { randomUUID } from "node:crypto";
import { AppError } from "./content.js";
import { ORIGIN } from "./auth.js";

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export function imageInput(input) {
  const encoded = input?.data;
  if (
    typeof encoded !== "string" ||
    encoded.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)
  )
    throw new AppError(
      400,
      "Choose a PNG, JPEG, GIF or WebP image up to 2 MB.",
    );
  const bytes = Buffer.from(encoded, "base64");
  if (
    !bytes.length ||
    bytes.length > MAX_IMAGE_BYTES ||
    bytes.toString("base64") !== encoded
  )
    throw new AppError(400, "Invalid or oversized image.");
  let type;
  if (
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    type = "image/png";
  else if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
    type = "image/jpeg";
  else if (["GIF87a", "GIF89a"].includes(bytes.subarray(0, 6).toString()))
    type = "image/gif";
  else if (
    bytes.subarray(0, 4).toString() === "RIFF" &&
    bytes.subarray(8, 12).toString() === "WEBP"
  )
    type = "image/webp";
  else throw new AppError(400, "Choose a PNG, JPEG, GIF or WebP image.");
  return { bytes, type };
}
export async function ensureImages(db) {
  await db.query(`CREATE TABLE IF NOT EXISTS con.post_images (
    id uuid PRIMARY KEY, content_type text NOT NULL, data bytea NOT NULL,
    created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
  )`);
  await db.query(
    "ALTER TABLE con.post_images ADD COLUMN IF NOT EXISTS name text NOT NULL DEFAULT 'Untitled image', ADD COLUMN IF NOT EXISTS shared boolean NOT NULL DEFAULT true",
  );
  await db.query("ALTER TABLE con.post_images ENABLE ROW LEVEL SECURITY");
}
export function imageName(value) {
  if (typeof value !== "string" || !value.trim() || value.length > 100)
    throw new AppError(400, "Name the image using 1–100 characters.");
  return value.trim();
}
export async function listImages(db) {
  await ensureImages(db);
  return (
    await db.query(
      "SELECT id,name,created_at FROM con.post_images WHERE shared=true ORDER BY created_at DESC",
    )
  ).rows.map((row) => ({
    ...row,
    image_url: `${ORIGIN}/api/image?id=${row.id}`,
  }));
}
export async function uploadImage(db, input, staff, shared = true) {
  const { bytes, type } = imageInput(input);
  const name = imageName(input.name ?? "Untitled image");
  await ensureImages(db);
  const id = randomUUID();
  await db.query(
    "INSERT INTO con.post_images(id,content_type,data,created_by,name,shared) VALUES($1,$2,$3,$4,$5,$6)",
    [id, type, bytes, staff.user.id, name, shared],
  );
  return { id, name, image_url: `${ORIGIN}/api/image?id=${id}` };
}
