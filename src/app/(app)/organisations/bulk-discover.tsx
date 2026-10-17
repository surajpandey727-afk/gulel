"use client";
import { useState, useTransition } from "react";
import { Link2, Upload } from "lucide-react";
import { Button } from "@/components/neo/button";
import { Modal } from "@/components/neo/controls";
import { Field, Textarea } from "@/components/neo/field";
import { bulkLinkedInDiscoverAction } from "./actions";

export function BulkDiscoverButton() {
  const [open, setOpen] = useState(false);
  const [urls, setUrls] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ queued: number; skipped: string[] } | null>(null);
  const [pending, start] = useTransition();

  const submit = () =>
    start(async () => {
      setError(null);
      setResult(null);
      const lines = urls.split("\n").map((l) => l.trim()).filter(Boolean);
      if (!lines.length) { setError("Paste at least one LinkedIn company URL."); return; }
      const r = await bulkLinkedInDiscoverAction(lines);
      if (!r.ok) setError(r.error);
      else setResult(r.data!);
    });

  const reset = () => { setOpen(false); setUrls(""); setResult(null); setError(null); };

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Upload className="h-4 w-4" /> Bulk discover
      </Button>
      <Modal
        open={open}
        onOpenChange={(v) => { if (!v) reset(); else setOpen(true); }}
        title="Bulk LinkedIn discovery"
        description="Paste LinkedIn company URLs (one per line). Each is validated, looked up, and added as an organisation."
        footer={
          result
            ? <Button variant="primary" onClick={reset}>Done</Button>
            : <><Button onClick={reset}>Cancel</Button><Button variant="primary" loading={pending} onClick={submit} disabled={!urls.trim()}>Queue discovery</Button></>
        }
      >
        {!result ? (
          <>
            <Field label="LinkedIn company URLs" htmlFor="bulk-urls">
              <Textarea
                id="bulk-urls"
                value={urls}
                onChange={(e) => setUrls(e.target.value)}
                placeholder={"linkedin.com/company/acme\nlinkedin.com/company/globex\nlinkedin.com/company/initech"}
                className="min-h-40 font-mono text-sm"
              />
            </Field>
            <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-3">
              <Link2 className="h-3 w-3" />
              One URL per line. Duplicates and invalid URLs are skipped.
            </p>
            {error && <p role="alert" className="mt-3 text-sm text-oxblood">⚠ {error}</p>}
          </>
        ) : (
          <div className="flex flex-col gap-3 text-sm">
            <p className="font-medium text-positive">{result.queued} URL(s) queued for discovery.</p>
            <p className="text-ink-2">Check the Activity panel for per-URL progress.</p>
            {result.skipped.length > 0 && (
              <details className="text-xs text-ink-3">
                <summary className="cursor-pointer">{result.skipped.length} skipped</summary>
                <ul className="mt-1 list-disc pl-5">{result.skipped.map((s, i) => <li key={i}>{s}</li>)}</ul>
              </details>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
