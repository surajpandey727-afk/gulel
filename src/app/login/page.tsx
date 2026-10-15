import { GulelMark } from "@/components/brand/gulel-mark";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-4 text-center">
          <GulelMark size={64} className="rounded-[13px]" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">gulel</h1>
            <p className="text-xs tracking-widest text-ink-3 mt-0.5">for nishaan-a</p>
            <p className="mt-1 text-sm text-ink-3">AI researches and prepares. You authorise and communicate.</p>
          </div>
        </div>
        <LoginForm next={next ?? "/overview"} initialError={error ?? null} />
        <div className="mt-10 flex items-center justify-center gap-2 text-ink-3">
          <span className="text-[0.65rem] tracking-wide">powered by</span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/nishaan-a-mark.webp" alt="nishaan-a" className="h-8" style={{ objectFit: "contain" }} />
        </div>
      </div>
    </main>
  );
}
