import "server-only";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/server";
import { proposeMapping, type ImportField } from "./mapping";
import { classifyTitle, cleanDisplayName, detectMarket, normaliseCompanyName, normaliseDomain, normaliseLinkedIn, normalisePersonName, normalisePhone, normaliseUrl, splitName } from "./normalise";
import { resolveOrganisation, type ExistingOrg } from "./resolve";
import { classifyEmail, normaliseEmail } from "@/lib/contacts/email-quality";

const MAX_ROWS = 20000;

export async function uploadWorkbook(workspaceId: string, userId: string, file: File) {
  if (file.size > 15 * 1024 * 1024) throw new Error("File is larger than 15 MB.");
  if (!/\.(xlsx|xls|csv)$/i.test(file.name)) throw new Error("Upload an .xlsx, .xls or .csv file.");
  const buf = Buffer.from(await file.arrayBuffer());
  const wb = XLSX.read(buf, { type: "buffer", cellDates: true });
  const supabase = await createClient();
  const { data: batch, error } = await supabase.from("import_batches").insert({ workspace_id: workspaceId, file_name: file.name, created_by: userId, status: "uploaded" }).select("id").single();
  if (error) throw new Error(error.message);
  const path = `${workspaceId}/${batch.id}/${file.name.replace(/[^\w.\-]/g, "_")}`;
  const up = await supabase.storage.from("imports").upload(path, buf, { contentType: file.type || "application/octet-stream" });
  await supabase.from("import_batches").update({ file_path: up.error ? null : path, error: up.error ? `storage: ${up.error.message}` : null }).eq("id", batch.id);
  const sheets = wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
    return { name, rows: rows.length, headers: rows.length ? Object.keys(rows[0]) : [] };
  });
  return { batchId: batch.id as string, sheets };
}

async function loadSheet(workspaceId: string, batchId: string, sheet: string) {
  const supabase = await createClient();
  const { data: b } = await supabase.from("import_batches").select("file_path").eq("id", batchId).eq("workspace_id", workspaceId).single();
  if (!b?.file_path) throw new Error("Uploaded file is not available. Upload it again.");
  const { data: blob, error } = await supabase.storage.from("imports").download(b.file_path);
  if (error || !blob) throw new Error(`Could not read uploaded file: ${error?.message}`);
  const wb = XLSX.read(Buffer.from(await blob.arrayBuffer()), { type: "buffer", cellDates: true });
  const ws = wb.Sheets[sheet];
  if (!ws) throw new Error("Sheet not found");
  // plain objects only (sheet rows have a null prototype, which Server→Client serialisation rejects)
  return JSON.parse(JSON.stringify(XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "", raw: false }))) as Record<string, unknown>[];
}

export async function previewMapping(workspaceId: string, batchId: string, sheet: string) {
  const rows = await loadSheet(workspaceId, batchId, sheet);
  const headers = rows.length ? Object.keys(rows[0]) : [];
  return { headers, sample: rows.slice(0, 8), total: rows.length, proposal: proposeMapping(headers, rows) };
}

type Mapping = Record<string, ImportField | null>;

interface Normalised {
  company: string | null; normalisedCompany: string | null; legalName: string | null; website: string | null; domain: string | null;
  registrationNumber: string | null; market: "UK" | "IN" | null; city: string | null; sector: string | null; employees: number | null;
  relationship: string | null; contactName: string | null; firstName: string | null; lastName: string | null; title: string | null;
  email: string | null; emailQuality: string | null; phone: string | null; linkedin: string | null; notes: string | null; lastContacted: string | null;
}

function pick(row: Record<string, unknown>, mapping: Mapping, field: ImportField) {
  const h = Object.keys(mapping).find((k) => mapping[k] === field);
  if (!h) return null;
  const v = String(row[h] ?? "").trim();
  return v && !/^(n\/?a|na|none|null|-|—)$/i.test(v) ? v : null;
}

