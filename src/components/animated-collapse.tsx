import {useLayoutEffect, useRef, type HTMLAttributes, type RefObject} from 'react';
import './animated-collapse.css';

type Props = HTMLAttributes<HTMLDivElement> & {
  open: boolean;
  returnFocusRef?: RefObject<HTMLElement>;
};

/** Keep the same content mounted so interrupted disclosures can reverse in place. */
export function AnimatedCollapse({open, returnFocusRef, children, className = '', ...props}: Props) {
  const content = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open && content.current?.contains(document.activeElement)) returnFocusRef?.current?.focus();
  }, [open, returnFocusRef]);

  return <div {...props} className={`animated-collapse ${className}`} data-open={open} aria-hidden={!open || undefined}
    {...(!open ? {inert: ''} : {})}>
    <div ref={content} className="animated-collapse-content">{children}</div>
  </div>;
}
