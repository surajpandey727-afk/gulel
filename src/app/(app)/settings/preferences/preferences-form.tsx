"use client";
import { useState } from "react";
import { ArrowDown, ArrowUp, RotateCcw } from "lucide-react";
import { Button } from "@/components/neo/button";
import { Panel } from "@/components/neo/surface";
import { cn } from "@/components/neo/cn";
import { usePrefs } from "@/components/shell/prefs-provider";
import { DOSSIER_TABS, ORG_COLUMNS, type OrgColumn, type Prefs } from "@/lib/prefs";
import { SHEETS } from "@/lib/central/schema";

function Choice<T extends string>({ value, options, onChange, label }: { value: T; options: { v: T; l: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap items-center gap-1 rounded-full neo-inset-sm p-1">
      {options.map((o) => (
        <button key={o.v} type="button" role="radio" aria-checked={value === o.v} onClick={() => onChange(o.v)}
          className={cn("rounded-full px-3 py-1 text-xs font-medium transition-shadow", value === o.v ? "neo-raised-sm text-oxblood" : "text-ink-3 hover:text-ink")}>{o.l}</button>
      ))}
    </div>
  );
}

function Row({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-t border-hairline/70 py-4 first:border-t-0 first:pt-0 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
      <div className="min-w-0 sm:max-w-sm"><p className="text-sm font-medium text-ink">{title}</p><p className="text-xs text-ink-3">{hint}</p></div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

/**
 * Your preferences: how lists, boards, notes and dossiers look and open for you. Every change applies straight away
 * and is saved to your profile, so it follows you to any device. Teammates keep their own.
 */
export function PreferencesForm() {
  const { prefs, setPrefs } = usePrefs();
  const [confirmReset, setConfirmReset] = useState(false);
  const set = (p: Partial<Prefs>) => setPrefs(p);
  const cols = prefs.orgColumns;
  const toggleCol = (k: OrgColumn) => set({ orgColumns: cols.includes(k) ? cols.filter((c) => c !== k) : [...cols, k] });
  const move = (k: OrgColumn, d: -1 | 1) => { const i = cols.indexOf(k), j = i + d; if (j < 0 || j >= cols.length) return; const n = [...cols]; [n[i], n[j]] = [n[j], n[i]]; set({ orgColumns: n }); };
  const layouts = Object.keys(prefs.boardLayouts);
  const sheetLabel = (n: string) => SHEETS.find((s) => s.name === n)?.name.replace(/_/g, " ") ?? n;

  return (
    <div className="flex flex-col gap-6">
      <Panel title="Organisations list" eyebrow="Columns, density and default order">
        <Row title="Columns" hint="Tick to show, arrows to reorder. Organisation and priority are always shown.">
          <ul className="flex w-full flex-col gap-0.5 sm:w-72">
            {[...cols, ...ORG_COLUMNS.map((c) => c.key).filter((k) => !cols.includes(k))].map((k) => {
              const on = cols.includes(k), i = cols.indexOf(k);
              return (
                <li key={k} className={cn("flex items-center gap-2 rounded-neo-sm px-2.5 py-1.5 text-sm", on ? "neo-inset-sm text-ink" : "text-ink-3")}>
                  <input type="checkbox" checked={on} disabled={on && cols.length === 1} onChange={() => toggleCol(k)} aria-label={`${on ? "Hide" : "Show"} ${k}`} className="accent-[var(--brand-oxblood)]" />
                  <span className="flex-1">{ORG_COLUMNS.find((c) => c.key === k)!.label}</span>
                  {on && <>
                    <button type="button" onClick={() => move(k, -1)} disabled={i === 0} aria-label="Move up" className="grid h-6 w-6 place-items-center rounded-full text-ink-3 hover:text-oxblood disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" /></button>
                    <button type="button" onClick={() => move(k, 1)} disabled={i === cols.length - 1} aria-label="Move down" className="grid h-6 w-6 place-items-center rounded-full text-ink-3 hover:text-oxblood disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" /></button>
                  </>}
                </li>
              );
            })}
          </ul>
        </Row>
        <Row title="Row density" hint="Compact fits more organisations on screen.">
          <Choice label="Organisations row density" value={prefs.orgDensity} onChange={(v) => set({ orgDensity: v })} options={[{ v: "comfortable", l: "Comfortable" }, { v: "compact", l: "Compact" }]} />
        </Row>
        <Row title="Default order" hint="How the list is sorted when you open it. Priority order lets you drag to reprioritise.">
          <Choice label="Default order" value={prefs.orgSort} onChange={(v) => set({ orgSort: v })} options={[{ v: "priority", l: "Priority" }, { v: "updated", l: "Recently updated" }, { v: "score", l: "Score" }, { v: "name", l: "Name" }]} />
        </Row>
      </Panel>

      <Panel title="Boards" eyebrow="Central Repository">
        <Row title="India and Global dashboard" hint="Show the market dashboard above each board when you open it.">
          <Choice label="Board dashboard" value={prefs.boardDashboard ? "on" : "off"} onChange={(v) => set({ boardDashboard: v === "on" })} options={[{ v: "on", l: "Shown" }, { v: "off", l: "Hidden" }]} />
        </Row>
        <Row title="Row density" hint="Row height on every board.">
          <Choice label="Board row density" value={prefs.boardDensity} onChange={(v) => set({ boardDensity: v })} options={[{ v: "comfortable", l: "Comfortable" }, { v: "compact", l: "Compact" }]} />
        </Row>
        <Row title="Your board layouts" hint="Columns, widths, frozen columns, grouping, sort and filters are remembered per board. Named views live in each board's Views menu.">
          {layouts.length ? (
            <ul className="flex flex-col gap-1 sm:w-72">
              {layouts.map((n) => (
                <li key={n} className="flex items-center justify-between gap-2 rounded-neo-sm px-2.5 py-1.5 text-sm neo-inset-sm">
                  <span className="text-ink">{sheetLabel(n)}</span>
                  <button type="button" onClick={() => { const next = { ...prefs.boardLayouts }; delete next[n]; set({ boardLayouts: next }); }} className="rounded-full px-2 py-0.5 text-xs text-oxblood hover:bg-sunken/70">Reset</button>
                </li>
              ))}
            </ul>
          ) : <p className="text-xs text-ink-3">All boards use the default layout.</p>}
        </Row>
      </Panel>

      <Panel title="Notes and dossiers">
        <Row title="Long notes" hint="How much of a long note shows before “Show all”. Expand always opens the full note.">
          <Choice label="Long notes" value={prefs.notePreview} onChange={(v) => set({ notePreview: v })} options={[{ v: "short", l: "Short preview" }, { v: "medium", l: "Medium" }, { v: "full", l: "Always in full" }]} />
        </Row>
        <Row title="Organisation opens on" hint="The dossier tab shown when you open an organisation (a link to a specific tab still wins).">
          <select value={prefs.dossierTab} onChange={(e) => set({ dossierTab: e.target.value as Prefs["dossierTab"] })} aria-label="Organisation opens on"
            className="h-9 rounded-full px-4 text-sm capitalize text-ink outline-none neo-inset-sm">
            {DOSSIER_TABS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Row>
      </Panel>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-ink-3">Changes save automatically to your profile and apply on every device you sign in on.</p>
        {confirmReset ? (
          <span className="flex items-center gap-2 text-xs text-ink-2">Reset every preference to its default?
            <Button size="sm" onClick={() => setConfirmReset(false)}>Keep</Button>
            <Button size="sm" variant="danger" onClick={() => { setPrefs("reset"); setConfirmReset(false); }}>Reset all</Button>
          </span>
        ) : <Button size="sm" variant="ghost" onClick={() => setConfirmReset(true)}><RotateCcw className="h-3.5 w-3.5" aria-hidden />Reset to defaults</Button>}
      </div>
    </div>
  );
}
