import { getActiveAppId } from '@/os/taskUtils';
import type { AppId, OSState } from '@/os/types';

export function isAppActive(state: OSState, appId: AppId): boolean {
  return !state.isLauncherVisible && !state.isRecentsVisible && getActiveAppId(state) === appId;
}
