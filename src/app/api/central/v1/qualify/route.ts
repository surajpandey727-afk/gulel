import { authenticate, readOnly, unauthorized } from "@/lib/central/api-auth";
import { service } from "@/lib/central/service";

/** POST { organisation } — finds the LinkedIn page if missing, then (re)qualifies the organisation in the background. */
export async function POST(req: Request) {
  const caller = await authenticate(req);
  if (!caller) return unauthorized();
  if (!caller.canWrite) return readOnly();
  const b = await req.json().catch(() => null);
  try {
    return Response.json(await service.qualify(caller.workspaceId, String(b?.organisation ?? "")), { status: 202 });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
