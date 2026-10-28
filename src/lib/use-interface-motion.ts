import {useLayoutEffect, useRef} from 'react';

const easing = 'cubic-bezier(0.16, 1, 0.3, 1)';
const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)');

const primaryPages = ['home', 'assets', 'risk', 'cards', 'profile'];
type NavigationIntent = 'forward' | 'back';

/** Move page content, never the persistent worker or an ancestor of a fixed composer. */
export function usePageMotion(page: string, intent: NavigationIntent = 'forward') {
  const surface = useRef<HTMLElement>(null);
  const previous = useRef(page);
  useLayoutEffect(() => {
    const from = previous.current;
    previous.current = page;
    const element = surface.current;
    const preference = reduceMotion();
    if (from === page || !element || preference?.matches || document.hidden) return;
    const fromIndex = primaryPages.indexOf(from), toIndex = primaryPages.indexOf(page);
    const direction = fromIndex >= 0 && toIndex >= 0 ? Math.sign(toIndex - fromIndex) : intent === 'back' ? -1 : 1;
    const candidates = page === 'home'
      ? element.querySelectorAll<HTMLElement>('.steward-message, .steward-live-summary, .scenario-conversations, .home-title')
      : element.querySelectorAll<HTMLElement>(':scope > :not([data-page-persistent])');
    const viewportHeight = window.innerHeight;
    const animations: Animation[] = [];
    for (const node of candidates) {
      const rect = node.getBoundingClientRect();
      if (!node.animate || !node.getClientRects().length || rect.bottom < 0 || rect.top > viewportHeight) continue;
      // Planners can own a fixed talk bar. Those surfaces only fade, keeping the
      // bar anchored to the viewport throughout navigation.
      const ownsFixedUI = node.matches('.occasion-planner, .native-root') || !!node.querySelector('.occasion-talk, .native-composer');
      animations.push(node.animate([
        {opacity: 0.2, translate: ownsFixedUI ? 'none' : `${direction * 26}px 0`},
        {opacity: 1, translate: 'none'},
      ], {duration: 320, easing}));
    }
    const stop = () => animations.forEach(animation => animation.cancel());
    preference?.addEventListener('change', stop);
    return () => { stop(); preference?.removeEventListener('change', stop); };
  }, [page, intent]);
  return surface;
}

/** Only new messages arrive. Initial hydration, restored history and hidden work stay still. */
export function useConversationArrival(ids: string[], ready: boolean, conversationKey: string) {
  const surface = useRef<HTMLDivElement>(null);
  const snapshot = JSON.stringify(ids);
  const previous = useRef({ids: new Set(ids), ready: false, conversationKey});
  useLayoutEffect(() => {
    const currentIds = JSON.parse(snapshot) as string[];
    const prior = previous.current;
    previous.current = {ids: new Set(currentIds), ready, conversationKey};
    if (!ready || !prior.ready || conversationKey !== prior.conversationKey) return;
    const added = currentIds.filter(id => !prior.ids.has(id));
    const oldTail = [...prior.ids].at(-1);
    const tailIndex = oldTail ? currentIds.indexOf(oldTail) : -1;
    // Small history backfills and transcript replacements are not new turns either.
    if (oldTail && (tailIndex < 0 || added.some(id => currentIds.indexOf(id) <= tailIndex))) return;
    // Bulk history refresh is not a conversation turn.
    if (!added.length || added.length > 3 || document.hidden) return;
    const preference = reduceMotion();
    if (preference?.matches) return;
    const nodes = surface.current?.querySelectorAll<HTMLElement>('[data-message-id]') ?? [];
    const animations: Animation[] = [];
    for (const node of nodes) {
      if (!added.includes(node.dataset.messageId ?? '') || !node.animate || !node.getClientRects().length) continue;
      const from = node.classList.contains('user') ? 'translateY(10px)' : 'translateY(14px)';
      animations.push(node.animate(
        [{opacity: 0.2, transform: from}, {opacity: 1, transform: 'none'}],
        {duration: 280, easing},
      ));
    }
    const stop = () => animations.forEach(animation => animation.cancel());
    preference?.addEventListener('change', stop);
    return () => { stop(); preference?.removeEventListener('change', stop); };
  }, [snapshot, ready, conversationKey]);
  return surface;
}
