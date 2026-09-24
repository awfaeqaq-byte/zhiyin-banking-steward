import type { AppManifest } from '@/os/types/manifest';
import { PERMISSIONS } from '@/os/permissions';
import { IcLauncher } from './res/icons';

export const manifest: AppManifest = {
  id: 'zhiyin',
  packageName: 'com.zhiyin.banking.sandbox',
  displayName: '知银',
  displayNameEn: 'Zhiyin',
  aliases: ['知银', '银行管家', 'zhiyin'],
  version: '0.1.0',
  versionCode: 1,
  type: 'plugin',
  icon: IcLauncher,
  iconBackground: '#206a70',
  iconForeground: '#ffffff',
  designViewportWidth: 390,
  permissions: [PERMISSIONS.READ_CONTACTS],
  queries: [
    { action: 'ACTION_FINANCIAL_DATA_CONSENT', scheme: 'weixin' },
    { action: 'ACTION_FINANCIAL_DATA_CONSENT', scheme: 'alipays' },
  ],
  theme: {
    colors: {
      primary: '#206a70', primaryDark: '#14545c', background: '#fafcfb',
      surface: '#ffffff', textPrimary: '#142b38', textSecondary: '#61757d',
      border: '#e4ebe8', statusBarForeground: 'dark', navigationBarForeground: 'dark',
    },
  },
};
