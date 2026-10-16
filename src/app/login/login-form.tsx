"use client";
import { useActionState, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/neo/button";
import { Field, Input } from "@/components/neo/field";
import { Segmented } from "@/components/neo/segmented";
import { Surface } from "@/components/neo/surface";
import { signIn } from "./actions";

export function LoginForm({ next, initialError }: { next: string; initialError: string | null }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [state, action, pending] = useActionState(signIn, { error: initialError });
  return (
    <Surface elevation="lg" className="p-6">
      <form action={action} autoComplete="on" className="flex flex-col gap-4">
        <Segmented label="Sign in or create the founder account" value={mode} onChange={setMode} className="self-center"
          options={[{ value: "signin", label: "Sign in" }, { value: "signup", label: "First-time setup" }]} />
        <input type="hidden" name="mode" value={mode} />
        <input type="hidden" name="next" value={next} />
        <Field label="Email" htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </Field>
        <Field label="Password" htmlFor="password" hint={mode === "signup" ? "At least 8 characters." : undefined}>
          <Input id="password" name="password" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} required minLength={8} />
        </Field>
        {state.error && <p role="alert" className="text-sm text-oxblood">{state.error}</p>}
        {state.info && (
          <div role="status" className="flex items-start gap-2.5 rounded-neo neo-inset-sm px-4 py-3 text-sm text-ink-2">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-oxblood" />
            <span>{state.info}</span>
          </div>
        )}
        <Button type="submit" variant="primary" loading={pending} className="mt-1">
          {mode === "signup" ? "Create workspace" : "Sign in"}
        </Button>
      </form>
    </Surface>
  );
}
