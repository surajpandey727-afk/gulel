import { AnimatedPageHeader } from "@/components/reactbits/animated-header";
import { CentralNav } from "./central-nav";

export default function CentralLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AnimatedPageHeader
        title="Central Repository"
        description="Pipeline, partners, projects, people, tasks and finances. Edit here or in Google Sheets; both stay in sync."
      />
      <div className="flex min-w-0 flex-col gap-5">
        <CentralNav />
        {children}
      </div>
    </>
  );
}
