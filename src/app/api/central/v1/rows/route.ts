import { authenticate, unauthorized } from "@/lib/central/api-auth";
import { service } from "@/lib/central/service";

/** GET ?sheet=Pipeline_India&q=paytm&limit=50 */
export async function GET(req: Request) {
  const caller = await authenticate(req);
  if (!caller) return unauthorized();
  const u = new URL(req.url);
  try {
    const rows = await service.rows(caller.workspaceId, { sheet: u.searchParams.get("sheet") ?? undefined, q: u.searchParams.get("q") ?? undefined, limit: Number(u.searchParams.get("limit") ?? 500) || 500 });
    return Response.json({ rows });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
