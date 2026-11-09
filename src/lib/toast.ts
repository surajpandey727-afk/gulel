import { toast } from "sonner";

type ActionResult = { ok: boolean; error?: string; message?: string };

export function showActionResult(result: ActionResult, successMessage?: string) {
  if (result.ok) {
    toast.success(result.message ?? successMessage ?? "Done");
  } else {
    toast.error(result.error ?? "Something went wrong");
  }
}
