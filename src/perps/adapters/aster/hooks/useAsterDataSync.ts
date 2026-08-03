import { useEffect, useState } from 'react';
import type { Signer } from 'ethers';
import { useAccountStore } from '../../../core/stores/accountStore';
import { usePositionStore } from '../../../core/stores/positionStore';
import { useOrderStore } from '../../../core/stores/orderStore';
import { useUserDataStream } from './useUserDataStream';
import { getAccountInfo, getPositionRisk, getLeverageBracket, getMultiAssetsMargin } from '../api/account';
import { getOpenOrders } from '../api/orders';


export function useAsterDataSync(signer: Signer | null, userAddr: string | null) {
  const [isRestSynced, setIsRestSynced] = useState(false);
  const { connected } = useUserDataStream(signer, userAddr);

  useEffect(() => {
    if (!signer || !userAddr) {
      setIsRestSynced(false);
      useAccountStore.getState().setBalances([]);
      usePositionStore.getState().setPositions([]);
      useOrderStore.getState().setOrders([]);
      return;
    }

    let isMounted = true;

    async function fetchSnapshot() {
      try {
        const [accountInfo, positionRisk, openOrdersResponse, _leverageBracketResponse, multiAssetResponse] = await Promise.all([
          getAccountInfo(signer!, userAddr!),
          getPositionRisk(signer!, userAddr!),
          getOpenOrders(signer!, userAddr!),
          getLeverageBracket(signer!, userAddr!),
          getMultiAssetsMargin(signer!, userAddr!)
        ]);

        if (!isMounted) return;

        const mappedBalances = (accountInfo.assets || []).map((a: any) => ({
          asset: a.asset,
          total: a.walletBalance,
          available: a.availableBalance || a.crossWalletBalance || '0', 
          locked: String(parseFloat(a.walletBalance || '0') - parseFloat(a.availableBalance || a.crossWalletBalance || '0')),
          marginBalance: a.marginBalance || a.crossWalletBalance || a.walletBalance || '0',
          unrealizedPnl: a.unrealizedProfit || '0',
        }));

        const mappedPositions = (positionRisk || []).map(p => {
          const symbol = p.symbol.replace('USDT', '-USDT');
          return {
            symbol,
            size: p.positionAmt,
            entryPrice: p.entryPrice,
            markPrice: p.markPrice,
            liquidationPrice: p.liquidationPrice,
            unrealizedPnl: p.unRealizedProfit,
            leverage: parseFloat(p.leverage),
            marginType: p.marginType?.toLowerCase() === 'isolated' ? 'isolated' as const : 'cross' as const,
            isolatedMargin: p.isolatedMargin || '0'
          };
        }).filter(p => parseFloat(p.size) !== 0);

        const mappedOrders = (openOrdersResponse || []).map(o => {
          const symbol = o.symbol.replace('USDT', '-USDT');
          return {
            id: String(o.orderId),
            symbol,
            type: (o.type || 'LIMIT').toLowerCase() as any,
            side: (o.side || 'BUY').toLowerCase() as any,
            price: o.price,
            size: o.origQty,
            filledSize: o.executedQty,
            status: (o.status || 'NEW').toLowerCase() as any,
            reduceOnly: o.reduceOnly || false,
            timestamp: o.updateTime || Date.now()
          };
        });

        useAccountStore.getState().setBalances(mappedBalances);
        
        if (multiAssetResponse && typeof multiAssetResponse.multiAssetsMargin !== 'undefined') {
          useAccountStore.getState().setMultiAssetsMargin(multiAssetResponse.multiAssetsMargin);
        }

        usePositionStore.getState().setPositions(mappedPositions);
        useOrderStore.getState().setOrders(mappedOrders);
        
        setIsRestSynced(true);
      } catch (err) {
        console.error('[aster] Failed to fetch REST snapshot:', err);
      }
    }

    fetchSnapshot();

    return () => {
      isMounted = false;
    };
  }, [signer, userAddr]);

  return { isRestSynced, connected };
}
