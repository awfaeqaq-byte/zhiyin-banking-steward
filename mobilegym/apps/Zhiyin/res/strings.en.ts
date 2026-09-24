import type { strings } from './strings';

export const stringsEn: Partial<Record<keyof typeof strings, string>> = {
  app_name: 'Zhiyin',
  loading: 'Opening Zhiyin…',
  load_error: 'Zhiyin could not open',
  load_help: 'Run npm run phone:sync in the Zhiyin project, then try again.',
  retry: 'Try again',
};
