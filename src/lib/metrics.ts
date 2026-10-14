/** Every KPI has a defensible definition and explicit denominator (shown as tooltip). */
export const KPI_DEFINITIONS = {
  organisations_discovered: { label: "Organisations discovered", def: "Unique new canonical organisation records created in the period.", level: "organisation" },
  qualified_leads: { label: "Qualified leads", def: "Organisations whose current qualification (or human override) is at or above the active threshold. Not period-bound.", level: "organisation" },
  qualified_pipeline: { label: "Qualified pipeline", def: "Open opportunities (not won, lost or nurture).", level: "opportunity" },
  unique_people_reached: { label: "Unique people reached", def: "Distinct recipients with confirmed outreach in the period: Gmail sends accepted by Google plus LinkedIn messages you confirmed sending.", level: "person" },
  messages_sent_confirmed: { label: "Messages sent", def: "Outbound Gmail messages confirmed by the Gmail API in the period. Manually-confirmed LinkedIn messages are counted separately and excluded here.", level: "message" },
  people_responded: { label: "People responded", def: "Distinct reached recipients who replied after our first message in the period.", level: "person" },
  reply_rate: { label: "Reply rate", def: "People responded ÷ unique people reached.", level: "person" },
  positive_reply_rate: { label: "Positive reply rate", def: "Respondents whose reply is classified positive or meeting request (human-reviewed where available) ÷ unique people reached.", level: "person" },
  meetings_booked: { label: "Meetings booked", def: "Meetings marked booked or held in the period.", level: "meeting" },
  meeting_conversion: { label: "Meeting conversion", def: "Meetings booked ÷ unique people reached.", level: "person" },
  awaiting_approval: { label: "Awaiting approval", def: "Draft versions waiting for your decision right now.", level: "draft" },
  followups_due: { label: "Follow-ups due", def: "Open tasks due now or overdue.", level: "task" },
  pipeline_value_by_currency: { label: "Est. pipeline value", def: "Sum of open opportunity values that have a stated basis (pricing assumption, client-stated, proposal or contract). GBP and INR are never combined.", level: "opportunity" },
  won_revenue_by_currency: { label: "Won revenue", def: "Actual values of opportunities recorded as won in the period. Real recorded wins only.", level: "opportunity" },
} as const;
export type KpiKey = keyof typeof KPI_DEFINITIONS;

export interface KpiSummary {
  organisations_discovered: number;
  qualified_leads: number;
  qualified_threshold: number;
  qualified_pipeline: number;
  unique_people_reached: number;
  messages_sent_confirmed: number;
  linkedin_manual_confirmed: number;
  people_responded: number;
  positive_responders: number;
  reply_rate: number | null;
  positive_reply_rate: number | null;
  meetings_booked: number;
  meeting_conversion: number | null;
  awaiting_approval: number;
  followups_due: number;
  pipeline_value_by_currency: Partial<Record<"GBP" | "INR", number>>;
  won_revenue_by_currency: Partial<Record<"GBP" | "INR", number>>;
  sample_size_reached: number;
}
