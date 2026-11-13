import { AnimatedPageHeader } from "@/components/reactbits/animated-header";
import { CentralNav } from "./central-nav";

export default function CentralLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AnimatedPageHeader
        title="Central Repository"
        description="Pipeline, projects, finances and credentials — synced with your Google Sheet."
      />
      <div className="flex flex-col gap-6">
        <CentralNav />
        {children}
      </div>
    </>
  );
}
