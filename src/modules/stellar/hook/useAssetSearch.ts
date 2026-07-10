import { useEffect, useRef, useState } from 'react';

import { Horizon } from '@stellar/stellar-sdk';

import * as ChainUrlHelpers from '../../evm/utils/ChainUrlHelpers';
import { getAssetBySymbol, getChainById } from '../../evm/utils/Chainregistry';

interface DisplayAsset {
  code: string;
  issuer: string;
  type: string;
  balance: string;
  isTrusted: boolean;
  iconUrl?: string;
  name?: string;
  domain?: string;
  isLowLiquidity?: boolean;
}

interface UseAssetSearchProps {
  allAssets: DisplayAsset[];
  searchTerm: string;
  server: Horizon.Server | null;
}

interface UseAssetSearchReturn {
  displayedAssets: DisplayAsset[];
  searchLoading: boolean;
}

const SEARCH_DEBOUNCE_MS = 400;
const MIN_SEARCH_LENGTH = 2;
const GLOBAL_SEARCH_LIMIT = 20;
const STELLAR_EXPERT_DIRECTORY = 'https://api.stellar.expert/explorer/directory';
const UNSAFE_TAGS = new Set(['unsafe', 'malicious', 'scam', 'abandoned', 'unsafeaddress']);

interface DirectoryMeta {
  unsafe: boolean;
  domain: string;
  name: string;
}

const directoryCache = new Map<string, DirectoryMeta>();
const pendingChecks = new Set<string>();

async function checkIssuersAgainstDirectory(issuers: string[]): Promise<void> {
  const unchecked = issuers.filter(
    addr => addr && !directoryCache.has(addr) && !pendingChecks.has(addr)
  );
  if (unchecked.length === 0) return;

  unchecked.forEach(addr => pendingChecks.add(addr));

  try {
    const queryParams = unchecked.map(addr => `address[]=${encodeURIComponent(addr)}`).join('&');
    const res = await fetch(`${STELLAR_EXPERT_DIRECTORY}?${queryParams}`);
    if (!res.ok) {
      unchecked.forEach(addr => directoryCache.set(addr, { unsafe: false, domain: '', name: '' }));
      return;
    }

    const data = await res.json();
    const records: any[] = data?._embedded?.records || [];
    const returned = new Set(records.map((r: any) => r.address));

    for (const addr of unchecked) {
      const record = records.find((r: any) => r.address === addr);
      if (!returned.has(addr)) {
        directoryCache.set(addr, { unsafe: false, domain: '', name: '' });
      } else {
        const tags: string[] = (record?.tags || []).map((t: string) => t.toLowerCase());
        directoryCache.set(addr, {
          unsafe: tags.some(t => UNSAFE_TAGS.has(t)),
          domain: record?.domain || '',
          name: record?.name || '',
        });
      }
    }
  } catch {
    unchecked.forEach(addr => directoryCache.set(addr, { unsafe: false, domain: '', name: '' }));
  } finally {
    unchecked.forEach(addr => pendingChecks.delete(addr));
  }
}

function isUnsafe(issuer: string, balance?: string): boolean {
  if (parseFloat(balance || '0') > 0) return false;
  return directoryCache.get(issuer)?.unsafe === true;
}

function getIssuerDomain(issuer: string): string {
  return directoryCache.get(issuer)?.domain || '';
}

function getIssuerName(issuer: string): string {
  return directoryCache.get(issuer)?.name || '';
}

function enrichAsset(asset: DisplayAsset): DisplayAsset {
  const cachedDomain = getIssuerDomain(asset.issuer);
  const cachedName = getIssuerName(asset.issuer);
  return {
    ...asset,
    domain: asset.domain || cachedDomain,
    name: cachedName || asset.name,
  };
}

export const useAssetSearch = ({
  allAssets,
  searchTerm,
  server,
}: UseAssetSearchProps): UseAssetSearchReturn => {
  const [displayedAssets, setDisplayedAssets] = useState<DisplayAsset[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const safeAssetsRef = useRef<DisplayAsset[]>([]);

  useEffect(() => {
    if (allAssets.length === 0) return;

    const issuers = allAssets.map(a => a.issuer).filter(Boolean);

    checkIssuersAgainstDirectory(issuers).then(() => {
      const safe = allAssets.filter(a => !isUnsafe(a.issuer, a.balance)).map(enrichAsset);
      safeAssetsRef.current = safe;
      if (!searchTerm) {
        setDisplayedAssets(safe);
      }
    });
  }, [allAssets]);

  useEffect(() => {
    const fetchAssets = async () => {
      const safeAssets = safeAssetsRef.current.length > 0 ? safeAssetsRef.current : allAssets;

      if (!searchTerm) {
        setDisplayedAssets(safeAssets.filter(a => !isUnsafe(a.issuer, a.balance)).map(enrichAsset));
        setSearchLoading(false);
        return;
      }

      const query = searchTerm.toLowerCase();
      const filteredLocal = safeAssets
        .filter(
          a =>
            !isUnsafe(a.issuer, a.balance) &&
            (a.code.toLowerCase().includes(query) ||
              (a.name && a.name.toLowerCase().includes(query)) ||
              (a.domain && a.domain.toLowerCase().includes(query)))
        )
        .map(enrichAsset);

      if (!server || query.length < MIN_SEARCH_LENGTH) {
        setDisplayedAssets(filteredLocal);
        setSearchLoading(false);
        return;
      }

      setSearchLoading(true);

      try {
        const res = await server
          .assets()
          .forCode(searchTerm.toUpperCase())
          .limit(GLOBAL_SEARCH_LIMIT)
          .call();

        const issuers = Array.from(
          new Set(res.records.map((r: any) => r.asset_issuer).filter(Boolean))
        ) as string[];

        await checkIssuersAgainstDirectory(issuers);

        const globalResults: DisplayAsset[] = res.records
          .map((r: any) => {
            const numAccounts = parseInt(r.num_accounts) || 0;
            const amountVal = parseFloat(r.amount) || 0;
            const isLowLiquidity = numAccounts < 30 || amountVal < 500;

            const cachedDomain = getIssuerDomain(r.asset_issuer);
            const cachedName = getIssuerName(r.asset_issuer);

            return {
              code: r.asset_code,
              issuer: r.asset_issuer,
              type: r.asset_type,
              balance: '0.0000000',
              isTrusted: false,
              name: cachedName || getAssetBySymbol('pubnet', r.asset_code)?.name || r.asset_code,
              iconUrl: ChainUrlHelpers.getTokenIcon(
                r.asset_code,
                getChainById('pubnet'),
                r.asset_issuer
              ),
              domain: r.home_domain || cachedDomain,
              isLowLiquidity,
            };
          })
          .filter(
            (g: DisplayAsset) =>
              !isUnsafe(g.issuer) &&
              !allAssets.some((l: DisplayAsset) => l.code === g.code && l.issuer === g.issuer)
          );

        setDisplayedAssets([...filteredLocal, ...globalResults]);
      } catch (e) {
        console.error('Global search failed:', e);
        setDisplayedAssets(filteredLocal);
      } finally {
        setSearchLoading(false);
      }
    };

    setSearchLoading(true);
    const timeoutId = setTimeout(fetchAssets, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeoutId);
  }, [searchTerm, allAssets, server]);

  return { displayedAssets, searchLoading };
};
