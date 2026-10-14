import { PageHeader } from "@/components/neo/surface";
import { SettingsNav } from "./settings-nav";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PageHeader title="Settings" description="Voice, model infrastructure, integrations, scoring and controls. Every change is audited." />
      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <SettingsNav />
        <div className="min-w-0">{children}</div>
      </div>
    </>
  );
}
