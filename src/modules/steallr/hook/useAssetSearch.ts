import { useEffect, useState } from 'react';

import { Horizon } from '@stellar/stellar-sdk';

import { KNOWN_ASSETS } from '../constants/stellarAssets';

interface DisplayAsset {
  code: string;
  issuer: string;
  type: string;
  balance: string;
  isTrusted: boolean;
  iconUrl?: string;
  name?: string;
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

export const useAssetSearch = ({
  allAssets,
  searchTerm,
  server,
}: UseAssetSearchProps): UseAssetSearchReturn => {
  const [displayedAssets, setDisplayedAssets] = useState<DisplayAsset[]>(allAssets);
  const [searchLoading, setSearchLoading] = useState(false);

  useEffect(() => {
    const fetchAssets = async () => {
      if (!searchTerm) {
        setDisplayedAssets(allAssets);
        setSearchLoading(false);
        return;
      }

      const query = searchTerm.toLowerCase();
      const filteredLocal = allAssets.filter(
        a =>
          a.code.toLowerCase().includes(query) || (a.name && a.name.toLowerCase().includes(query))
      );

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

        const globalResults: DisplayAsset[] = res.records
          .map((r: any) => ({
            code: r.asset_code,
            issuer: r.asset_issuer,
            type: r.asset_type,
            balance: '0.0000000',
            isTrusted: false,
            name: KNOWN_ASSETS[r.asset_code]?.name || r.asset_code,
            iconUrl: KNOWN_ASSETS[r.asset_code]?.iconUrl,
          }))
          .filter(
            (g: DisplayAsset) =>
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
