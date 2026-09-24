/** The host exposes one WebView route; child navigation is handled by the bridge. */
export interface NavigationDeclaration {
  app: string;
  routes: Array<{
    path: string;
    component: string;
    params: Record<string, 'string' | 'number'>;
    entryPoint: 'home';
    scrollContainers: readonly [];
    queryParams: Record<string, 'string' | 'number'>;
    description: string;
    uiStates: Array<{
      id: string;
      search: Record<string, string | null>;
      description: string;
      actions?: Array<{ id: string; label: string; behavior: 'other' }>;
    }>;
  }>;
  transitions: readonly [];
  capabilities: { historyBack: boolean };
}
