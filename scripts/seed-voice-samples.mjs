import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
);

const { data: members } = await supabase.from("workspace_members").select("workspace_id, user_id").limit(1).single();
if (!members) { console.error("No workspace found"); process.exit(1); }
const ws = members.workspace_id;
const uid = members.user_id;

const samples = [
  {
    kind: "linkedin",
    body: "Hi Alessia, we connected a couple of months back when I came across Dirt's website, and I've seen a fair bit of the work since. Those orbs on your landing page, are they meant to be the different worlds in the dirtiverse, or am I just reading into it? I recently went through Bace's case study, and a quantified outcome like that is rare to see, especially with creative studios back home in India.\n\nI run a brand and commercial strategy firm out of Mumbai and London, we go by nishaan-a. I'd love to grab 15 minutes and see if there's something worth exploring between what we do.",
  },
  {
    kind: "linkedin",
    body: "Hey Alessia, thank you for the reply, and sorry for the slow one on my end. Hope the break did its job, and good to know I read the orbs right.\n\nIt's festival season here in India, so the past week got away from me. I'll send an email by Friday with examples of our work and the industries we work in and the ones we're aiming for",
  },
  {
    kind: "linkedin",
    body: "Hey Vadim, we connected a couple of months ago, and I've been meaning to reach out. I run a brand and commercial strategy firm based between Mumbai and London, we go by nishaan-a. WeGrow's a studio I'd like to explore working with. Would you be up for a 15 minute call sometime?",
  },
  {
    kind: "linkedin",
    body: "Evening Amaan, thanks for accepting. I'm Nihal, founder of nishaan-a. Our senior partner, commented on your post earlier today and that's how I came across it.\n\nWe'd like to take on your brand end to end, from strategy through to launch, with one team accountable for it.\n\nI think you'd like our work for CHUK, a B-Corp, eco tableware business we moved from B2B into consumer. Have also worked with some consumer brands in the UK.\n\nSome of this is on our site, with more going up soon: nishaan-a.com\n\nAre you free for a 20 minute call this week?",
  },
  {
    kind: "linkedin",
    body: "Hi Bhavna, I saw your post about the new brand build. nishaan-a is a brand and commercial strategy firm based between Mumbai and London.\n\nWe recently repositioned a cross-border professional services firm where the brand had to earn a CFO's trust, so I think we understand what you're looking for. We've also built a brand from scratch in the UK. We're well versed in SaaS, and my co-founder comes from Pixis, an AI SaaS company, where he worked closely with the founders.\n\nThe part of your brief I'd most like to talk through is the challenger point. Would you be open to a 20-minute call this week?",
  },
  {
    kind: "linkedin",
    body: "Hi Veer, came across your post. We've done positioning, GTM, and distribution work across sustainable packaging, professional services, and a few others. Our co-founder worked with the founders at Pixis, an AI SaaS company backed by SoftBank and General Atlantic, serving 1,000+ B2B customers including 18 Fortune 2000 brands. We sit close to the space you're describing. Happy to walk you through a demo of how we see the product and the strategy behind it coming together, and compare notes. Case studies are up on our website: nishaan-a.com with more on the way.",
  },
  {
    kind: "email",
    body: "I saw your post about needing positioning work for S45 over the next few months.\n\nI run nishaan-a out of Mumbai, an independent strategy practice where I work directly with founders.\n\nHere is a quick look at a recent project (full case study attached if you want to dig deeper):\n\nValuecent (B2B Cross-Border Services)\n\nContext: A 13-year-old firm and PwC subcontractor converting roughly 1 in 10 deals. They had positioned themselves as an “accounting outsourcing company,” which gave prospects no way to assess risk and caused deals to stall on price.\n\nStrategic Work: The real blocker was a CFO risk-transfer problem across global operations. The work re-anchored their positioning around their owned overseas offices and moved them away from “cheap execution” language. It also steered leadership away from classic traps, like trying to compete directly with the Big Four firms they subcontract for or claiming tech depth before building it.\n\nOutcome: They got out of low-margin price wars, removed cost as the main deal-blocker, and built a distinct position in the market.\n\nIf you're open to a quick chat to see how this translates to S45, let me know.\n\nWarm regards,\nNihal Kashyap\nFounder | Nishaan-a\n+91-91678 90823\nnihal.kashyap@nishaan-a.com",
  },
  {
    kind: "email",
    body: "Hi Debapriya,\n\nI saw the Sundarbans Restoration launch at the Monaco E-Prix.\n\nI'm Nihal, founder of nishaan-a, a brand strategy practice based in Mumbai\n\nA good part of what we do is help organisations sharpen how they're seen by the people who control their funding and partnerships. We've also worked alongside partner agencies that have done well-recognised CSR work for large Indian corporates recently.\n\nI would like to understand where EARTHDAY.ORG India's partnership work is headed this year. Would you have twenty minutes this week for a quick call?\n\nWarm regards,\nNihal Kashyap\nFounder | Nishaan-a\n+91-91678 90823\nnihal.kashyap@nishaan-a.com",
  },
  {
    kind: "email",
    body: "Dear Debapriya,\n\nThank you for sharing this, and for the quick response.\n\nnishaan-a is a brand strategy practice that works as a communication and thinking partner, helping organisations get their story right in front of the corporates and partners they need.\n\nWe understand this well: matching a cause to corporates already aligned with sustainability is one path. Just as often, a company with no obvious link to the cause finds a real reason to back it once the story is made relevant to them.\n\nWe've done this kind of work in the sustainability space before. CHUK, the eco-friendly tableware brand under Pakka, is one example, we ran that mandate from March to June last year, working on both the business hypothesis and the communication around it, which contributed to real revenue growth within the year. Our broader client work spans financial services, compliance-driven businesses, and manufacturing, largely mid-market and enterprise-adjacent.\n\nWould you have twenty minutes this week to talk through what this could look like for the Canopy Project's Sundarbans work?\n\nWarm regards,\nNihal Kashyap\nFounder | Nishaan-a\n+91-91678 90823\nnihal.kashyap@nishaan-a.com",
  },
  {
    kind: "email",
    body: "Hi Nishi,\n\nI read a piece you wrote back in 2019 launching Apne Ghar Ho Apni Bijli. Then I saw pv magazine's coverage last month of Loom Solar crossing a thousand crore.\n\nI'm Nihal, I run nishaan-a out of Mumbai. I've been watching solar and renewables companies across India move from single-product offerings into full-stack energy businesses, including storage, financing and more.\n\nIt would be good to talk through how you're seeing that shift for Loom Solar. Would you have twenty minutes this week for a call?\n\nWarm regards,\nNihal Kashyap\nFounder | Nishaan-a\n+91-91678 90823\nnihal.kashyap@nishaan-a.com",
  },
];

const rows = samples.map((s) => ({
  workspace_id: ws,
  kind: s.kind,
  body: s.body,
  is_negative: false,
  created_by: uid,
}));

const { data, error } = await supabase.from("writing_samples").insert(rows).select("id");
if (error) {
  console.error("Insert failed:", error.message);
  process.exit(1);
}
console.log(`Inserted ${data.length} writing samples into workspace ${ws}`);
