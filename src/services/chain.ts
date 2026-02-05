import { ApiPromise, WsProvider } from '@polkadot/api';
import { config } from '../config';

let api: ApiPromise | null = null;

export async function getChainApi(): Promise<ApiPromise> {
  if (api && api.isConnected) {
    return api;
  }

  const provider = new WsProvider(config.chain.rpcUrl);
  api = await ApiPromise.create({ provider });
  return api;
}

export async function disconnectChain(): Promise<void> {
  if (api) {
    await api.disconnect();
    api = null;
  }
}

export interface CCBalance {
  principal: number;
  lastUpdate: number;
}

export async function getCCBalance(
  address: string,
  communityId: string
): Promise<CCBalance | null> {
  const chainApi = await getChainApi();

  try {
    // Call encointer_getAllBalances RPC
    const result = await (chainApi.rpc as any).encointer.getAllBalances(address);

    // Result is a map of communityId -> BalanceEntry
    const balances = result.toJSON() as Record<string, any>;

    for (const [cid, entry] of Object.entries(balances)) {
      if (cid === communityId || cid.toLowerCase() === communityId.toLowerCase()) {
        return {
          principal: parseFloat(entry.principal) || 0,
          lastUpdate: parseInt(entry.lastUpdate) || 0,
        };
      }
    }

    return null;
  } catch (error) {
    console.error('Failed to fetch CC balance:', error);
    return null;
  }
}

export async function isCCHolder(
  address: string,
  communityId: string
): Promise<boolean> {
  const balance = await getCCBalance(address, communityId);
  if (!balance) {
    return false;
  }
  return balance.principal >= config.minCCBalance;
}

export function isValidCommunityId(communityId: string): boolean {
  // Encointer community IDs are base58-encoded hashes
  // Basic validation: non-empty, alphanumeric, reasonable length
  return /^[a-zA-Z0-9]{8,64}$/.test(communityId);
}
