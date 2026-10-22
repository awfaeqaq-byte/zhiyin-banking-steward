import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useRef, type ReactNode } from "react";
import { usePhoneBack } from "../../lib/phone-bridge";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

function canRestoreFocus(element: HTMLElement) {
  if (!element.isConnected || element.matches(':disabled, input[type="hidden"]') ||
      element.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
  if (element.tabIndex < 0 && !element.hasAttribute("tabindex") &&
      !element.matches('summary, [contenteditable="true"], [contenteditable=""]')) return false;
  for (let ancestor: HTMLElement | null = element; ancestor; ancestor = ancestor.parentElement) {
    const style = getComputedStyle(ancestor);
    if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse") return false;
  }
  return true;
}

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  className = "",
}: DialogProps) {
  const returnFocus = useRef<HTMLElement | null>(null);
  usePhoneBack(() => {
    onOpenChange(false);
    return true;
  }, 100, open);
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="dialog-overlay" />
        <DialogPrimitive.Content
          className={`dialog-content ${className}`}
          onOpenAutoFocus={() => {
            returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
          }}
          onCloseAutoFocus={event => {
            const content = event.currentTarget as HTMLElement;
            const target = returnFocus.current;
            // Let Radix restore its own trigger first. Only fill an empty focus
            // position, preserving any destination chosen by the business flow.
            queueMicrotask(() => {
              const active = document.activeElement;
              if (active && active !== document.body && !content.contains(active)) return;
              if (target && canRestoreFocus(target)) target.focus({ preventScroll: true });
            });
          }}
        >
          <div className="dialog-heading">
            <div>
              <DialogPrimitive.Title>{title}</DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description>
                  {description}
                </DialogPrimitive.Description>
              ) : null}
            </div>
            <DialogPrimitive.Close className="icon-control" aria-label="关闭">
              <X aria-hidden="true" size={20} />
            </DialogPrimitive.Close>
          </div>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
