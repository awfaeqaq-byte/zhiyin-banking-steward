import type React from 'react';
import { useTriggerGestures } from '../../../os/hooks/useTriggerGestures';
import { useFoodDeliveryNavigation } from '../navigation';
import type { TransitionId } from '../navigation.declaration';

type GestureId = TransitionId | 'system.back';

export function useFoodDeliveryGestures() {
  const { go, back } = useFoodDeliveryNavigation();
  const gestures = useTriggerGestures<GestureId>({ execute: (id, params) => {
    if (id !== 'system.back') go(id, params);
  } });

  const bindBack = <T extends HTMLElement>() => ({
    ...gestures.bindTap<T>('system.back'),
    'data-trigger-type': 'back' as const,
  });
  const bindAction = <T extends HTMLElement>(id: string, params: Record<string, string | number | boolean>, onTrigger: () => void) =>
    gestures.bindTap<T>({ kind: 'action', id }, { params, onTrigger });

  return { ...gestures, bindBack, bindAction, go, back };
}

