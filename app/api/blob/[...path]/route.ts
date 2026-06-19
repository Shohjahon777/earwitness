import { get } from "@vercel/blob";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const pathname = path.join("/");
  const result = await get(pathname, { access: "private" });

  if (!result || result.statusCode === 304 || !result.stream) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(result.stream, {
    headers: {
      "content-type": result.blob.contentType || "audio/wav",
      "cache-control": result.blob.cacheControl || "private, max-age=300",
      etag: result.blob.etag,
    },
  });
}