function normaliseRow(row: Record<string, unknown>, mapping: Mapping): { n: Normalised; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const company = pick(row, mapping, "company_name");
  const websiteRaw = pick(row, mapping, "website");
  const emailRaw = pick(row, mapping, "email");
  const email = emailRaw ? normaliseEmail(emailRaw.split(/[;,\s]/)[0]) : null;
  if (emailRaw && !email) warnings.push(`Invalid email “${emailRaw}” ignored`);
  const website = normaliseUrl(websiteRaw);
  const domain = normaliseDomain(website) ?? (email && !/gmail|yahoo|outlook|hotmail|icloud|rediff/.test(email) ? normaliseDomain(email) : null);
  const marketRaw = pick(row, mapping, "market");
  const city = pick(row, mapping, "city");
  const market = detectMarket(marketRaw, city, domain, pick(row, mapping, "phone"));
  let contactName = pick(row, mapping, "contact_name");
  const first = pick(row, mapping, "first_name");
  const last = pick(row, mapping, "last_name");
  if (!contactName && (first || last)) contactName = [first, last].filter(Boolean).join(" ");
  // a "name" column that equals the company is not a person
  if (contactName && company && normaliseCompanyName(contactName) === normaliseCompanyName(company)) contactName = null;
  const split = contactName ? splitName(contactName) : { first: null, last: null };
  const emp = pick(row, mapping, "employees");
  const employees = emp && /^\d[\d,]*$/.test(emp) ? Number(emp.replace(/,/g, "")) : null;
  const lc = pick(row, mapping, "last_contacted");
  const lastContacted = lc && !isNaN(Date.parse(lc)) ? new Date(lc).toISOString() : null;

  if (!company && !domain) errors.push("No company name or website/email domain");
  if (!market) warnings.push("Market (UK/India) could not be determined");
  if (!email && contactName) warnings.push("Contact has no email");
  if (!contactName && !email) warnings.push("No contact on this row");
  const linkedinRaw = pick(row, mapping, "linkedin");
  const linkedin = normaliseLinkedIn(linkedinRaw);
  if (linkedinRaw && !linkedin) warnings.push("LinkedIn value is not a profile URL");

  return {
    n: {
      company: company ? cleanDisplayName(company) : domain, normalisedCompany: company ? normaliseCompanyName(company) : domain ? normaliseCompanyName(domain.split(".")[0]) : null,
      legalName: pick(row, mapping, "legal_name"), website, domain, registrationNumber: pick(row, mapping, "registration_number"), market,
      city, sector: pick(row, mapping, "sector"), employees, relationship: pick(row, mapping, "relationship"),
      contactName: contactName ? cleanDisplayName(contactName) : null, firstName: first ?? split.first, lastName: last ?? split.last, title: pick(row, mapping, "title"),
      email, emailQuality: email ? classifyEmail(email, first ?? split.first, last ?? split.last) : null,
      phone: normalisePhone(pick(row, mapping, "phone"), market), linkedin, notes: pick(row, mapping, "notes"), lastContacted,
    },
    errors, warnings,
  };
}

function relationshipFrom(v: string | null): string | null {
  if (!v) return null;
  const s = v.toLowerCase();
  if (/former|past|ex-?client/.test(s)) return "former_client";
  if (/client|customer/.test(s)) return "client";
  if (/partner/.test(s)) return "partner";
  if (/do not|dnc|unsubscribe/.test(s)) return "do_not_contact";
  if (/conversation|talking|active/.test(s)) return "in_conversation";
  return "prospect";
}

