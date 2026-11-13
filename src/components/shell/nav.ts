import {
  Activity, BarChart3, Building2, CheckSquare, Compass, Database, Gauge, Inbox, KanbanSquare, Lightbulb, ListChecks,
  PenLine, Settings, Stamp, Users, Crosshair, Send, TrendingUp, Briefcase, FolderKanban, Layers, Receipt, Award, LayoutDashboard,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  purpose: string;
};

export type NavGroup = {
  key: string;
  label: string;
  icon: LucideIcon;
  items: NavItem[];
};

export const OVERVIEW: NavItem = {
  href: "/overview", label: "Overview", icon: Gauge, purpose: "Executive commercial command centre",
};

export const NAV_GROUPS: NavGroup[] = [
  {
    key: "prospecting", label: "Prospecting", icon: Crosshair,
    items: [
      { href: "/discovery", label: "Discovery", icon: Compass, purpose: "Prospect search, campaigns, sources" },
      { href: "/organisations", label: "Organisations", icon: Building2, purpose: "Canonical companies & dossiers" },
      { href: "/people", label: "People", icon: Users, purpose: "Contacts & decision-makers" },
      { href: "/qualification", label: "Qualification", icon: ListChecks, purpose: "Scores, evidence, risk" },
    ],
  },
  {
    key: "outreach", label: "Outreach", icon: Send,
    items: [
      { href: "/outreach", label: "Outreach Studio", icon: PenLine, purpose: "Draft generation & editing" },
      { href: "/approvals", label: "Approvals", icon: Stamp, purpose: "Review & authorise" },
      { href: "/inbox", label: "Inbox", icon: Inbox, purpose: "Conversations & replies" },
    ],
  },
  {
    key: "revenue", label: "Revenue", icon: TrendingUp,
    items: [
      { href: "/pipeline", label: "Pipeline", icon: KanbanSquare, purpose: "Opportunities & value" },
      { href: "/intelligence", label: "Intelligence", icon: Lightbulb, purpose: "Insights & AI analyst" },
      { href: "/analytics", label: "Analytics", icon: BarChart3, purpose: "Funnel, channel, country" },
    ],
  },
  {
    key: "central", label: "Central Repository", icon: FolderKanban,
    items: [
      { href: "/central", label: "Dashboard", icon: LayoutDashboard, purpose: "Pipeline summary, revenue, tasks" },
      { href: "/central/pipeline", label: "Pipeline", icon: Layers, purpose: "Opportunities synced with sheet" },
      { href: "/central/projects", label: "Projects", icon: FolderKanban, purpose: "Active project delivery" },
      { href: "/central/finances", label: "Finances", icon: Receipt, purpose: "Receivables, expenses, invoicing" },
      { href: "/central/credentials", label: "Credentials", icon: Award, purpose: "Case studies & testimonials" },
    ],
  },
  {
    key: "workspace", label: "Workspace", icon: Briefcase,
    items: [
      { href: "/tasks", label: "Tasks", icon: CheckSquare, purpose: "Follow-ups & reminders" },
      { href: "/operations", label: "Operations", icon: Activity, purpose: "Jobs, agents, system health" },
      { href: "/data", label: "Data Centre", icon: Database, purpose: "Import, dedupe, quality" },
      { href: "/settings", label: "Settings", icon: Settings, purpose: "Voice, providers, scoring" },
    ],
  },
];

export const NAV: NavItem[] = [OVERVIEW, ...NAV_GROUPS.flatMap((g) => g.items)];

export const MOBILE_NAV = ["/overview", "/approvals", "/inbox", "/organisations"] as const;
