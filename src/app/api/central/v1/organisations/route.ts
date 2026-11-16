import { authenticate, unauthorized } from "@/lib/central/api-auth";
import { service } from "@/lib/central/service";

/** GET ?ref=ORG-030 | gulel id | exact name — the organisation with LinkedIn, qualification, notes and files. */
export async function GET(req: Request) {
  const caller = await authenticate(req);
  if (!caller) return unauthorized();
  try {
    return Response.json(await service.organisation(caller.workspaceId, new URL(req.url).searchParams.get("ref") ?? ""));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 404 });
  }
}
