import { authenticate, readOnly, unauthorized } from "@/lib/central/api-auth";
import { service } from "@/lib/central/service";

/** POST { organisation, filename, content_text | content_base64, mime_type? } — attaches a file (≤ 3 MB) to the organisation. */
export async function POST(req: Request) {
  const caller = await authenticate(req);
  if (!caller) return unauthorized();
  if (!caller.canWrite) return readOnly();
  const b = await req.json().catch(() => null);
  try {
    return Response.json(await service.uploadFile(caller.workspaceId, caller.label, String(b?.organisation ?? ""), b ?? {}, "api"), { status: 201 });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}

/** GET ?id=<file id> — a 5-minute download link. */
export async function GET(req: Request) {
  const caller = await authenticate(req);
  if (!caller) return unauthorized();
  try {
    return Response.json(await service.fileLink(caller.workspaceId, new URL(req.url).searchParams.get("id") ?? ""));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 404 });
  }
}
