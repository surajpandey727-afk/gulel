import { authenticate, readOnly, unauthorized } from "@/lib/central/api-auth";
import { service } from "@/lib/central/service";

/** POST { ops: Op[], dryRun?: boolean, force?: boolean } — validated, all-or-nothing. */
export async function POST(req: Request) {
  const caller = await authenticate(req);
  if (!caller) return unauthorized();
  const body = await req.json().catch(() => null);
  if (!body?.dryRun && !caller.canWrite) return readOnly();
  try {
    const res = await service.apply(caller.workspaceId, caller.label, body?.ops, { dryRun: !!body?.dryRun, force: !!body?.force });
    return Response.json(res, { status: res.ok ? 200 : 422 });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
