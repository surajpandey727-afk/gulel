import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/central/bridge", () => ({ pushOrgToCentral: async () => ({ ok: true, linked: false }) }));
import { cleanNoteBody } from "@/lib/orgs/records";

describe("note bodies", () => {
  const id = "0750d3d0-f1c7-45c2-8f60-af6211ee6e02";
  it("treats editor output without a leading block as rich and sanitises it", () => {
    const out = cleanNoteBody(`Hi <span data-mention="${id}" contenteditable="false">@Sam</span>&nbsp;<img src=x onerror=alert(1)>`);
    expect(out).toBe(`<p>Hi <span data-mention="${id}">@Sam</span>&nbsp;</p>`);
  });
  it("keeps plain text plain", () => {
    expect(cleanNoteBody("  Called them; 3 < 5 \n")).toBe("Called them; 3 < 5");
  });
  it("rejects empty rich notes", () => {
    expect(cleanNoteBody("<p><br></p>")).toBe("");
  });
});
