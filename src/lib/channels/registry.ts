/** What each channel can ACTUALLY do in this build. The UI reads this; nothing is simulated. */
export interface ChannelCapabilities {
  label: string;
  canDiscover: boolean;
  canReadConversations: boolean;
  canDraftNatively: boolean;
  canSendViaApi: boolean;
  canSyncReplies: boolean;
  canTrackDelivery: boolean;
  canLogManually: boolean;
  requiresHumanHandoff: boolean;
  notes: string;
}

export const CHANNELS: Record<"gmail" | "linkedin", ChannelCapabilities> = {
  gmail: {
    label: "Gmail",
    canDiscover: false,
    canReadConversations: true,
    canDraftNatively: true,
    canSendViaApi: true,
    canSyncReplies: true,
    canTrackDelivery: false, // Gmail API confirms acceptance, not inbox delivery; bounces arrive as replies
    canLogManually: true,
    requiresHumanHandoff: false,
    notes: "OAuth (gmail.compose, gmail.readonly, gmail.send). A Gmail draft is not a sent email. Sends only via the execution gateway after approval.",
  },
  linkedin: {
    label: "LinkedIn",
    canDiscover: false,
    canReadConversations: false,
    canDraftNatively: false,
    canSendViaApi: false,
    canSyncReplies: false,
    canTrackDelivery: false,
    canLogManually: true,
    requiresHumanHandoff: true,
    notes: "No authorised messaging API. Drafts live in gulel; you copy, open the profile, send yourself and confirm. No scraping or automation.",
  },
};
