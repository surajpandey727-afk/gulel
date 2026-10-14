"use client";
import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

export function SearchBox({ placeholder, param = "q" }: { placeholder: string; param?: string }) {
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const [v, setV] = useState(params.get(param) ?? "");
  useEffect(() => {
    const t = setTimeout(() => {
      if ((params.get(param) ?? "") === v) return;
      const next = new URLSearchParams(params);
      if (v) next.set(param, v); else next.delete(param);
      router.replace(`${path}?${next}`, { scroll: false });
    }, 250);
    return () => clearTimeout(t);
  }, [v, params, param, path, router]);
  return (
    <label className="relative block w-full max-w-sm">
      <span className="sr-only">{placeholder}</span>
      <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" aria-hidden />
      <input value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder}
        className="h-10 w-full rounded-full neo-inset-sm pl-10 pr-4 text-sm outline-none placeholder:text-ink-3" />
    </label>
  );
}
