import { authenticate, unauthorized } from "@/lib/central/api-auth";
import { service } from "@/lib/central/service";
import { SHEETS } from "@/lib/central/schema";

export const maxDuration = 300;

/**
 * Minimal stateless MCP server (Streamable HTTP, JSON responses) exposing the Central Repository.
 * Auth: `Authorization: Bearer cr_…` from gulel → Central Repository → Sync & access.
 */
const SHEET_ENUM = SHEETS.map((s) => s.name);
const OP_SCHEMA = {
  type: "object",
  properties: {
    op: { type: "string", enum: ["insert", "update", "delete", "restore"] },
    sheet: { type: "string", enum: SHEET_ENUM },
    key: { type: "string", description: "Row ID for update/delete/restore (e.g. P-002, ORG-012). ProjectServices: PROJECT_ID|SERVICE_ID." },
    data: { type: "object", description: "Column key → value. Input columns only; see get_schema.", additionalProperties: { type: ["string", "number", "null"] } },
  },
  required: ["op", "sheet"],
};

const TOOLS = [
  { name: "get_schema", description: "Sheets, editable columns (with types, dropdown lists and entity links) and the current dropdown values of the nishaan-a Central Repository.", inputSchema: { type: "object", properties: {} } },
  { name: "list_rows", description: "Read rows (with computed columns, resolved names and data-validation issues). Filter by sheet and free-text query.", inputSchema: { type: "object", properties: { sheet: { type: "string", enum: SHEET_ENUM }, query: { type: "string" }, limit: { type: "number" } } } },
  { name: "apply_changes", description: "Insert, update, delete or restore rows. Validated like the sheet's data validation and applied all-or-nothing, then synced to Google Sheets. Use dry_run to check first.", inputSchema: { type: "object", properties: { ops: { type: "array", items: OP_SCHEMA }, dry_run: { type: "boolean" }, force: { type: "boolean", description: "Allow deleting rows that other rows reference." } }, required: ["ops"] } },
  { name: "get_organisation", description: "One organisation as gulel sees it: repository ID, LinkedIn URL, website, qualification score/band/explanation, notes (gulel + Central Repository) and attached files.", inputSchema: { type: "object", properties: { organisation: { type: "string", description: "Central Repository ID (ORG-030), gulel id, or exact name" } }, required: ["organisation"] } },
  { name: "add_note", description: "Add a research note to an organisation. It appears on the organisation everywhere in gulel (board, organisation page, people pages) and feeds qualification.", inputSchema: { type: "object", properties: { organisation: { type: "string" }, body: { type: "string" } }, required: ["organisation", "body"] } },
  { name: "upload_file", description: "Attach a file (≤ 3 MB) to an organisation, e.g. a research brief. Use content_text for text/markdown or content_base64 for any file.", inputSchema: { type: "object", properties: { organisation: { type: "string" }, filename: { type: "string" }, content_text: { type: "string" }, content_base64: { type: "string" }, mime_type: { type: "string" } }, required: ["organisation", "filename"] } },
  { name: "get_file_link", description: "A 5-minute download link for an organisation file (ids come from get_organisation).", inputSchema: { type: "object", properties: { file_id: { type: "string" } }, required: ["file_id"] } },
  { name: "qualify_organisation", description: "Queue gulel's qualification for an organisation (finds its LinkedIn page first if missing). Results appear on the board and the organisation page.", inputSchema: { type: "object", properties: { organisation: { type: "string" } }, required: ["organisation"] } },
  { name: "ask_munshi", description: "Give gulel's record-keeping agent a plain-English instruction; it plans the row changes (and applies them if apply=true).", inputSchema: { type: "object", properties: { instruction: { type: "string" }, apply: { type: "boolean" } }, required: ["instruction"] } },
];

type Rpc = { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: Record<string, unknown> };

export async function POST(req: Request) {
  const caller = await authenticate(req);
  if (!caller) return unauthorized();
  const body = await req.json().catch(() => null);
  const batch: Rpc[] = Array.isArray(body) ? body : body ? [body] : [];
  const replies = [];
  for (const m of batch) {
    if (m.id === undefined || m.id === null) continue; // notification
    replies.push(await handle(m, caller));
  }
  if (!replies.length) return new Response(null, { status: 202 });
  return Response.json(Array.isArray(body) ? replies : replies[0]);
}

export function GET() {
  return new Response("Method Not Allowed", { status: 405, headers: { allow: "POST" } });
}

async function handle(m: Rpc, caller: NonNullable<Awaited<ReturnType<typeof authenticate>>>) {
  const ok = (result: unknown) => ({ jsonrpc: "2.0", id: m.id, result });
  const text = (v: unknown, isError = false) => ok({ content: [{ type: "text", text: typeof v === "string" ? v : JSON.stringify(v, null, 1) }], isError });
  try {
    switch (m.method) {
      case "initialize":
        return ok({ protocolVersion: (m.params?.protocolVersion as string) ?? "2025-06-18", capabilities: { tools: { listChanged: false } }, serverInfo: { name: "gulel-central-repository", version: "1.0.0" } });
      case "ping":
        return ok({});
      case "tools/list":
        return ok({ tools: TOOLS });
      case "tools/call": {
        const name = m.params?.name as string;
        const a = (m.params?.arguments ?? {}) as Record<string, unknown>;
        if (name === "get_schema") return text({ ...service.schema(), reference_lists: await service.references(caller.workspaceId) });
        if (name === "list_rows") return text(await service.rows(caller.workspaceId, { sheet: a.sheet as string | undefined, q: a.query as string | undefined, limit: Number(a.limit ?? 200) }));
        if (name === "apply_changes") {
          if (!caller.canWrite && !a.dry_run) return text("This token is read-only.", true);
          const res = await service.apply(caller.workspaceId, caller.label, a.ops as never, { dryRun: !!a.dry_run, force: !!a.force });
          return text(res, !res.ok);
        }
        if (name === "get_organisation") return text(await service.organisation(caller.workspaceId, String(a.organisation ?? "")));
        if (name === "get_file_link") return text(await service.fileLink(caller.workspaceId, String(a.file_id ?? "")));
        if (["add_note", "upload_file", "qualify_organisation"].includes(name) && !caller.canWrite) return text("This token is read-only.", true);
        if (name === "add_note") return text(await service.addNote(caller.workspaceId, caller.label, String(a.organisation ?? ""), String(a.body ?? ""), "agent"));
        if (name === "upload_file") return text(await service.uploadFile(caller.workspaceId, caller.label, String(a.organisation ?? ""), a, "agent"));
        if (name === "qualify_organisation") return text(await service.qualify(caller.workspaceId, String(a.organisation ?? "")));
        if (name === "ask_munshi") {
          if (!caller.canWrite && a.apply) return text("This token is read-only.", true);
          return text(await service.agent(caller.workspaceId, caller.label, String(a.instruction ?? ""), !!a.apply));
        }
        return { jsonrpc: "2.0", id: m.id, error: { code: -32602, message: `Unknown tool ${name}` } };
      }
      default:
        return { jsonrpc: "2.0", id: m.id, error: { code: -32601, message: `Method not found: ${m.method}` } };
    }
  } catch (e) {
    return text((e as Error).message, true);
  }
}
