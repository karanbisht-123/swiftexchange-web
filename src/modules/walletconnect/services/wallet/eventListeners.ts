import type { WalletServiceContext, WalletType } from './types';

// ---------------------------------------------------------------------------
// EVM extension listeners
// ---------------------------------------------------------------------------

export function setupEVMListeners(ctx: WalletServiceContext, provider: any): void {
  provider.on('accountsChanged', (accounts: string[]) => {
    if (!accounts?.length) {
      handleDisconnect(ctx, 'evm');
      return;
    }

    const session = ctx.sessions.get('evm');
    if (!session) return;


    session.evmAddress = accounts[0];



    ctx.sessions.set('evm', session);
    ctx.saveSession();
    ctx.emitState('evm', 'connected');
  });

  provider.on('chainChanged', (chainId: string) => {
    const session = ctx.sessions.get('evm');
    if (!session) return;
    session.evmChainId = parseInt(chainId, 16);
    ctx.sessions.set('evm', session);
    ctx.saveSession();
    ctx.emitState('evm', 'connected');
  });

  provider.on('disconnect', () => {
    handleDisconnect(ctx, 'evm');
  });
}

// ---------------------------------------------------------------------------
// WalletConnect session listeners
// ---------------------------------------------------------------------------

export function setupWalletConnectListeners(
  ctx: WalletServiceContext,
  provider: any,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _type: WalletType
): void {
  if (ctx.registeredProviders.has(provider)) return;
  ctx.registeredProviders.add(provider);

  const getBoundTypes = (): WalletType[] => {
    const types: WalletType[] = [];
    for (const [key, p] of ctx.providers.entries()) {
      if (p === provider && (key === 'evm' || key === 'stellar')) {
        types.push(key as WalletType);
      }
    }
    return types;
  };

  provider.on(
    'session_event',
    ({ event, chainId }: { event: { name: string; data: any }; chainId?: string }) => {
      let eventType: WalletType | undefined;
      if (chainId?.startsWith('eip155')) eventType = 'evm';
      else if (chainId?.startsWith('stellar')) eventType = 'stellar';
      else {
        const bound = getBoundTypes();
        if (bound.length > 0) eventType = bound[0];
      }

      if (!eventType) return;
      if (event.name === 'accountsChanged') handleAccountsChanged(ctx, eventType, event.data);
      if (event.name === 'chainChanged') handleChainChanged(ctx, eventType, event.data);
    }
  );

  provider.on('session_update', ({ params }: { topic: string; params: any }) => {
    if (params?.namespaces) {
      getBoundTypes().forEach(t => handleSessionUpdate(ctx, t, params.namespaces));
    }
  });

  provider.on('session_delete', (event: any) => {
    console.log('[WC] SESSION DELETE', event);
    getBoundTypes().forEach(t => handleDisconnect(ctx, t));
  });
  provider.on('session_expire', () => getBoundTypes().forEach(t => handleDisconnect(ctx, t)));
  provider.on('session_ping', () =>
    getBoundTypes().forEach(t => ctx.lastPingAt.set(t, Date.now()))
  );
  provider.on('session_extend', () => {
    getBoundTypes().forEach(t => {
      if (ctx.sessions.get(t)) ctx.emitState(t, 'connected');
    });
  });
  provider.on('proposal_expire', () => { });
  provider.on('disconnect', () => getBoundTypes().forEach(t => handleDisconnect(ctx, t)));
}

// ---------------------------------------------------------------------------
// Visibility handler (relay transport reopen)
// ---------------------------------------------------------------------------

export function setupVisibilityHandler(ctx: WalletServiceContext): void {
  if (typeof document === 'undefined') return;

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    const seen = new Set<any>();
    for (const provider of ctx.providers.values()) {
      if (!provider || seen.has(provider)) continue;
      seen.add(provider);
      if (!provider.session) continue;

      try {
        const relayer = provider.client?.core?.relayer;
        if (relayer && typeof relayer.transportOpen === 'function') {
          console.debug('[WalletService] Tab visible — reopening WC relay transport');
          relayer.transportOpen().catch((err: any) => {
            console.warn('[WalletService] Relay transportOpen error:', err);
          });
        }
      } catch (err) {
        console.warn('[WalletService] visibilitychange relay reopen error:', err);
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Internal event handlers
// ---------------------------------------------------------------------------

export function handleAccountsChanged(
  ctx: WalletServiceContext,
  type: WalletType,
  accounts: unknown
): void {
  if (!accounts || (Array.isArray(accounts) && accounts.length === 0)) {
    handleDisconnect(ctx, type);
    return;
  }

  const session = ctx.sessions.get(type);
  if (!session) return;

  const firstAccount = Array.isArray(accounts) ? accounts[0] : accounts;
  if (typeof firstAccount !== 'string') return;


  if (type === 'evm') {
    if (firstAccount.includes(':')) {
      const [, chainIdStr, address] = firstAccount.split(':');
      session.evmAddress = address;
      session.evmChainId = parseInt(chainIdStr, 10);
    } else {
      session.evmAddress = firstAccount;
    }

  } else if (type === 'stellar') {
    if (firstAccount.includes(':')) {
      const [, chainId, address] = firstAccount.split(':');
      session.stellarAddress = address;
      session.stellarChainId = chainId;
    } else {
      session.stellarAddress = firstAccount;
    }
  }

  ctx.sessions.set(type, session);
  ctx.saveSession();
  ctx.emitState(type, 'connected');
}

export function handleChainChanged(
  ctx: WalletServiceContext,
  type: WalletType,
  chainData: unknown
): void {
  const session = ctx.sessions.get(type);
  if (!session || type !== 'evm') return;

  if (typeof chainData === 'string') {
    session.evmChainId = chainData.startsWith('0x')
      ? parseInt(chainData, 16)
      : parseInt(chainData, 10);
  } else if (typeof chainData === 'number') {
    session.evmChainId = chainData;
  } else {
    return;
  }

  ctx.sessions.set(type, session);
  ctx.saveSession();
  ctx.emitState(type, 'connected');
}

export function handleSessionUpdate(
  ctx: WalletServiceContext,
  type: WalletType,
  namespaces: any
): void {
  const session = ctx.sessions.get(type);
  if (!session) return;

  if (type === 'evm' && namespaces.eip155) {
    const account: string | undefined = namespaces.eip155.accounts?.[0];
    if (account) {
      const [, chainIdStr, address] = account.split(':');
      session.evmAddress = address;
      session.evmChainId = parseInt(chainIdStr, 10);
    }
  } else if (type === 'stellar' && namespaces.stellar) {
    const account: string | undefined = namespaces.stellar.accounts?.[0];
    if (account) {
      const [, chainId, address] = account.split(':');
      session.stellarAddress = address;
      session.stellarChainId = chainId;
    }
  }

  ctx.sessions.set(type, session);
  ctx.saveSession();
  ctx.emitState(type, 'connected');
}

export function handleDisconnect(ctx: WalletServiceContext, type: WalletType): void {
  if (ctx.disconnecting.has(type)) return;
  ctx.handleDisconnect(type);
}
