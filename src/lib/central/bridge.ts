import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { classifyEmail, normaliseEmail } from "@/lib/contacts/email-quality";
import { classifyTitle, normaliseCompanyName, normaliseDomain, normaliseLinkedIn, normalisePersonName, normaliseUrl, splitName } from "@/lib/import/normalise";
import { applyOps, loadStore } from "./store";
import { buildIndex, computeRow, nextRowKey } from "./compute";
import type { Op, Row } from "./types";

/**
 * One organisation, everywhere. The Central Repository (board + Google Sheet) and gulel's core
 * organisations / contacts are linked by the repository ID (organisations.cr_key = "ORG-030"),
 * first matched by name. reconcile() is idempotent: running it twice makes no further change.
 *
 * Ownership, so the two sides never disagree:
 * - Identity fields (name, legal name, industry, country, city, market, archived, deleted) are owned by the
 *   repository row. Edits made in gulel are written to the repository row first (pushOrgToCentral), so the
 *   repository is always the latest value.
 * - Website and LinkedIn URL: whichever side has a value fills the other; the repository wins a conflict.
 * - Notes and files belong to the gulel organisation and are shown wherever that organisation appears.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any>;
type CoreOrg = {
  id: string; trading_name: string; legal_name: string | null; normalised_name: string; website: string | null; primary_domain: string | null;
  primary_market: "UK" | "IN"; sector: string | null; city: string | null; country: string | null; cr_key: string | null;
  archived_at: string | null; deleted_at: string | null;
};
type CoreContact = { id: string; full_name: string; normalised_name: string; market: string | null; cr_key: string | null; deleted_at: string | null };

export interface ReconcileReport { orgsCreated: number; orgsLinked: number; orgsUpdated: number; contactsCreated: number; contactsLinked: number; contactsUpdated: number; repoFilled: number; errors: string[] }

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v)).trim();
const marketFor = (countryId: string) => (countryId === "IN" ? "IN" : "UK") as "UK" | "IN";

async function allRows<T>(q: () => ReturnType<Db["from"]>, select: string, ws: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await q().select(select).eq("workspace_id", ws).range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) return out;
  }
}

export async function reconcile(workspaceId: string, db: Db = createAdminClient()): Promise<ReconcileReport> {
  const rep: ReconcileReport = { orgsCreated: 0, orgsLinked: 0, orgsUpdated: 0, contactsCreated: 0, contactsLinked: 0, contactsUpdated: 0, repoFilled: 0, errors: [] };
  const store = await loadStore(db, workspaceId, { includeDeleted: true });
  const idx = buildIndex({ rows: store.rows.filter((r) => !r.deleted_at), refs: store.refs });
  const repoOrgs = store.rows.filter((r) => r.sheet === "Organisations" && r.row_key);
  const repoContacts = store.rows.filter((r) => r.sheet === "Contacts" && r.row_key);

  const orgs = await allRows<CoreOrg>(() => db.from("organisations"), "id, trading_name, legal_name, normalised_name, website, primary_domain, primary_market, sector, city, country, cr_key, archived_at, deleted_at", workspaceId);
  const orgChannels = await allRows<{ id: string; organisation_id: string; contact_id: string | null; channel: string; value: string }>(() => db.from("contact_channels"), "id, organisation_id, contact_id, channel, value", workspaceId);
  const liByOrg = new Map<string, { id: string; value: string }>();
  for (const c of orgChannels) if (c.channel === "linkedin" && c.organisation_id && !c.contact_id) liByOrg.set(c.organisation_id, c);

  const byKey = new Map(orgs.filter((o) => o.cr_key && !o.deleted_at).map((o) => [o.cr_key!, o]));
  const deletedByKey = new Map(orgs.filter((o) => o.cr_key && o.deleted_at).map((o) => [o.cr_key!, o]));
  const unlinked = orgs.filter((o) => !o.cr_key && !o.deleted_at);
  const repoFill: Op[] = [];
  const orgIdByKey = new Map<string, string>();

  for (const r of repoOrgs) {
    const key = r.row_key!;
    const d = r.data;
    const name = s(d.organisation);
    if (!name) continue;
    const all = computeRow(idx, r);
    const website = normaliseUrl(s(d.website) || null);
    const linkedin = normaliseLinkedIn(s(d.linkedin_url) || null);
    const want = {
      trading_name: name,
      legal_name: s(d.legal_name) || null,
      normalised_name: normaliseCompanyName(name),
      sector: s(all.industry) || null,
      city: s(d.city) || null,
      country: s(all.country) || null,
      primary_market: marketFor(s(d.country_id)),
      archived_at: s(d.archived).toUpperCase() === "Y" ? "keep" : null,
    };
    try {
      let org = byKey.get(key);
      if (!org && r.deleted_at) {
        const gone = deletedByKey.get(key);
        if (gone) orgIdByKey.set(key, gone.id);
        continue; // deleted in the repository and already deleted (or never created) in gulel
      }
      if (!org && !r.deleted_at && deletedByKey.has(key)) {
        // Restored in the repository: bring the gulel organisation back.
        org = deletedByKey.get(key)!;
        await db.from("organisations").update({ deleted_at: null }).eq("id", org.id);
        org.deleted_at = null;
        byKey.set(key, org); deletedByKey.delete(key);
        rep.orgsUpdated++;
      }
      if (!org) {
        const n = want.normalised_name;
        const dom = normaliseDomain(website);
        const match = unlinked.find((o) => o.normalised_name === n || (o.legal_name && normaliseCompanyName(o.legal_name) === n))
          ?? (dom ? unlinked.find((o) => o.primary_domain === dom) : undefined);
        if (match) {
          await db.from("organisations").update({ cr_key: key }).eq("id", match.id);
          match.cr_key = key; org = match; unlinked.splice(unlinked.indexOf(match), 1); byKey.set(key, match);
          rep.orgsLinked++;
        } else {
          const dup = dom ? orgs.find((o) => o.primary_domain === dom && !o.deleted_at) : undefined;
          const { data: created, error } = await db.from("organisations").insert({
            workspace_id: workspaceId, cr_key: key, trading_name: want.trading_name, legal_name: want.legal_name, normalised_name: want.normalised_name,
            website: dup ? null : website, primary_domain: dup ? null : dom, primary_market: want.primary_market, sector: want.sector,
            city: want.city, country: want.country, relationship_status: "prospect", archived_at: want.archived_at ? new Date().toISOString() : null,
          }).select("id, trading_name, legal_name, normalised_name, website, primary_domain, primary_market, sector, city, country, cr_key, archived_at, deleted_at").single();
          if (error) throw new Error(error.message);
          await db.from("organisation_market_profiles").upsert({ workspace_id: workspaceId, organisation_id: created.id, market: want.primary_market, currency: want.primary_market === "UK" ? "GBP" : "INR", presence: "headquartered" }, { onConflict: "organisation_id,market", ignoreDuplicates: true });
          await db.from("audit_logs").insert({ workspace_id: workspaceId, actor_type: "system", action: "organisation.created", entity_type: "organisation", entity_id: created.id, metadata: { source: "central_repository", cr_key: key } });
          org = created as CoreOrg; orgs.push(org); byKey.set(key, org);
          rep.orgsCreated++;
        }
      }
      orgIdByKey.set(key, org.id);

      if (r.deleted_at) {
        await db.from("organisations").update({ deleted_at: new Date().toISOString() }).eq("id", org.id);
        rep.orgsUpdated++;
        continue;
      }

      // Identity fields: repository wins. Only write what differs (idempotent).
      const patch: Record<string, unknown> = {};
      for (const k of ["trading_name", "legal_name", "normalised_name", "sector", "city", "country", "primary_market"] as const) {
        if ((org[k] ?? null) !== (want[k] ?? null)) patch[k] = want[k];
      }
      const archived = !!want.archived_at;
      if (archived && !org.archived_at) patch.archived_at = new Date().toISOString();
      if (!archived && org.archived_at) patch.archived_at = null;

      // Website: fill whichever side is empty; repository wins a conflict.
      if (website && website !== org.website) {
        const dom = normaliseDomain(website);
        const clash = dom && orgs.some((o) => o.id !== org!.id && o.primary_domain === dom && !o.deleted_at);
        if (!clash) { patch.website = website; patch.primary_domain = dom; }
        else rep.errors.push(`${key}: website ${dom} is already used by another gulel organisation`);
      } else if (!website && org.website) {
        repoFill.push({ op: "update", sheet: "Organisations", key, data: { website: org.website } });
      }
      if (Object.keys(patch).length) {
        const { error } = await db.from("organisations").update(patch).eq("id", org.id);
        if (error) throw new Error(error.message);
        Object.assign(org, patch);
        if (patch.primary_market) await db.from("organisation_market_profiles").upsert({ workspace_id: workspaceId, organisation_id: org.id, market: want.primary_market, currency: want.primary_market === "UK" ? "GBP" : "INR", presence: "headquartered" }, { onConflict: "organisation_id,market", ignoreDuplicates: true });
        rep.orgsUpdated++;
      }

      // LinkedIn: same rule as website.
      const have = liByOrg.get(org.id);
      if (linkedin && linkedin !== have?.value) {
        const taken = orgChannels.find((c) => c.channel === "linkedin" && c.value === linkedin);
        if (taken && taken.organisation_id !== org.id) rep.errors.push(`${key}: LinkedIn URL is already attached to another gulel record`);
        else {
          if (have) await db.from("contact_channels").delete().eq("id", have.id);
          if (!taken) {
            const { data: ch } = await db.from("contact_channels").insert({ workspace_id: workspaceId, organisation_id: org.id, channel: "linkedin", value: linkedin, verification_status: "candidate", source: "central_repository" }).select("id").single();
            if (ch) { liByOrg.set(org.id, { id: ch.id, value: linkedin }); orgChannels.push({ id: ch.id, organisation_id: org.id, contact_id: null, channel: "linkedin", value: linkedin }); }
          }
          rep.orgsUpdated++;
        }
      } else if (!linkedin && have) {
        repoFill.push({ op: "update", sheet: "Organisations", key, data: { linkedin_url: have.value } });
      }
    } catch (e) {
      rep.errors.push(`${key}: ${(e as Error).message}`);
    }
  }

  // ---------------------------------------------------------------- contacts
  const contacts = await allRows<CoreContact>(() => db.from("contacts"), "id, full_name, normalised_name, market, cr_key, deleted_at", workspaceId);
  const links = await allRows<{ contact_id: string; organisation_id: string; title: string | null }>(() => db.from("contact_organisations"), "contact_id, organisation_id, title", workspaceId);
  const cByKey = new Map(contacts.filter((c) => c.cr_key && !c.deleted_at).map((c) => [c.cr_key!, c]));
  const cDeletedByKey = new Map(contacts.filter((c) => c.cr_key && c.deleted_at).map((c) => [c.cr_key!, c]));
  const emailTaken = new Map(orgChannels.filter((c) => c.channel === "email").map((c) => [c.value, c.contact_id]));

  for (const r of repoContacts) {
    const key = r.row_key!;
    const d = r.data;
    const name = s(d.name);
    if (!name) continue;
    const orgKey = s(d.org_id);
    const orgId = orgKey ? orgIdByKey.get(orgKey) ?? null : null;
    const title = s(d.role) || null;
    const email = s(d.email) ? normaliseEmail(s(d.email)) : null;
    const market = marketFor(s(d.country_id) || "IN");
    try {
      let c = cByKey.get(key);
      if (!c && r.deleted_at) continue;
      if (!c && cDeletedByKey.has(key)) {
        c = cDeletedByKey.get(key)!;
        await db.from("contacts").update({ deleted_at: null }).eq("id", c.id);
        c.deleted_at = null; cByKey.set(key, c); rep.contactsUpdated++;
      }
      if (!c) {
        const n = normalisePersonName(name);
        const orgPeople = orgId ? new Set(links.filter((l) => l.organisation_id === orgId).map((l) => l.contact_id)) : null;
        const match = contacts.find((x) => !x.cr_key && !x.deleted_at && x.normalised_name === n && (!orgPeople || orgPeople.has(x.id)));
        if (match) {
          await db.from("contacts").update({ cr_key: key }).eq("id", match.id);
          match.cr_key = key; c = match; cByKey.set(key, c); rep.contactsLinked++;
        } else {
          const { first, last } = splitName(name);
          const { data: created, error } = await db.from("contacts").insert({
            workspace_id: workspaceId, cr_key: key, full_name: name, first_name: first, last_name: last, normalised_name: n, market,
            verification_status: email ? "candidate" : "missing", subscriber_type: "corporate",
          }).select("id, full_name, normalised_name, market, cr_key, deleted_at").single();
          if (error) throw new Error(error.message);
          c = created as CoreContact; contacts.push(c); cByKey.set(key, c); rep.contactsCreated++;
        }
      }
      if (r.deleted_at) {
        await db.from("contacts").update({ deleted_at: new Date().toISOString() }).eq("id", c.id);
        rep.contactsUpdated++;
        continue;
      }
      const patch: Record<string, unknown> = {};
      if (c.full_name !== name) { const { first, last } = splitName(name); Object.assign(patch, { full_name: name, first_name: first, last_name: last, normalised_name: normalisePersonName(name) }); }
      if (Object.keys(patch).length) { await db.from("contacts").update(patch).eq("id", c.id); Object.assign(c, patch); rep.contactsUpdated++; }

      if (orgId) {
        const link = links.find((l) => l.contact_id === c!.id && l.organisation_id === orgId);
        const role = classifyTitle(title);
        if (!link) {
          await db.from("contact_organisations").insert({ workspace_id: workspaceId, contact_id: c.id, organisation_id: orgId, title, role_category: role.category, buyer_relevance: role.relevance, source: "central_repository" });
          links.push({ contact_id: c.id, organisation_id: orgId, title }); rep.contactsUpdated++;
        } else if ((link.title ?? null) !== title) {
          await db.from("contact_organisations").update({ title, role_category: role.category, buyer_relevance: role.relevance }).eq("contact_id", c.id).eq("organisation_id", orgId);
          link.title = title; rep.contactsUpdated++;
        }
      }
      if (email && !emailTaken.has(email)) {
        const { first, last } = splitName(name);
        await db.from("contact_channels").insert({ workspace_id: workspaceId, contact_id: c.id, channel: "email", value: email, email_quality: classifyEmail(email, first, last), verification_status: "candidate", verification_method: "import_unverified", source: "central_repository", is_primary: true });
        emailTaken.set(email, c.id); rep.contactsUpdated++;
      }
    } catch (e) {
      rep.errors.push(`${key}: ${(e as Error).message}`);
    }
  }

  if (repoFill.length) {
    const res = await applyOps({ db, workspaceId, actorId: null, via: "system", note: "Filled from gulel" }, repoFill);
    if (res.ok) rep.repoFilled = repoFill.length;
    else rep.errors.push(`Filling the repository failed: ${res.error}`);
  }
  return rep;
}

/** Gulel-side edit of a linked organisation: write it to the repository row so both sides agree. */
export async function pushOrgToCentral(workspaceId: string, orgId: string, fields: { trading_name?: string; legal_name?: string | null; website?: string | null; linkedin_url?: string | null; city?: string | null; archived?: boolean; delete?: boolean; restore?: boolean }, actorId: string | null, db: Db = createAdminClient(), via: "ui" | "agent" | "system" = "ui", note = "Edited in gulel") {
  const { data: org } = await db.from("organisations").select("cr_key").eq("id", orgId).maybeSingle();
  if (!org?.cr_key) return { ok: true as const, linked: false };
  const key = org.cr_key as string;
  const ops: Op[] = [];
  if (fields.delete) ops.push({ op: "delete", sheet: "Organisations", key });
  else if (fields.restore) ops.push({ op: "restore", sheet: "Organisations", key });
  else {
    const data: Record<string, string | null> = {};
    if (fields.trading_name !== undefined) data.organisation = fields.trading_name;
    if (fields.legal_name !== undefined) data.legal_name = fields.legal_name;
    if (fields.website !== undefined) data.website = fields.website;
    if (fields.linkedin_url !== undefined) data.linkedin_url = fields.linkedin_url;
    if (fields.city !== undefined) data.city = fields.city;
    if (fields.archived !== undefined) data.archived = fields.archived ? "Y" : "N";
    if (!Object.keys(data).length) return { ok: true as const, linked: true };
    ops.push({ op: "update", sheet: "Organisations", key, data });
  }
  const res = await applyOps({ db, workspaceId, actorId, via, note }, ops);
  return res.ok ? { ok: true as const, linked: true } : { ok: false as const, linked: true, error: res.error ?? "The repository rejected this change" };
}

