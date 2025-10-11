// import { useState, useCallback } from "react";
// // import { TradeService } from "../service/TradeService";
// import { useDemoWallet } from "./useDemoWallet";
// import { type TradeFill } from "../types/types";

// interface TradeState {
//   fills: TradeFill[];
//   isLoading: boolean;
//   error: string | null;
// }

// export function useTradeService() {
//   const { walletService, address } = useDemoWallet();
//   const [state, setState] = useState<TradeState>({
//     fills: [],
//     isLoading: false,
//     error: null,
//   });
//   const [tradeService, setTradeService] = useState<TradeService | null>(null);

//   const initializeTradeService = useCallback(() => {
//     if (walletService) {
//       const indexerClient = walletService.getIndexerClient();
//       if (indexerClient) {
//         setTradeService(new TradeService({ indexerClient }));
//       } else {
//         setState((prev) => ({
//           ...prev,
//           error: "Indexer client not initialized",
//         }));
//       }
//     } else {
//       setState((prev) => ({
//         ...prev,
//         error: "Wallet service not initialized",
//       }));
//     }
//   }, [walletService]);

//   const fetchTradeHistory = useCallback(
//     async (subaccountNumber: number = 0, limit: number = 100) => {
//       if (!tradeService || !address) {
//         setState((prev) => ({
//           ...prev,
//           error: "Trade service or wallet address not initialized",
//         }));
//         return;
//       }

//       setState((prev) => ({ ...prev, isLoading: true, error: null }));

//       try {
//         const fills = await tradeService.getTradeHistory(
//           address,
//           subaccountNumber,
//           limit
//         );
//         setState((prev) => ({
//           ...prev,
//           fills,
//           isLoading: false,
//         }));
//         return fills;
//       } catch (error) {
//         const errorMessage =
//           error instanceof Error
//             ? error.message
//             : "Failed to fetch trade history";
//         setState((prev) => ({
//           ...prev,
//           isLoading: false,
//           error: errorMessage,
//         }));
//         console.error("Failed to fetch trade history:", error);
//       }
//     },
//     [tradeService, address]
//   );

//   const fetchFillById = useCallback(
//     async (fillId: string) => {
//       if (!tradeService) {
//         setState((prev) => ({
//           ...prev,
//           error: "Trade service not initialized",
//         }));
//         return null;
//       }

//       setState((prev) => ({ ...prev, isLoading: true, error: null }));

//       try {
//         const fill = await tradeService.getFillById(fillId);
//         setState((prev) => ({
//           ...prev,
//           isLoading: false,
//         }));
//         return fill;
//       } catch (error) {
//         const errorMessage =
//           error instanceof Error ? error.message : "Failed to fetch fill";
//         setState((prev) => ({
//           ...prev,
//           isLoading: false,
//           error: errorMessage,
//         }));
//         console.error("Failed to fetch fill by ID:", error);
//         return null;
//       }
//     },
//     [tradeService]
//   );

//   return {
//     ...state,
//     tradeService,
//     initializeTradeService,
//     fetchTradeHistory,
//     fetchFillById,
//   };
// }
