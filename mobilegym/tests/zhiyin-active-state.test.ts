import { describe, expect, it } from 'vitest';
import { isAppActive } from '../apps/Zhiyin/active-state';

describe('Zhiyin foreground guard', () => {
  const state = {
    tasks: [{
      taskId: 'task_1', rootAppId: 'zhiyin', lastActiveAt: 1,
      stack: [{ activityId: 'act_1', appId: 'zhiyin', initialRoute: '/' }],
    }],
    activeTaskId: 'task_1', isLauncherVisible: false, isRecentsVisible: false,
  };

  it('derives the active app from the task stack instead of an optional cached field', () => {
    expect(isAppActive(state, 'zhiyin')).toBe(true);
    expect(isAppActive({ ...state, isLauncherVisible: true }, 'zhiyin')).toBe(false);
    expect(isAppActive({ ...state, activeTaskId: null }, 'zhiyin')).toBe(false);
  });
});
