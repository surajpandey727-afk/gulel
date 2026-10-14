/** Proposes a header → field mapping. Never committed without user confirmation. */
export const IMPORT_FIELDS = {
  company_name: { label: "Company name", synonyms: ["company", "company name", "organisation", "organization", "account", "account name", "brand", "client", "business", "firm", "name of company"] },
  legal_name: { label: "Legal entity name", synonyms: ["legal name", "registered name", "entity", "legal entity"] },
  website: { label: "Website / domain", synonyms: ["website", "web", "url", "domain", "site", "company website"] },
  registration_number: { label: "Registration no. (CH / CIN)", synonyms: ["company number", "registration number", "reg no", "cin", "crn", "companies house number"] },
  market: { label: "Market / country", synonyms: ["country", "market", "region", "geography", "uk/india", "territory"] },
  city: { label: "City / location", synonyms: ["city", "location", "hq", "headquarters", "town", "office"] },
  sector: { label: "Industry / sector", synonyms: ["industry", "sector", "category", "vertical", "segment"] },
  employees: { label: "Employee count", synonyms: ["employees", "headcount", "staff", "company size", "size"] },
  relationship: { label: "Relationship status", synonyms: ["status", "relationship", "type", "client/prospect", "stage"] },
  contact_name: { label: "Contact full name", synonyms: ["contact", "contact name", "name", "full name", "person", "poc", "point of contact"] },
  first_name: { label: "First name", synonyms: ["first name", "firstname", "given name", "forename"] },
  last_name: { label: "Last name", synonyms: ["last name", "lastname", "surname", "family name"] },
  title: { label: "Job title", synonyms: ["title", "job title", "designation", "role", "position"] },
  email: { label: "Email", synonyms: ["email", "e-mail", "email address", "mail", "email id", "work email"] },
  phone: { label: "Phone", synonyms: ["phone", "mobile", "telephone", "tel", "contact number", "phone number"] },
  linkedin: { label: "LinkedIn URL", synonyms: ["linkedin", "linkedin url", "linkedin profile", "li"] },
  notes: { label: "Notes", synonyms: ["notes", "comments", "remarks", "description"] },
  last_contacted: { label: "Last contacted", synonyms: ["last contacted", "last contact", "last touch", "date contacted"] },
} as const;
export type ImportField = keyof typeof IMPORT_FIELDS;

const norm = (s: string) => s.toLowerCase().replace(/[_\-.:]/g, " ").replace(/\s+/g, " ").trim();

export interface MappingProposal {
  header: string;
  field: ImportField | null;
  confidence: number;
  sample: string[];
}

export function proposeMapping(headers: string[], rows: Record<string, unknown>[]): MappingProposal[] {
  const used = new Set<ImportField>();
  const proposals = headers.map((header) => {
    const h = norm(header);
    let best: { field: ImportField | null; confidence: number } = { field: null, confidence: 0 };
    for (const [field, def] of Object.entries(IMPORT_FIELDS) as [ImportField, (typeof IMPORT_FIELDS)[ImportField]][]) {
      for (const syn of def.synonyms) {
        const c = h === syn ? 1 : h.includes(syn) && syn.length > 3 ? 0.75 : 0;
        if (c > best.confidence) best = { field, confidence: c };
      }
    }
    const sample = rows.slice(0, 5).map((r) => String(r[header] ?? "")).filter(Boolean);
    // content sniffing beats weak header matches
    if (best.confidence < 1 && sample.length) {
      if (sample.every((v) => /@/.test(v))) best = { field: "email", confidence: 0.9 };
      else if (sample.every((v) => /linkedin\.com/i.test(v))) best = { field: "linkedin", confidence: 0.9 };
      else if (sample.every((v) => /^(https?:\/\/)?(www\.)?[a-z0-9-]+\.[a-z.]{2,}/i.test(v))) best = { field: "website", confidence: 0.8 };
    }
    return { header, ...best, sample };
  });
  // a field may be mapped once: keep the most confident header
  return proposals
    .map((p, i) => ({ p, i }))
    .sort((a, b) => b.p.confidence - a.p.confidence)
    .map(({ p, i }) => {
      if (p.field && used.has(p.field)) return { i, p: { ...p, field: null, confidence: 0 } };
      if (p.field) used.add(p.field);
      return { i, p };
    })
    .sort((a, b) => a.i - b.i)
    .map(({ p }) => p);
}
