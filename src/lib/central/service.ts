import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { SHEETS } from "./schema";
import { buildIndex, computeRow, displayValue, rowIssues, sheetDef } from "./compute";
import { applyOps, loadStore } from "./store";
import { proposeChanges, schemaBrief } from "./agent";
import { autoPush } from "./sync";
import { enqueueJob } from "@/lib/jobs/enqueue";
import { addNote, fileUrl, listFiles, listNotes, repoNotesFor, resolveOrg, uploadFileBytes } from "@/lib/orgs/records";
import type { Op } from "./types";

const MAX_API_FILE = 3 * 1024 * 1024; // request bodies are capped around 4.5 MB; base64 adds a third

async function orgOrThrow(workspaceId: string, ref: unknown) {
  const org = await resolveOrg(createAdminClient(), workspaceId, String(ref ?? ""));
  if (!org) throw new Error(`No organisation matches "${String(ref ?? "")}". Use its gulel id, its Central Repository ID (ORG-030) or its exact name.`);
  return org;
}

/** Shared by the REST API and the MCP endpoint (token callers; workspace already resolved). */
export const service = {
  async organisation(workspaceId: string, ref: string) {
    const admin = createAdminClient();
    const org = await orgOrThrow(workspaceId, ref);
    const [{ data: o }, { data: li }, { data: q }, notes, files, repoNotes] = await Promise.all([
      admin.from("organisations").select("trading_name, legal_name, website, sector, city, country, primary_market, relationship_status, archived_at").eq("id", org.id).single(),
      admin.from("contact_channels").select("value").eq("organisation_id", org.id).eq("channel", "linkedin").is("contact_id", null).limit(1).maybeSingle(),
      admin.from("lead_qualifications").select("score, override_score, band, coverage, explanation, created_at").eq("organisation_id", org.id).eq("is_current", true).maybeSingle(),
      listNotes(admin, workspaceId, { orgIds: [org.id] }),
      listFiles(admin, workspaceId, [org.id]),
      repoNotesFor(admin, workspaceId, org.cr_key),
    ]);
    return {
      id: org.id, repository_id: org.cr_key, ...o, archived: !!o?.archived_at, linkedin_url: li?.value ?? null,
      qualification: q ? { score: Number(q.override_score ?? q.score), band: q.band, coverage: Number(q.coverage), explanation: q.explanation, at: q.created_at } : null,
      notes: notes.map((n) => ({ id: n.id, body: n.body, by: n.author, at: n.created_at })),
      repository_notes: repoNotes,
      files: files.map((f) => ({ id: f.id, name: f.name, size_bytes: f.size_bytes, mime_type: f.mime_type, at: f.created_at })),
    };
  },
  async addNote(workspaceId: string, label: string, ref: string, body: string, via: "agent" | "api") {
    const org = await orgOrThrow(workspaceId, ref);
    const id = await addNote(createAdminClient(), workspaceId, { organisationId: org.id, body: `${body.trim()}`, via, userId: null });
    return { id, organisation_id: org.id, note: "Added. It shows on the organisation everywhere in gulel." , by: label };
  },
  async uploadFile(workspaceId: string, label: string, ref: string, f: { filename?: unknown; content_base64?: unknown; content_text?: unknown; mime_type?: unknown }, via: "agent" | "api") {
    const org = await orgOrThrow(workspaceId, ref);
    const name = String(f.filename ?? "").trim();
    if (!name) throw new Error("filename is required");
    let bytes: Uint8Array;
    if (typeof f.content_text === "string") bytes = new TextEncoder().encode(f.content_text);
    else if (typeof f.content_base64 === "string") bytes = Uint8Array.from(Buffer.from(f.content_base64, "base64"));
    else throw new Error("Send content_text (for text/markdown) or content_base64 (for any file).");
    if (bytes.byteLength > MAX_API_FILE) throw new Error("Through the API, files are limited to 3 MB. Upload larger files in gulel.");
    const mime = typeof f.mime_type === "string" && f.mime_type ? f.mime_type : typeof f.content_text === "string" ? (name.endsWith(".md") ? "text/markdown" : "text/plain") : null;
    const id = await uploadFileBytes(workspaceId, org.id, name, bytes, mime, via, label);
    return { id, organisation_id: org.id, name, size_bytes: bytes.byteLength };
  },
  async fileLink(workspaceId: string, fileId: string) {
    return { url: await fileUrl(createAdminClient(), workspaceId, fileId), expires_in_seconds: 300 };
  },
  async qualify(workspaceId: string, ref: string) {
    const org = await orgOrThrow(workspaceId, ref);
    const admin = createAdminClient();
    const { data: li } = await admin.from("contact_channels").select("id").eq("organisation_id", org.id).eq("channel", "linkedin").is("contact_id", null).limit(1).maybeSingle();
    const type = li ? "qualification" : "linkedin_find";
    const { count } = await admin.from("jobs").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("type", type).in("status", ["queued", "running"]).contains("payload", { organisation_id: org.id });
    if (!count) await enqueueJob(workspaceId, type, { organisation_id: org.id, user_id: null, then_qualify: true }, { maxAttempts: 2 });
    return { organisation_id: org.id, queued: count ? "already queued" : type === "linkedin_find" ? "finding LinkedIn, then qualifying" : "qualifying" };
  },
  schema() {
    return { sheets: schemaBrief(), note: "Write input columns only. ref columns take item IDs from reference lists, entity columns take record IDs. Names are also accepted and resolved." };
  },
  async references(workspaceId: string) {
    const store = await loadStore(createAdminClient(), workspaceId);
    const out: Record<string, { id: string; name: string; is_open?: boolean | null }[]> = {};
    for (const r of store.refs.sort((a, b) => a.position - b.position)) (out[r.list] ??= []).push({ id: r.item_id, name: r.name, ...(r.is_open !== null ? { is_open: r.is_open } : {}) });
    return out;
  },
  async rows(workspaceId: string, opts: { sheet?: string; q?: string; limit?: number }) {
    if (opts.sheet && !SHEETS.some((s) => s.name === opts.sheet)) throw new Error(`Unknown sheet. Use one of: ${SHEETS.map((s) => s.name).join(", ")}`);
    const store = await loadStore(createAdminClient(), workspaceId);
    const idx = buildIndex(store);
    const sheets = opts.sheet ? [opts.sheet] : SHEETS.map((s) => s.name);
    const q = opts.q?.toLowerCase().trim();
    const out: Record<string, unknown[]> = {};
    for (const name of sheets) {
      const def = sheetDef(name);
      const rendered = (idx.bySheet.get(name) ?? []).map((r) => ({
        key: r.row_key,
        fields: Object.fromEntries(Object.entries(computeRow(idx, r)).filter(([k, v]) => v !== null && v !== "" && k !== "row_check")),
        labels: Object.fromEntries(def.columns.filter((c) => (c.type === "ref" || c.type === "entity") && r.data[c.key]).map((c) => [c.key, displayValue(idx, c, r.data[c.key], r)])),
        issues: rowIssues(idx, r),
      }));
      out[name] = (q ? rendered.filter((r) => JSON.stringify(r).toLowerCase().includes(q)) : rendered).slice(0, opts.limit ?? 500);
    }
    return out;
  },
  async apply(workspaceId: string, label: string, ops: Op[], opts: { dryRun?: boolean; force?: boolean }) {
    if (!Array.isArray(ops) || !ops.length) throw new Error("ops must be a non-empty array");
    if (ops.length > 500) throw new Error("At most 500 ops per call");
    const res = await applyOps({ db: createAdminClient(), workspaceId, actorId: null, via: "api", note: label }, ops, opts);
    if (res.ok && !opts.dryRun) await autoPush(workspaceId, null);
    return { ok: res.ok, error: res.error, results: res.results };
  },
  async agent(workspaceId: string, label: string, instruction: string, apply: boolean) {
    const admin = createAdminClient();
    const proposal = await proposeChanges(admin, workspaceId, null, instruction);
    if (!apply || !proposal.valid || !proposal.ops.length) return { applied: false, proposal };
    const res = await applyOps({ db: admin, workspaceId, actorId: null, via: "agent", note: `${label}: ${instruction.slice(0, 200)}` }, proposal.ops);
    if (res.ok) await autoPush(workspaceId, null);
    return { applied: res.ok, error: res.error, proposal, results: res.results };
  },
};
