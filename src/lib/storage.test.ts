import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, expect, test } from "vitest";
import { ValidationError } from "./errors";
import { resolveUpload, saveImage } from "./storage";

let dir: string;
beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), "oz-uploads-"));
  process.env.UPLOAD_DIR = dir;
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const png = () => sharp({ create: { width: 600, height: 300, channels: 3, background: "#1f7a5a" } }).png().toBuffer();

test("re-encodes an upload to a 256x256 WebP and returns its public path", async () => {
  const file = new File([new Uint8Array(await png())], "me.png", { type: "image/png" });
  const publicPath = await saveImage(file, "avatar");
  expect(publicPath).toMatch(/^uploads\/avatar\/[a-f0-9]{32}\.webp$/);
  const stored = readFileSync(resolveUpload(publicPath.replace(/^uploads\//, "").split("/"))!);
  const meta = await sharp(stored).metadata();
  expect([meta.format, meta.width, meta.height]).toEqual(["webp", 256, 256]);
});

test("rejects files that are not images, whatever they are called", async () => {
  const fake = new File(["<script>alert(1)</script>"], "evil.png", { type: "image/png" });
  await expect(saveImage(fake, "avatar")).rejects.toBeInstanceOf(ValidationError);
  const svg = new File(['<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>'], "x.svg", { type: "image/svg+xml" });
  await expect(saveImage(svg, "group")).rejects.toBeInstanceOf(ValidationError);
});

test("rejects files over 5 MB and empty files", async () => {
  const big = new File([new Uint8Array(5_000_001)], "big.png", { type: "image/png" });
  await expect(saveImage(big, "avatar")).rejects.toBeInstanceOf(ValidationError);
  await expect(saveImage(new File([], "empty.png"), "avatar")).rejects.toBeInstanceOf(ValidationError);
});

test("only well-formed upload paths resolve to files", () => {
  expect(resolveUpload(["avatar", `${"a".repeat(32)}.webp`])).toBe(path.join(dir, "avatar", `${"a".repeat(32)}.webp`));
  expect(resolveUpload(["..", "..", "etc", "passwd"])).toBeNull();
  expect(resolveUpload(["avatar", "../../secret.webp"])).toBeNull();
  expect(resolveUpload(["other", `${"a".repeat(32)}.webp`])).toBeNull();
});
