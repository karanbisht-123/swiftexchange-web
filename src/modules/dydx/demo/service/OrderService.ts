import { IndexerClient, OrderStatus } from '@dydxprotocol/v4-client-js';

import { type Order } from '../types/types';

console.log(OrderStatus);

export interface OrderServiceConfig {
  indexerClient: IndexerClient;
}

export class OrderService {
  private indexerClient: IndexerClient;

  constructor(config: OrderServiceConfig) {
    this.indexerClient = config.indexerClient;
  }

  /**
   * Get all active/open orders for a subaccount
   * @param address Wallet address
   * @param subaccountNumber Subaccount number (default 0)
   * @returns Array of active orders
   */
  async getActiveOrders(address: string, subaccountNumber: number = 0): Promise<Order[]> {
    try {
      const response = await this.indexerClient.account.getSubaccountOrders(
        address,
        subaccountNumber
      );

      if (!response?.orders) {
        return [];
      }

      // Map to your Order interface (adjust as needed)
      return response.orders.map((order: Order) => ({
        id: order.id,
        subaccountNumber: order.subaccountNumber,
        clientId: order.clientId,
        clobPairId: order.clobPairId,
        side: order.side,
        size: order.size,
        totalFilled: order.totalFilled,
        price: order.price,
        type: order.type,
        reduceOnly: order.reduceOnly,
        timeInForce: order.timeInForce,
        postOnly: order.postOnly,
        status: order.status,
        goodTilBlock: order.goodTilBlock,
        goodTilBlockTime: order.goodTilBlockTime,
        createdAtHeight: order.createdAtHeight,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        updatedAtHeight: order.updatedAtHeight,
        clientMetadata: order.clientMetadata,
        ticker: order.ticker,
      }));
    } catch (error) {
      console.error('Failed to fetch active orders:', error);
      throw new Error(`Failed to get active orders: ${error}`);
    }
  }

  /**
   * Get a specific order by ID
   * @param orderId Order ID
   * @returns Order or null if not found
   */
  async getOrderById(orderId: string): Promise<Order | null> {
    try {
      const response = await this.indexerClient.account.getOrder(orderId);
      if (!response) {
        return null;
      }

      return {
        id: response.id,
        subaccountNumber: response.subaccountNumber,
        clientId: response.clientId,
        clobPairId: response.clobPairId,
        side: response.side,
        size: response.size,
        totalFilled: response.totalFilled,
        price: response.price,
        type: response.type,
        reduceOnly: response.reduceOnly,
        timeInForce: response.timeInForce,
        postOnly: response.postOnly,
        status: response.status,
        goodTilBlock: response.goodTilBlock,
        goodTilBlockTime: response.goodTilBlockTime,
        createdAtHeight: response.createdAtHeight,
        createdAt: response.createdAt,
        updatedAt: response.updatedAt,
        updatedAtHeight: response.updatedAtHeight,
        clientMetadata: response.clientMetadata,
        ticker: response.ticker,
      };
    } catch (error) {
      console.error('Failed to fetch order:', error);
      throw new Error(`Failed to get order: ${error}`);
    }
  }
}