/** Normalise + resolve every row. Nothing is written to canonical tables here. */
export async function buildPreview(workspaceId: string, batchId: string, sheet: string, mapping: Mapping) {
  if (!Object.values(mapping).includes("company_name") && !Object.values(mapping).includes("website") && !Object.values(mapping).includes("email")) {
    throw new Error("Map at least a company name, website or email column.");
  }
  const supabase = await createClient();
  const rows = (await loadSheet(workspaceId, batchId, sheet)).slice(0, MAX_ROWS);
  const { data: orgs } = await supabase.from("organisations").select("id, normalised_name, primary_domain, registration_number, primary_market, relationship_status, organisation_aliases(normalised_alias)").eq("workspace_id", workspaceId).is("deleted_at", null);
  const existing: ExistingOrg[] = (orgs ?? []).map((o) => ({ id: o.id, normalisedName: o.normalised_name, domain: o.primary_domain, registrationNumber: o.registration_number, market: o.primary_market, aliases: (o.organisation_aliases as Array<{ normalised_alias: string }>).map((a) => a.normalised_alias) }));
  const { data: existingEmails } = await supabase.from("contact_channels").select("value, contact_id").eq("workspace_id", workspaceId).eq("channel", "email");
  const emailOwner = new Map((existingEmails ?? []).map((e) => [e.value, e.contact_id]));
  const { data: convs } = await supabase.from("conversations").select("organisation_id, status").eq("workspace_id", workspaceId).in("status", ["awaiting_response", "replied", "qualified_conversation", "meeting_requested", "meeting_booked", "opportunity", "proposal"]);
  const activeOrgs = new Set((convs ?? []).map((c) => c.organisation_id));

  // in-file companies resolve to a shared temporary key
  const batchOrgs: Array<ExistingOrg & { key: string }> = [];
  const seenEmails = new Set<string>();
  const out: Array<Record<string, unknown>> = [];
  const stats = { rows: rows.length, create_org: 0, merge_org: 0, propose_merge: 0, new_contacts: 0, duplicate_contacts: 0, errors: 0, uk: 0, india: 0, unknown_market: 0, existing_relationships: 0, previously_contacted: 0, active_conversations: 0, missing_email: 0, generic_inboxes: 0, named_emails: 0 };

  rows.forEach((raw, idx) => {
    const { n, errors, warnings } = normaliseRow(raw, mapping);
    let action: "create" | "merge" | "skip" | "error" = "create";
    let matchId: string | null = null;
    let batchKey: string | null = null;
    let resolution = null as null | ReturnType<typeof resolveOrganisation>;
    if (errors.length) { action = "error"; stats.errors++; }
    else {
      const cand = { normalisedName: n.normalisedCompany ?? "", domain: n.domain, registrationNumber: n.registrationNumber, market: n.market };
      resolution = resolveOrganisation(cand, existing);
      if (resolution.decision === "auto_merge") { action = "merge"; matchId = resolution.matchId; stats.merge_org++; }
      else if (resolution.decision === "propose") { action = "merge"; matchId = resolution.matchId; stats.propose_merge++; warnings.push(`Possible match by name (${Math.round(resolution.signals.nameSim * 100)}% similar) — review`); }
      else {
        const inFile = resolveOrganisation(cand, batchOrgs);
        if (inFile.decision === "auto_merge" || (inFile.decision === "propose" && inFile.signals.nameSim >= 0.92)) batchKey = batchOrgs.find((b) => b.id === inFile.matchId)!.key;
        else { batchKey = `new-${idx}`; batchOrgs.push({ id: batchKey, key: batchKey, ...cand }); stats.create_org++; }
      }
      if (n.email) {
        if (emailOwner.has(n.email) || seenEmails.has(n.email)) { stats.duplicate_contacts++; warnings.push("Email already exists — contact will not be duplicated"); }
        else { seenEmails.add(n.email); if (n.contactName || n.email) stats.new_contacts++; }
        if (n.emailQuality === "role_generic") stats.generic_inboxes++;
        if (n.emailQuality === "personal_named") stats.named_emails++;
      } else if (n.contactName) { stats.new_contacts++; stats.missing_email++; }
      if (n.market === "UK") stats.uk++; else if (n.market === "IN") stats.india++; else stats.unknown_market++;
      if (relationshipFrom(n.relationship) && relationshipFrom(n.relationship) !== "prospect") stats.existing_relationships++;
      if (n.lastContacted) stats.previously_contacted++;
      if (matchId && activeOrgs.has(matchId)) { stats.active_conversations++; warnings.push("Organisation is already in an active conversation"); }
    }
    out.push({ workspace_id: workspaceId, batch_id: batchId, row_number: idx + 2, raw, normalised: { ...n, matchId, batchKey, resolution }, action, status: action === "error" ? "error" : "pending", errors, warnings });
  });

  await supabase.from("import_rows").delete().eq("batch_id", batchId);
  for (let i = 0; i < out.length; i += 500) {
    const { error } = await supabase.from("import_rows").insert(out.slice(i, i + 500));
    if (error) throw new Error(error.message);
  }
  await supabase.from("import_batches").update({ sheet_name: sheet, mapping, stats, status: "previewed" }).eq("id", batchId);
  return stats;
}

