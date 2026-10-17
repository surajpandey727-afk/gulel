"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Button } from "@/components/neo/button";
import { discoverPeopleAllAction } from "@/app/(app)/organisations/actions";

export function DiscoverPeopleButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="flex items-center gap-2">
      <Button
        size="sm"
        loading={pending}
        onClick={async () => {
          setPending(true);
          setError(null);
          setMsg(null);
          try {
            const r = await discoverPeopleAllAction();
            if (!r.ok) setError(r.error);
            else { setMsg(r.message ?? "Queued"); router.refresh(); }
          } finally { setPending(false); }
        }}
      >
        <Search className="h-4 w-4" />
        Discover people
      </Button>
      {msg && <span className="text-xs text-positive">{msg}</span>}
      {error && <span role="alert" className="text-xs text-oxblood">{error}</span>}
    </span>
  );
}
