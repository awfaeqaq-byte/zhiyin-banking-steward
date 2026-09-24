import type { ReactNode } from "react";

/** Keep the panel mounted so reversing a transition continues from its current size. */
export function Disclosure({
  open,
  id,
  children,
  className = "",
}: {
  open: boolean;
  id: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      id={id}
      className={`motion-disclosure ${className}`}
      data-open={open}
      aria-hidden={!open}
      {...(!open ? { inert: "" } : {})}
    >
      <div className="motion-disclosure-clip">{children}</div>
    </div>
  );
}