/** Commit: create or enrich. Never overwrites existing non-null values (stronger evidence wins). */
export async function commitBatch(workspaceId: string, userId: string, batchId: string, rejectProposed: string[] = []) {
  const supabase = await createClient();
  const { data: batch } = await supabase.from("import_batches").select("status, file_name").eq("id", batchId).eq("workspace_id", workspaceId).single();
  if (batch?.status !== "previewed") throw new Error("Preview the batch before committing.");
  await supabase.from("import_batches").update({ status: "committing" }).eq("id", batchId);
  const { data: rows } = await supabase.from("import_rows").select("id, row_number, normalised, action, status, warnings").eq("batch_id", batchId).eq("status", "pending").order("row_number");
  const created = new Map<string, string>(); // batchKey -> org id
  const reject = new Set(rejectProposed);
  let committed = 0;

  for (const r of rows ?? []) {
    const n = r.normalised as Normalised & { matchId: string | null; batchKey: string | null; resolution: { decision: string } | null };
    const entities: { org_created?: string; contact_created?: string; channels_created: string[]; filled: Record<string, string[]> } = { channels_created: [], filled: {} };
    try {
      let orgId = n.matchId && !(n.resolution?.decision === "propose" && reject.has(r.id)) ? n.matchId : null;
      if (!orgId && n.batchKey && created.has(n.batchKey)) orgId = created.get(n.batchKey)!;
      if (!orgId) {
        const market = n.market ?? "UK";
        const { data: o, error } = await supabase.from("organisations").insert({
          workspace_id: workspaceId, trading_name: n.company!, legal_name: n.legalName, normalised_name: n.normalisedCompany!, website: n.website, primary_domain: n.domain,
          registration_number: n.registrationNumber, registration_jurisdiction: n.registrationNumber ? market : null, primary_market: market, headquarters: n.city,
          sector: n.sector, employee_count: n.employees, employee_count_source: n.employees ? `import: ${batch.file_name}` : null,
          relationship_status: relationshipFrom(n.relationship) ?? "prospect", description: n.notes, created_by: userId,
        }).select("id").single();
        if (error) throw new Error(error.message);
        orgId = o.id;
        entities.org_created = o.id;
        if (n.batchKey) created.set(n.batchKey, o.id);
        await supabase.from("organisation_market_profiles").insert({ workspace_id: workspaceId, organisation_id: o.id, market, currency: market === "UK" ? "GBP" : "INR", presence: n.market ? "headquartered" : "unknown" });
      } else {
        // enrich only empty fields
        const { data: cur } = await supabase.from("organisations").select("legal_name, website, primary_domain, registration_number, sector, headquarters, employee_count").eq("id", orgId).single();
        const patch: Record<string, unknown> = {};
        if (cur && !cur.legal_name && n.legalName) patch.legal_name = n.legalName;
        if (cur && !cur.website && n.website) patch.website = n.website;
        if (cur && !cur.primary_domain && n.domain) patch.primary_domain = n.domain;
        if (cur && !cur.registration_number && n.registrationNumber) patch.registration_number = n.registrationNumber;
        if (cur && !cur.sector && n.sector) patch.sector = n.sector;
        if (cur && !cur.headquarters && n.city) patch.headquarters = n.city;
        if (cur && cur.employee_count == null && n.employees) { patch.employee_count = n.employees; patch.employee_count_source = `import: ${batch.file_name}`; }
        if (Object.keys(patch).length) { await supabase.from("organisations").update(patch).eq("id", orgId); entities.filled[orgId] = Object.keys(patch); }
        if (n.market) await supabase.from("organisation_market_profiles").upsert({ workspace_id: workspaceId, organisation_id: orgId, market: n.market, currency: n.market === "UK" ? "GBP" : "INR" }, { onConflict: "organisation_id,market", ignoreDuplicates: true });
        if (n.company) await supabase.from("organisation_aliases").upsert({ workspace_id: workspaceId, organisation_id: orgId, alias: n.company, normalised_alias: n.normalisedCompany!, kind: "import_variant" }, { onConflict: "organisation_id,normalised_alias", ignoreDuplicates: true });
      }

      // contact
      let contactId: string | null = null;
      if (n.email) {
        const { data: ex } = await supabase.from("contact_channels").select("contact_id").eq("workspace_id", workspaceId).eq("value", n.email).maybeSingle();
        contactId = ex?.contact_id ?? null;
      }
      const isRoleOnly = !n.contactName && n.emailQuality === "role_generic";
      if (!contactId && (n.contactName || (n.email && !isRoleOnly))) {
        const name = n.contactName ?? n.email!.split("@")[0];
        const role = classifyTitle(n.title);
        const { data: c, error } = await supabase.from("contacts").insert({
          workspace_id: workspaceId, full_name: name, first_name: n.firstName, last_name: n.lastName, normalised_name: normalisePersonName(name), market: n.market,
          linkedin_url: n.linkedin, verification_status: n.email || n.linkedin ? "candidate" : "missing", subscriber_type: "corporate",
          outreach_status: n.lastContacted ? "contacted_previously" : "not_contacted", last_interaction_at: n.lastContacted, created_by: userId,
        }).select("id").single();
        if (error) throw new Error(error.message);
        contactId = c.id;
        entities.contact_created = c.id;
        await supabase.from("contact_organisations").insert({ workspace_id: workspaceId, contact_id: c.id, organisation_id: orgId, title: n.title, role_category: role.category, buyer_relevance: role.relevance, source: `import:${batchId}` });
        for (const [channel, value, extra] of [["email", n.email, { email_quality: n.emailQuality }], ["linkedin", n.linkedin, {}], ["phone", n.phone, {}]] as const) {
          if (!value) continue;
          const { data: ch } = await supabase.from("contact_channels").insert({ workspace_id: workspaceId, contact_id: c.id, channel, value, verification_status: "candidate", verification_method: "import_unverified", source: `import: ${batch.file_name}`, is_primary: channel === "email", ...extra }).select("id").maybeSingle();
          if (ch) entities.channels_created.push(ch.id);
        }
      } else if (!contactId && isRoleOnly) {
        // generic inbox kept at organisation level as a flagged last resort
        const { data: ch } = await supabase.from("contact_channels").insert({ workspace_id: workspaceId, organisation_id: orgId, channel: "email", value: n.email!, email_quality: "role_generic", verification_status: "candidate", verification_method: "import_unverified", source: `import: ${batch.file_name}` }).select("id").maybeSingle();
        if (ch) entities.channels_created.push(ch.id);
      }

      await supabase.from("import_rows").update({ status: "committed", organisation_id: orgId, contact_id: contactId, created_entities: entities }).eq("id", r.id);
      committed++;
    } catch (e) {
      await supabase.from("import_rows").update({ status: "error", errors: [(e as Error).message] }).eq("id", r.id);
    }
  }
  await supabase.from("import_batches").update({ status: "committed", committed_at: new Date().toISOString() }).eq("id", batchId);
  await supabase.from("audit_logs").insert({ workspace_id: workspaceId, actor_type: "user", actor_id: userId, action: "import.committed", entity_type: "import_batch", entity_id: batchId, metadata: { committed } });
  return { committed };
}

