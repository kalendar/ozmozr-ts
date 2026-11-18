import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { ValidationError } from "./errors";

export type ImageKind = "avatar" | "group";
const KINDS: readonly string[] = ["avatar", "group"];
const MAX_BYTES = 5_000_000;
const ALLOWED_FORMATS = new Set(["jpeg", "png", "webp"]);

function uploadDir(): string {
  return path.resolve(process.env.UPLOAD_DIR ?? "./uploads");
}

/**
 * Stores an uploaded picture as a 256x256 WebP on local disk and returns its
 * public path ("uploads/<kind>/<name>.webp"). The bytes are decoded and
 * re-encoded, so nothing but pixels survives.
 */
export async function saveImage(file: File, kind: ImageKind): Promise<string> {
  if (file.size === 0) throw new ValidationError("Choose a picture to upload");
  if (file.size > MAX_BYTES) throw new ValidationError("Pictures can be at most 5 MB");
  const input = Buffer.from(await file.arrayBuffer());
  let output: Buffer;
  try {
    const image = sharp(input, { failOn: "error", limitInputPixels: 50_000_000 });
    const meta = await image.metadata();
    if (!meta.format || !ALLOWED_FORMATS.has(meta.format)) throw new Error("unsupported format");
    output = await image.rotate().resize(256, 256, { fit: "cover" }).webp({ quality: 82 }).toBuffer();
  } catch {
    throw new ValidationError("That file is not a JPEG, PNG or WebP picture");
  }
  const name = `${randomBytes(16).toString("hex")}.webp`;
  const dir = path.join(uploadDir(), kind);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, name), output);
  return `uploads/${kind}/${name}`;
}

/** Maps the segments after /uploads/ to a file on disk, or null if they are not one of ours. */
export function resolveUpload(segments: readonly string[]): string | null {
  const [kind, name] = segments;
  if (segments.length !== 2 || !kind || !name) return null;
  if (!KINDS.includes(kind) || !/^[a-f0-9]{32}\.webp$/.test(name)) return null;
  return path.join(uploadDir(), kind, name);
}
