import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-4 text-center">
          <span className="grid h-16 w-16 place-items-center rounded-full neo-accent">
            <span className="h-6 w-6 rounded-full border-[3px] border-ivory" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">gulel</h1>
            <p className="text-xs tracking-widest uppercase text-ink-3 mt-0.5">for nishaan-a</p>
            <p className="mt-1 text-sm text-ink-3">AI researches and prepares. You authorise and communicate.</p>
          </div>
        </div>
        <LoginForm next={next ?? "/overview"} initialError={error ?? null} />
      </div>
    </main>
  );
}