/** Batch reversal: removes what the batch created and clears fields it filled. */
export async function revertBatch(workspaceId: string, userId: string, batchId: string) {
  const supabase = await createClient();
  const { data: rows } = await supabase.from("import_rows").select("id, created_entities").eq("batch_id", batchId).eq("workspace_id", workspaceId).eq("status", "committed");
  const blocked: string[] = [];
  for (const r of rows ?? []) {
    const e = r.created_entities as { org_created?: string; contact_created?: string; channels_created?: string[]; filled?: Record<string, string[]> };
    if (e.channels_created?.length) await supabase.from("contact_channels").delete().in("id", e.channels_created);
    if (e.contact_created) {
      const { count } = await supabase.from("outbound_messages").select("id", { count: "exact", head: true }).eq("contact_id", e.contact_created);
      if (count) blocked.push(`contact ${e.contact_created} has outreach history`);
      else await supabase.from("contacts").delete().eq("id", e.contact_created);
    }
    if (e.org_created) {
      const { count } = await supabase.from("outreach_drafts").select("id", { count: "exact", head: true }).eq("organisation_id", e.org_created);
      if (count) blocked.push(`organisation ${e.org_created} has drafts`);
      else await supabase.from("organisations").delete().eq("id", e.org_created);
    }
    for (const [orgId, fields] of Object.entries(e.filled ?? {})) {
      await supabase.from("organisations").update(Object.fromEntries(fields.map((f) => [f, null]))).eq("id", orgId);
    }
    await supabase.from("import_rows").update({ status: "reverted" }).eq("id", r.id);
  }
  await supabase.from("import_batches").update({ status: "reverted", reverted_at: new Date().toISOString(), error: blocked.length ? `Kept (in use): ${blocked.join("; ")}` : null }).eq("id", batchId);
  await supabase.from("audit_logs").insert({ workspace_id: workspaceId, actor_type: "user", actor_id: userId, action: "import.reverted", entity_type: "import_batch", entity_id: batchId, metadata: { blocked } });
  return { reverted: rows?.length ?? 0, blocked };
}
