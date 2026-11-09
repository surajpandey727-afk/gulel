import Link from "next/link";
import { GulelMark } from "@/components/brand/gulel-mark";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center">
      <GulelMark size={56} />
      <div className="flex flex-col gap-2">
        <h1 className="text-6xl font-bold tracking-tight text-ink">404</h1>
        <p className="text-lg text-ink-2">This page does not exist.</p>
      </div>
      <Link
        href="/"
        className="mt-2 inline-flex h-10 items-center rounded-full neo-raised-sm px-6 text-sm font-medium text-oxblood transition-shadow hover:neo-raised"
      >
        Back to gulel
      </Link>
    </div>
  );
}
