import { ApiPromise, WsProvider } from '@polkadot/api';
import { options as encointerOptions } from '@encointer/node-api';
import { communityIdentifierToString, parseI64F64 } from '@encointer/util';
import { config } from '../config';

let api: ApiPromise | null = null;

export async function getChainApi(): Promise<ApiPromise> {
  if (api && api.isConnected) {
    return api;
  }

  const provider = new WsProvider(config.chain.rpcUrl);
  api = await ApiPromise.create({
    provider,
    ...encointerOptions(),
  });
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

  const result = await (chainApi.rpc as any).encointer.getAllBalances(address);

  for (const entry of result) {
    const cid = entry[0];
    const balanceEntry = entry[1];
    const cidStr = communityIdentifierToString(cid);
    if (cidStr === communityId) {
      return {
        principal: parseI64F64(balanceEntry.principal),
        lastUpdate: balanceEntry.lastUpdate.toNumber(),
      };
    }
  }

  return null;
}

export async function isCCHolder(
  address: string,
  communityId: string
): Promise<boolean> {
  const balance = await getCCBalance(address, communityId);
  if (!balance) {
    console.log(`CC balance check: no balance found for ${address} in ${communityId}`);
    return false;
  }
  console.log(`CC balance check: ${address} has ${balance.principal} in ${communityId} (min: ${config.minCCBalance})`);
  return balance.principal >= config.minCCBalance;
}

export function isValidCommunityId(communityId: string): boolean {
  return /^[a-zA-Z0-9]{8,64}$/.test(communityId);
}
