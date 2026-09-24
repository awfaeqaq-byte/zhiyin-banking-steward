import type { AppManifest } from '@/os/types/manifest';
import { IcLauncher } from './res/icons';

export const manifest: AppManifest = {
  id: 'fooddelivery',
  packageName: 'com.sandbox.goodbite',
  displayName: '好食送',
  displayNameEn: 'GoodBite',
  aliases: ['外卖', '好食送外卖'],
  version: '1.0.0',
  versionCode: 1,
  type: 'plugin',
  icon: IcLauncher,
  iconBackground: '#FF4D72',
  iconForeground: '#FFFFFF',
  designViewportWidth: 360,
  theme: {
    colors: {
      primary: '#FF4D72',
      primaryDark: '#E9365D',
      background: '#F7F7F9',
      surface: '#FFFFFF',
      textPrimary: '#1F2024',
      textSecondary: '#7A7D86',
      border: '#ECECF0',
      statusBarForeground: 'dark',
      navigationBarForeground: 'dark',
    },
  },
};

