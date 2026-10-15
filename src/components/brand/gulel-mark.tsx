/* eslint-disable @next/next/no-img-element */
export function GulelMark({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <img
      src="/icons/monogram.png"
      alt=""
      width={size}
      height={size}
      className={className}
      style={{ objectFit: "contain" }}
      aria-hidden
    />
  );
}
