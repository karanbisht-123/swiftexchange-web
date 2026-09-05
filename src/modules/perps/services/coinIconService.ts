import coinsData from '../../../data/assets/coins.json';

interface CoinData {
  id: string;
  symbol: string;
  name: string;
  image: string;
}

const coins = coinsData as CoinData[];
const iconMap = new Map<string, string>();

coins.forEach(c => {
  iconMap.set(c.symbol.toLowerCase(), c.image);
});

// Normalizes symbol name (e.g., "ETH-USDT" -> "eth", "1000PEPE" -> "pepe")

function normalizeSymbol(symbol: string): string {
  if (!symbol) return '';
  let base = symbol.split('-')[0] || symbol;
  base = base.replace(/^1000/, '');
  return base.toLowerCase();
}

//Get coin icon URL from local JSON data.
//Returns the URL string on success, or null if not found.

export function getCoinIconUrl(symbol: string): string | null {
  const normSymbol = normalizeSymbol(symbol);
  return iconMap.get(normSymbol) || null;
}
