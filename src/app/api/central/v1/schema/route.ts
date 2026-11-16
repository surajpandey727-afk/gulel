import { authenticate, unauthorized } from "@/lib/central/api-auth";
import { service } from "@/lib/central/service";

export async function GET(req: Request) {
  const caller = await authenticate(req);
  if (!caller) return unauthorized();
  return Response.json({ ...service.schema(), reference_lists: await service.references(caller.workspaceId) });
}
