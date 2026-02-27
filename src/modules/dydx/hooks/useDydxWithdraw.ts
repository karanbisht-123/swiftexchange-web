import { useCallback, useState } from 'react';
import { dydxWalletService } from '../service/dydxWalletService';

export const useDydxWithdraw = () => {
    const [isWithdrawing, setIsWithdrawing] = useState(false);
    const [withdrawError, setWithdrawError] = useState<string | null>(null);

    const withdraw = useCallback(
        async (amount: string, toAddress?: string) => {
            setIsWithdrawing(true);
            setWithdrawError(null);

            try {
                const result = await dydxWalletService.withdraw(amount, toAddress);

                if (!result.success) {
                    setWithdrawError(result.error || 'Withdraw failed');
                }

                return result;
            } catch (error: any) {
                const errorMessage = error.message || 'Withdraw failed';
                setWithdrawError(errorMessage);
                return {
                    success: false,
                    error: errorMessage,
                };
            } finally {
                setIsWithdrawing(false);
            }
        },
        []
    );

    return {
        withdraw,
        isWithdrawing,
        withdrawError,
        clearWithdrawError: () => setWithdrawError(null),
    };
};
