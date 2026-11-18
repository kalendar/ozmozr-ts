import { readFile } from "node:fs/promises";
import { resolveUpload } from "@/lib/storage";

/** Serves pictures stored by saveImage. Names are random and content never changes. */
export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }): Promise<Response> {
  const file = resolveUpload((await params).path);
  if (!file) return new Response("Not found", { status: 404 });
  try {
    const bytes = await readFile(file);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "content-type": "image/webp",
        "cache-control": "public, max-age=31536000, immutable",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
