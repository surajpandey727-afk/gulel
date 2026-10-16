"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Play, RotateCcw } from "lucide-react";
import { Button } from "@/components/neo/button";
import { runWorkerAction, retryJobAction } from "../settings/actions";

export function OpsControls() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      loading={pending}
      onClick={() =>
        start(async () => {
          await runWorkerAction();
          router.refresh();
        })
      }
    >
      <Play className="h-3.5 w-3.5" /> Run worker now
    </Button>
  );
}

export function RetryJobBtn({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="ghost"
      loading={pending}
      onClick={() =>
        start(async () => {
          await retryJobAction(id);
          router.refresh();
        })
      }
    >
      <RotateCcw className="h-3.5 w-3.5" /> Retry
    </Button>
  );
}
