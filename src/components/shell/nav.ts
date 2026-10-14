import {
  BarChart3, Building2, CheckSquare, Compass, Database, Gauge, Inbox, KanbanSquare, Lightbulb, ListChecks,
  PenLine, Settings, Stamp, Users,
} from "lucide-react";

export const NAV = [
  { href: "/overview", label: "Overview", icon: Gauge, purpose: "Executive commercial command centre" },
  { href: "/discovery", label: "Discovery", icon: Compass, purpose: "Prospect search, campaigns, sources" },
  { href: "/organisations", label: "Organisations", icon: Building2, purpose: "Canonical companies & dossiers" },
  { href: "/people", label: "People", icon: Users, purpose: "Contacts & decision-makers" },
  { href: "/qualification", label: "Qualification", icon: ListChecks, purpose: "Scores, evidence, risk" },
  { href: "/outreach", label: "Outreach Studio", icon: PenLine, purpose: "Draft generation & editing" },
  { href: "/approvals", label: "Approvals", icon: Stamp, purpose: "Review & authorise" },
  { href: "/inbox", label: "Inbox", icon: Inbox, purpose: "Conversations & replies" },
  { href: "/pipeline", label: "Pipeline", icon: KanbanSquare, purpose: "Opportunities & value" },
  { href: "/intelligence", label: "Intelligence", icon: Lightbulb, purpose: "Insights & AI analyst" },
  { href: "/analytics", label: "Analytics", icon: BarChart3, purpose: "Funnel, channel, country" },
  { href: "/tasks", label: "Tasks", icon: CheckSquare, purpose: "Follow-ups & reminders" },
  { href: "/data", label: "Data Centre", icon: Database, purpose: "Import, dedupe, quality" },
  { href: "/settings", label: "Settings", icon: Settings, purpose: "Voice, providers, scoring" },
] as const;

export const MOBILE_NAV = ["/overview", "/approvals", "/inbox", "/organisations"] as const;
