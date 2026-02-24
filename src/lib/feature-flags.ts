type BooleanFlagChangeHandler = (value: boolean) => void;

type LaunchDarklyClientLike = {
  waitForInitialization: (timeoutSeconds?: number) => Promise<unknown>;
  variation: (flagKey: string, defaultValue: boolean) => boolean;
  on: (eventName: string, handler: (value: unknown) => void) => void;
  off?: (eventName: string, handler: (value: unknown) => void) => void;
};

type FeatureFlagsState = {
  initPromise: Promise<LaunchDarklyClientLike | null> | null;
  client: LaunchDarklyClientLike | null;
  ready: boolean;
  ldClientId: string | null;
};

type FeatureFlagsBootstrap = {
  ldClientId?: string | null;
};

const LD_CONTEXT = {
  kind: 'enduser',
  key: 'toolbelt.sh'
} as const;

export const APP_FEATURE_FLAGS = {
  'android-xml-download': 'android-xml-download',
} as const;

const getState = (): FeatureFlagsState => {
  const host = globalThis as typeof globalThis & {
    __toolbeltFeatureFlagsState?: FeatureFlagsState;
    __toolbeltConfig?: FeatureFlagsBootstrap;
  };

  if (!host.__toolbeltFeatureFlagsState) {
    host.__toolbeltFeatureFlagsState = {
      initPromise: null,
      client: null,
      ready: false,
      ldClientId: host.__toolbeltConfig?.ldClientId?.trim() || null
    };
  }

  return host.__toolbeltFeatureFlagsState;
};

const readBootstrapLdClientId = (): string | null => {
  const host = globalThis as typeof globalThis & {
    __toolbeltConfig?: FeatureFlagsBootstrap;
  };

  return host.__toolbeltConfig?.ldClientId?.trim() || null;
};

export const configureFeatureFlags = (config: { ldClientId?: string | null }): void => {
  const state = getState();
  const nextClientId = config.ldClientId?.trim() || null;

  if (state.client && state.ldClientId && nextClientId && state.ldClientId !== nextClientId) {
    console.warn('Feature flags already initialized; ignoring LD client ID reconfiguration.');
    return;
  }

  state.ldClientId = nextClientId;
};

export const initFeatureFlags = async (): Promise<LaunchDarklyClientLike | null> => {
  if (typeof window === 'undefined') return null;

  const state = getState();
  if (!state.ldClientId) {
    state.ldClientId = readBootstrapLdClientId();
  }
  if (state.client) return state.client;
  if (state.initPromise) return state.initPromise;

  state.initPromise = (async () => {
    try {
      if (!state.ldClientId) {
        console.warn('LaunchDarkly disabled: missing LD_CLIENT_ID.');
        return null;
      }

      const { initialize } = await import('launchdarkly-js-client-sdk');
      const client = initialize(state.ldClientId, LD_CONTEXT) as LaunchDarklyClientLike;
      await client.waitForInitialization(5);

      state.client = client;
      state.ready = true;
      console.log('LaunchDarkly SDK successfully initialized!');
      return client;
    } catch (error) {
      console.error('LaunchDarkly initialization failed', error);
      state.client = null;
      state.ready = false;
      state.initPromise = null;
      return null;
    }
  })();

  return state.initPromise;
};

export const primeFeatureFlags = async (): Promise<void> => {
  await initFeatureFlags();
};

export const getBooleanFeatureFlag = async (flagKey: string, fallback = false): Promise<boolean> => {
  const client = await initFeatureFlags();
  if (!client) return fallback;

  try {
    return Boolean(client.variation(flagKey, fallback));
  } catch {
    return fallback;
  }
};

export const subscribeBooleanFeatureFlag = async (
  flagKey: string,
  handler: BooleanFlagChangeHandler,
  fallback = false
): Promise<() => void> => {
  const client = await initFeatureFlags();
  if (!client) {
    handler(fallback);
    return () => {};
  }

  handler(Boolean(client.variation(flagKey, fallback)));

  const eventName = `change:${flagKey}`;
  const wrapped = (value: unknown) => handler(Boolean(value));
  client.on(eventName, wrapped);

  return () => {
    if (typeof client.off === 'function') {
      client.off(eventName, wrapped);
    }
  };
};
