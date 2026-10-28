import {useEffect, useState, type HTMLAttributes} from 'react';

/** Keep a closing drawer briefly for its exit; it immediately stops accepting input. */
export function MotionPresence({open, children, ...props}: HTMLAttributes<HTMLDivElement> & {open: boolean}) {
  const [present, setPresent] = useState(open);
  useEffect(() => {
    if (open) { setPresent(true); return; }
    const preference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (preference?.matches) { setPresent(false); return; }
    const timeout = window.setTimeout(() => setPresent(false), 160);
    const finish = () => setPresent(false);
    preference?.addEventListener('change', finish);
    return () => { window.clearTimeout(timeout); preference?.removeEventListener('change', finish); };
  }, [open]);
  if (!open && !present) return null;
  return <div {...props} data-state={open ? 'open' : 'closed'}
    aria-hidden={!open || undefined}
    {...(!open ? {inert: ''} : {})}
    style={{...props.style, ...(!open ? {pointerEvents: 'none'} : {})}}>{children}</div>;
}
