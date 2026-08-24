export function getBridgeNativeFee(
  actionType: string,
  feePayType: string,
  activeQuoteData: any
): number {
  if (actionType === 'BRIDGE' && feePayType === 'native' && activeQuoteData?.fee?.native) {
    const feeAmount = activeQuoteData.fee.native.amount;
    const parsed = typeof feeAmount === 'string' ? parseFloat(feeAmount) : Number(feeAmount);
    return isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}
