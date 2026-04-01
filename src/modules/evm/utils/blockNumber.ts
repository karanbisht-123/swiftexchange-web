export const hexToDecimalString = (hex: string): string => {
    if (!hex) return '0';
    try {
        const clean =
            hex.startsWith('0x') || hex.startsWith('0X') ? hex : `0x${hex}`;
        return BigInt(clean).toString();
    } catch {
        return hex;
    }
};


export const formatBlockNumber = (hex: string): string => {
    if (!hex) return '0';
    try {
        const decimal = hexToDecimalString(hex);
        return BigInt(decimal).toLocaleString();
    } catch {
        return hex;
    }
};