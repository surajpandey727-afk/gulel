"use client";
import { useActionState, useState } from "react";
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
      <form action={action} className="flex flex-col gap-4">
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
        {state.error && <p role="alert" className="text-sm text-oxblood">⚠ {state.error}</p>}
        <Button type="submit" variant="primary" loading={pending} className="mt-1">
          {mode === "signup" ? "Create workspace" : "Sign in"}
        </Button>
      </form>
    </Surface>
  );
}
