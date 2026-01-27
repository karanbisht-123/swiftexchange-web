export interface AssetMetadata {
    name: string;
    iconUrl: string;
    issuer?: string;
}

export const KNOWN_ASSETS: Record<string, AssetMetadata> = {
    XLM: {
        name: 'Stellar Lumens',
        iconUrl: 'https://coin-images.coingecko.com/coins/images/100/large/Stellar_symbol_black_RGB.png',
    },
    USDC: {
        name: 'USD Coin',
        iconUrl: 'https://coin-images.coingecko.com/coins/images/6319/large/usdc.png',
        issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
    },
    AQUA: {
        name: 'Aquarius',
        iconUrl: 'https://aqua.network/assets/img/aqua-logo.png',
        issuer: 'GBNZILSTVQZ4R7IKQDGHYGY2QXL5QOFJYQMXPKWRRM5PAV7Y4M67AQUA',
    },
    yXLM: {
        name: 'Yieldblox XLM',
        iconUrl: 'https://cdn.ultrastellar.com/img/assets/yxlm.png',
        issuer: 'GARDNV3Q7YGT4AKSDF25LT32YSCCW4EV22Y2TV3I2PU2MMXJTEDL5T55',
    },
    USDT: {
        name: 'Tether USD',
        iconUrl: 'https://coin-images.coingecko.com/coins/images/325/large/Tether.png',
        issuer: 'GCQTGZQQ5G4PTM2GL7CDIFKUBIPEC52BROAQIAPW53XBRJVN6ZJVTG6V',
    },
    BTC: {
        name: 'Bitcoin (Stellar)',
        iconUrl: 'https://coin-images.coingecko.com/coins/images/1/large/bitcoin.png',
        issuer: 'GDPJALI4AZKUU2W426U5WKMAT6CN3AJRPIIRYR2YM54TL2GDWO5O2MZM',
    },

    ETH: {
        name: 'Ethereum (Stellar)',
        iconUrl: 'https://coin-images.coingecko.com/coins/images/279/large/ethereum.png',
        issuer: 'GDXLKEY5TR4IDEV7FZWYFG6MA6M24YDCX5HENQ7DTESBE233EHT6HHGK',
    },
    yUSDC: {
        name: 'Yieldblox USDC',
        iconUrl: 'https://cdn.ultrastellar.com/img/assets/yusdc.png',
        issuer: 'GDGTVWSM4MGS4T7Z6W4RPWOCHE2I6RDFCIFZGS3DOA63LWQTRNZNTTFF',
    },
    BLND: {
        name: 'Blend',
        iconUrl: 'https://raw.githubusercontent.com/blend-capital/blend-ui/main/public/blend.png',
        issuer: 'CD25MNVTZDL4Y3XBCPCJXGXATV5WUHHOWMYFF4YBZEBJCX6W6W3AAFJB',
    },
    yBTC: {
        name: 'Yieldblox BTC',
        iconUrl: 'https://cdn.ultrastellar.com/img/assets/ybtc.png',
        issuer: 'GA2VRL65L3ZFEDDJ357RGI3MAOKPJZ2Z3IJTPSC24I4KDTNFSVEQURRA',
    },
    MOBI: {
        name: 'Mobius',
        iconUrl: 'https://mobius.network/images/mobi-logo.png',
        issuer: 'GA6HCMBLTZS5VYYBCATRBRZ3BZJMAFUDKYYF6AH6MVCMGWMRDNSWJPIH',
    },
    yETH: {
        name: 'Yieldblox ETH',
        iconUrl: 'https://cdn.ultrastellar.com/img/assets/yeth.png',
        issuer: 'GDWA4XSSS5B5NCVJY7QLXYYOQB7WZT2CP6GPBJ3HXGD7BKXF7RRWJ3HO',
    },
    SRT: {
        name: 'Smartlands',
        iconUrl: 'https://smartlands.io/img/srt-token.png',
        issuer: 'GCDNJUBQSX7AJWLJACMJ7I4BC3Z47BQUTMHEICZLE6MU4KQBRYG5JY6B',
    },
    DOGET: {
        name: 'Dogecoin Token',
        iconUrl: 'https://coin-images.coingecko.com/coins/images/9484/large/doget.png',
        issuer: 'GDOEVDDBU6OBWKL7VHDAOKD77UP4DCKWA6U3QWPRCGAIU6IHKZSJFOHQ',
    },
    RIO: {
        name: 'RealtyReturns',
        iconUrl: 'https://realtyreturns.io/assets/rio-logo.png',
        issuer: 'GBNZILSTVQZ4R7IKQDGHYGY2QXL5QOFJYQMXPKWRRM5PAV7Y4M67AQUA',
    },
    WXT: {
        name: 'Wirex Token',
        iconUrl: 'https://coin-images.coingecko.com/coins/images/7962/large/wirex.png',
        issuer: 'GASBLVHS5FOABSDNW5SPPH3QRJYXY5JHA2AOA2QHH2FJLZBRXSG4SWXT',
    },
    TERN: {
        name: 'Ternio',
        iconUrl: 'https://ternio.io/wp-content/uploads/2021/10/tern-logo.png',
        issuer: 'GDGQDVO6XPFSY4NMX75A7AOVYCF5JYGW2SHCJJNWCQWIDGOZB53DGP6C',
    },
    SLT: {
        name: 'Smartlands Token',
        iconUrl: 'https://smartlands.io/img/slt-token.png',
        issuer: 'GCKA6K5PCQ6PNF5RQBF7PQDJWRHO6UOGFMRLK3DYHDOI244V47XKQ4GP',
    },
    CLXY: {
        name: 'CLX Token',
        iconUrl: 'https://clxy.io/assets/logo.png',
        issuer: 'GDALPCGWZ2O2PJTHVGZGVDJSXMMQDQRXG3WFQCB2RYBRZ4TGIDX4MNDK',
    },
    REPO: {
        name: 'Repo Token',
        iconUrl: 'https://repo.stellar.org/assets/repo-logo.png',
        issuer: 'GCZNF24HPMYTV6NOEHI7Q5RJFFUI23JKUKY3H3XTQAFBQIBOHD5OXG3B',
    },
    EURC: {
        name: 'Euro Coin',
        iconUrl: 'https://coin-images.coingecko.com/coins/images/26045/large/euro-coin.png',
        issuer: 'GDHU6WRG4IEQXM5NZ4BMPKOXHW76MZM4Y2IEMFDVXBSDP6SJY4ITNPP2',
    },
    LSP: {
        name: 'Litemint',
        iconUrl: 'https://litemint.com/assets/logo.png',
        issuer: 'GC7DJUFVMD5BYXS67MWAAQSJF6UASF47SRJHUAECQHIJNECH4VVFBYSM',
    },
    CNY: {
        name: 'Chinese Yuan',
        iconUrl: 'https://stellar.expert/img/vendor/currencies/cny.png',
        issuer: 'GAREELUB43IRHWEASCFBLKHURCGMHE5IF6XSE7EXDLACYHGRHM43RFOX',
    },
    ARST: {
        name: 'AriseBank Token',
        iconUrl: 'https://arisebank.com/assets/arst-logo.png',
        issuer: 'GCSAZVWXZKWS4XS223M5F54H2B6XPIIXZZGP7KEAIU6YSL5HDRGCI3DG',
    },
    SHX: {
        name: 'StrongHold USD',
        iconUrl: 'https://stronghold.co/assets/shx-logo.png',
        issuer: 'GDSTRSHXHGJ7ZIVRBXEYE5Q74XUVCUSEKEBR7UCHEUUEK72N7I7KJ6JH',
    },
    CANNACOIN: {
        name: 'CannaCoin',
        iconUrl: 'https://cannacoin.io/assets/logo.png',
        issuer: 'GBPFQVF3ZAXQLXS7FMUAIW3D55MRNVPXPKF3UPQF2JHRT5VPLP3XPUEU',
    },
    GOAT: {
        name: 'GOAT Token',
        iconUrl: 'https://goat.network/assets/goat-logo.png',
        issuer: 'GDPJALI4AZKUU2W426U5WKMAT6CN3AJRPIIRYR2YM54TL2GDWO5O2MZM',
    },
};