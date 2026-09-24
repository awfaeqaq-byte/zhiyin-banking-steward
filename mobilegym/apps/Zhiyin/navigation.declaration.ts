import type { NavigationDeclaration } from './navigation.types';

export const NAVIGATION_DECLARATION = {
  app: 'zhiyin',
  routes: [{
    path: '/', component: 'ZhiyinFrame', params: {}, entryPoint: 'home',
    scrollContainers: [], queryParams: {},
    description: 'Embedded Zhiyin banking prototype (classic and AI-native modes)',
    uiStates: [{
      id: 'zhiyin.webview.base', search: {},
      description: 'Local WebView. Child UI is not yet part of the MobileGym benchmark graph.',
      actions: [{ id: 'zhiyin.webview.reload', label: 'Retry loading the local app', behavior: 'other' }],
    }],
  }],
  transitions: [],
  capabilities: { historyBack: true },
} as const satisfies NavigationDeclaration;
