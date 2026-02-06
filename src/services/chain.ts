import { ApiPromise, WsProvider } from '@polkadot/api';
import { BN } from '@polkadot/util';
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

export async function accountExists(address: string): Promise<boolean> {
  const chainApi = await getChainApi();
  const info = await chainApi.query.system.account(address);
  return !info.isEmpty && (info as any).data.free.gt(new BN(0));
}

export function isValidCommunityId(communityId: string): boolean {
  return /^[a-zA-Z0-9]{8,64}$/.test(communityId);
}
