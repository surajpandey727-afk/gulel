"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { Building2, ExternalLink, Search, FileText, Users, MessageSquare, Sparkles, ClipboardList } from "lucide-react";
import { Drawer } from "@/components/neo/controls";
import { Badge, MarketBadge } from "@/components/neo/badge";
import { Button, ButtonLink } from "@/components/neo/button";

type OrgQuickData = {
  id: string;
  trading_name: string;
  primary_market: string;
  sector: string | null;
  website: string | null;
  stage: string | null;
  score: number | null;
  band: string | null;
  coverage: number | null;
  contactCount: number;
  draftCount: number;
  evidenceCount: number;
};

const AGENT_ACTIONS = [
  { key: "profile", label: "Full firm profile", icon: Building2, href: (id: string) => `/organisations/${id}` },
  { key: "research", label: "Taftish research", icon: Search, href: (id: string) => `/organisations/${id}?tab=evidence` },
  { key: "evaluate", label: "Chanakya eval", icon: FileText, href: (id: string) => `/qualification?org=${id}` },
  { key: "contacts", label: "Contacts", icon: Users, href: (id: string) => `/organisations/${id}?tab=contacts` },
  { key: "outreach", label: "Doot outreach", icon: MessageSquare, href: (id: string) => `/outreach?org=${id}` },
  { key: "ask", label: "Ask Sutradhar", icon: Sparkles, href: () => "#sutradhar" },
  { key: "log", label: "Chitragupta log", icon: ClipboardList, href: (id: string) => `/organisations/${id}?tab=activity` },
] as const;

export function QuickViewDrawer({ org, open, onOpenChange }: { org: OrgQuickData | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  if (!org) return null;
  return (
    <Drawer open={open} onOpenChange={onOpenChange} title={org.trading_name}>
      <div className="flex flex-col gap-5">
        {/* Identity */}
        <div className="flex items-start gap-3">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px] neo-raised-sm">
            <Building2 className="h-6 w-6 text-oxblood" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-semibold text-ink">{org.trading_name}</h3>
            <div className="flex flex-wrap items-center gap-2 text-sm text-ink-2">
              <MarketBadge market={org.primary_market} />
              {org.sector && <span>{org.sector}</span>}
              {org.stage && <Badge tone="neutral">{org.stage}</Badge>}
            </div>
            {org.website && (
              <a href={org.website} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-oxblood hover:underline">
                {org.website.replace(/^https?:\/\//, "").replace(/\/$/, "")} <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>

        {/* Score breakdown */}
        {org.score !== null && (
          <div className="rounded-neo p-4 neo-inset-sm">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-ink-3">Firm-fit score</span>
              <span className="tabular text-2xl font-semibold text-oxblood">{Math.round(org.score)}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-sunken">
              <div className="h-full rounded-full bg-oxblood transition-all" style={{ width: `${Math.min(100, Math.round(org.score))}%` }} />
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-ink-3">
              <span>{org.band ?? "Unscored"}</span>
              {org.coverage !== null && <span>Coverage {Math.round(org.coverage * 100)}%</span>}
            </div>
          </div>
        )}

        {/* Quick stats */}
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-neo p-3 text-center neo-inset-sm">
            <div className="tabular text-lg font-semibold text-ink">{org.contactCount}</div>
            <div className="text-[0.65rem] text-ink-3">Contacts</div>
          </div>
          <div className="rounded-neo p-3 text-center neo-inset-sm">
            <div className="tabular text-lg font-semibold text-ink">{org.draftCount}</div>
            <div className="text-[0.65rem] text-ink-3">Drafts</div>
          </div>
          <div className="rounded-neo p-3 text-center neo-inset-sm">
            <div className="tabular text-lg font-semibold text-ink">{org.evidenceCount}</div>
            <div className="text-[0.65rem] text-ink-3">Evidence</div>
          </div>
        </div>

        {/* Agent actions */}
        <div className="flex flex-col gap-1.5">
          <p className="eyebrow mb-1">Actions</p>
          {AGENT_ACTIONS.map(({ key, label, icon: Icon, href }) => (
            <Link
              key={key}
              href={href(org.id)}
              className="flex items-center gap-3 rounded-neo px-3 py-2.5 text-sm text-ink-2 transition-colors hover:bg-raised/70 hover:text-ink"
            >
              <Icon className="h-4 w-4 text-ink-3" aria-hidden />
              <span className="flex-1">{label}</span>
            </Link>
          ))}
        </div>
      </div>
    </Drawer>
  );
}
