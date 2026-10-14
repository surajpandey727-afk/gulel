/** Pure registry diff → trigger events. Unit-tested; no I/O. */
export interface RegistrySnapshot {
  status: string;
  insolvency: boolean;
  accountsOverdue: boolean;
  confirmationOverdue: boolean;
  lastAccountsMadeUpTo: string | null;
  officers: Array<{ name: string; role: string }>;
}

export interface TriggerChange {
  kind: "status_change" | "insolvency" | "filing_overdue" | "new_accounts" | "leadership_joined" | "leadership_left";
  materiality: "low" | "moderate" | "high";
  summary: string;
}

const key = (o: { name: string; role: string }) => `${o.name.toLowerCase()}|${o.role.toLowerCase()}`;

export function diffRegistry(prev: RegistrySnapshot, next: RegistrySnapshot): TriggerChange[] {
  const out: TriggerChange[] = [];
  if (prev.status !== next.status) out.push({ kind: "status_change", materiality: next.status === "active" ? "moderate" : "high", summary: `Company status changed from “${prev.status}” to “${next.status}”.` });
  if (!prev.insolvency && next.insolvency) out.push({ kind: "insolvency", materiality: "high", summary: "An insolvency history is now recorded at Companies House." });
  if ((!prev.accountsOverdue && next.accountsOverdue) || (!prev.confirmationOverdue && next.confirmationOverdue)) {
    out.push({ kind: "filing_overdue", materiality: "moderate", summary: `Filing now overdue: ${[next.accountsOverdue && !prev.accountsOverdue && "accounts", next.confirmationOverdue && !prev.confirmationOverdue && "confirmation statement"].filter(Boolean).join(" and ")}.` });
  }
  if (next.lastAccountsMadeUpTo && next.lastAccountsMadeUpTo !== prev.lastAccountsMadeUpTo) {
    out.push({ kind: "new_accounts", materiality: "low", summary: `New accounts filed, made up to ${next.lastAccountsMadeUpTo}.` });
  }
  const before = new Set(prev.officers.map(key));
  const after = new Set(next.officers.map(key));
  const joined = next.officers.filter((o) => !before.has(key(o)));
  const left = prev.officers.filter((o) => !after.has(key(o)));
  if (joined.length) out.push({ kind: "leadership_joined", materiality: "moderate", summary: `New officer${joined.length > 1 ? "s" : ""}: ${joined.map((o) => `${o.name} (${o.role})`).join(", ")}.` });
  if (left.length) out.push({ kind: "leadership_left", materiality: "moderate", summary: `Officer${left.length > 1 ? "s" : ""} no longer listed: ${left.map((o) => `${o.name} (${o.role})`).join(", ")}.` });
  return out;
}
