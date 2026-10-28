import {useLayoutEffect, useRef, useState} from 'react';
import type {LucideIcon} from 'lucide-react';
import './animated-bottom-nav.css';

type NavigationItem<Page extends string> = {page: Page; label: string; icon: LucideIcon};
type IndicatorBounds = {x: number; y: number; width: number; height: number};

export function AnimatedBottomNav<Page extends string>({items, activePage, onNavigate}: {
  items: readonly NavigationItem<Page>[];
  activePage: Page;
  onNavigate: (page: Page) => void;
}) {
  const navigation = useRef<HTMLElement>(null);
  const icons = useRef(new Map<Page, HTMLSpanElement>());
  const [indicator, setIndicator] = useState<IndicatorBounds | null>(null);

  useLayoutEffect(() => {
    const nav = navigation.current;
    if (!nav) return;

    const measure = () => {
      const icon = icons.current.get(activePage);
      const navRect = nav.getBoundingClientRect();
      const iconRect = icon?.getBoundingClientRect();
      if (!iconRect?.width || !navRect.width || !nav.offsetWidth || !nav.offsetHeight) {
        setIndicator(null);
        return;
      }
      // The phone preview can scale its entire iframe. Convert screen pixels back
      // into this fixed navigation's coordinates, including its top border.
      const scaleX = navRect.width / nav.offsetWidth;
      const scaleY = navRect.height / nav.offsetHeight;
      const next = {
        x: (iconRect.left - navRect.left) / scaleX - nav.clientLeft,
        y: (iconRect.top - navRect.top) / scaleY - nav.clientTop,
        width: iconRect.width / scaleX,
        height: iconRect.height / scaleY,
      };
      setIndicator(previous => previous && Object.keys(next).every(key =>
        Math.abs(previous[key as keyof IndicatorBounds] - next[key as keyof IndicatorBounds]) < 0.1,
      ) ? previous : next);
    };

    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(nav);
    icons.current.forEach(icon => observer?.observe(icon));
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [activePage, items]);

  return (
    <nav ref={navigation} className="bottom-nav animated-bottom-nav" aria-label="主导航" data-indicator-ready={Boolean(indicator)}>
      {indicator && <span className="bottom-nav-indicator" aria-hidden="true" style={{
        width: indicator.width,
        height: indicator.height,
        transform: `translate3d(${indicator.x}px, ${indicator.y}px, 0)`,
      }}/>}
      {items.map(({page, label, icon: Icon}) => (
        <button key={page} type="button" className={activePage === page ? 'active' : ''}
          aria-current={activePage === page ? 'page' : undefined} onClick={() => onNavigate(page)}>
          <span ref={element => {
            if (element) icons.current.set(page, element);
            else icons.current.delete(page);
          }}><Icon size={23} aria-hidden="true"/></span>
          {label}
        </button>
      ))}
    </nav>
  );
}
