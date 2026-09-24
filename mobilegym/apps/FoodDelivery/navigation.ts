import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { NAVIGATION_DECLARATION, type TransitionId } from './navigation.declaration';

export function useFoodDeliveryNavigation() {
  const navigate = useNavigate();

  const go = useCallback((id: TransitionId, params: Record<string, string | number> = {}, options?: { mode?: 'push' | 'replace' }) => {
    const transition = NAVIGATION_DECLARATION.transitions.find(item => item.id === id);
    if (!transition) throw new Error(`Transition not found: ${id}`);
    let pathname: string = transition.to;
    for (const [key, value] of Object.entries(params)) pathname = pathname.replace(`:${key}`, String(value));
    const search = new URLSearchParams();
    for (const key of Object.keys(transition.searchParams)) {
      const value = params[key];
      if (value !== undefined) search.set(key, String(value));
    }
    const url = search.size > 0 ? `${pathname}?${search}` : pathname;
    navigate(url, (options?.mode ?? transition.mode) === 'replace' ? { replace: true } : undefined);
  }, [navigate]);

  const back = useCallback(() => navigate(-1), [navigate]);
  return { go, back };
}
