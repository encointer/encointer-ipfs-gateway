import { ApiPromise, WsProvider } from '@polkadot/api';
import { base58Encode } from '@polkadot/util-crypto/base58';
import { config } from '../config';

// Encointer type and RPC definitions (from @encointer/types)
// The @encointer/* npm packages only ship TS source (no compiled JS),
// so we register the minimum needed definitions inline.
const encointerTypes = {
  GeoHash: '[u8; 5]',
  CidDigest: '[u8; 4]',
  CommunityIdentifier: { geohash: 'GeoHash', digest: 'CidDigest' },
  BalanceType: 'i128',
  BalanceEntry: { principal: 'BalanceType', lastUpdate: 'BlockNumber' },
};

const encointerRpc = {
  encointer: {
    getAllBalances: {
      description: 'Get all non-zero balances for account in all communities',
      params: [
        { name: 'account', type: 'AccountId', isOptional: false },
        { name: 'at', type: 'Hash', isOptional: true },
      ],
      type: 'Vec<(CommunityIdentifier, BalanceEntry)>',
    },
  },
};

let api: ApiPromise | null = null;

export async function getChainApi(): Promise<ApiPromise> {
  if (api && api.isConnected) {
    return api;
  }

  const provider = new WsProvider(config.chain.rpcUrl);
  api = await ApiPromise.create({ provider, types: encointerTypes, rpc: encointerRpc });
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

/** Convert CommunityIdentifier codec to the base58 string format used by Encointer CLI */
function cidToString(cid: any): string {
  const geohashBytes: Uint8Array = cid.geohash;
  const digestBytes: Uint8Array = cid.digest;
  const geohashStr = new TextDecoder().decode(geohashBytes);
  return geohashStr + base58Encode(digestBytes);
}

/** Convert I64F64 fixed-point balance to float */
function parseFixedBalance(principal: any): number {
  const raw = BigInt(principal.toString());
  return Number(raw) / 2 ** 64;
}

export async function getCCBalance(
  address: string,
  communityId: string
): Promise<CCBalance | null> {
  const chainApi = await getChainApi();

  try {
    const result = await (chainApi.rpc as any).encointer.getAllBalances(address);

    // Result is Vec<(CommunityIdentifier, BalanceEntry)>
    for (const entry of result) {
      const cid = entry[0];
      const balanceEntry = entry[1];
      if (cidToString(cid) === communityId) {
        return {
          principal: parseFixedBalance(balanceEntry.principal),
          lastUpdate: balanceEntry.lastUpdate.toNumber(),
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
