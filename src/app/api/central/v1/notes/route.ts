import { authenticate, readOnly, unauthorized } from "@/lib/central/api-auth";
import { service } from "@/lib/central/service";

/** POST { organisation: "ORG-030" | id | name, body: "…" } — adds a note shown on the organisation everywhere in gulel. */
export async function POST(req: Request) {
  const caller = await authenticate(req);
  if (!caller) return unauthorized();
  if (!caller.canWrite) return readOnly();
  const b = await req.json().catch(() => null);
  try {
    return Response.json(await service.addNote(caller.workspaceId, caller.label, String(b?.organisation ?? ""), String(b?.body ?? ""), "api"), { status: 201 });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