/** Add a gulel organisation (e.g. found by discovery) to the Central Repository and link it. */
export async function addOrgToCentral(workspaceId: string, orgId: string, actorId: string | null, db: Db = createAdminClient()) {
  const { data: org } = await db.from("organisations").select("trading_name, legal_name, website, city, primary_market, cr_key").eq("id", orgId).single();
  if (!org) throw new Error("Organisation not found");
  if (org.cr_key) return org.cr_key as string;
  const store = await loadStore(db, workspaceId);
  const key = nextRowKey(buildIndex(store), "Organisations");
  if (!key) throw new Error("Could not allocate an organisation ID");
  const { data: li } = await db.from("contact_channels").select("value").eq("organisation_id", orgId).eq("channel", "linkedin").is("contact_id", null).limit(1).maybeSingle();
  const res = await applyOps({ db, workspaceId, actorId, via: "ui", note: "Added from gulel" }, [{
    op: "insert", sheet: "Organisations",
    data: { org_id: key, organisation: org.trading_name, legal_name: org.legal_name, website: org.website, linkedin_url: li?.value ?? null, city: org.city, country_id: org.primary_market === "IN" ? "IN" : "GB", archived: "N" },
  }]);
  if (!res.ok) throw new Error(res.error ?? "Could not add to the repository");
  await db.from("organisations").update({ cr_key: key }).eq("id", orgId);
  return key;
}

export function repoKeyForRow(r: Row): string | null {
  if (r.sheet === "Organisations") return r.row_key;
  const v = r.data.org_id;
  return typeof v === "string" && v.startsWith("ORG-") ? v : null;
}
