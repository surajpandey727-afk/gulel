import { authenticate, readOnly, unauthorized } from "@/lib/central/api-auth";
import { service } from "@/lib/central/service";

export const maxDuration = 300;

/** POST { instruction: string, apply?: boolean } — Munshi plans (and optionally applies) the changes. */
export async function POST(req: Request) {
  const caller = await authenticate(req);
  if (!caller) return unauthorized();
  const body = await req.json().catch(() => null);
  const instruction = String(body?.instruction ?? "").trim();
  if (instruction.length < 4) return Response.json({ error: "instruction is required" }, { status: 400 });
  if (body?.apply && !caller.canWrite) return readOnly();
  try {
    return Response.json(await service.agent(caller.workspaceId, caller.label, instruction, !!body?.apply));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
