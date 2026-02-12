import { ApiPromise, WsProvider } from '@polkadot/api';
import { options } from '@encointer/node-api';
import { communityIdentifierFromString } from '@encointer/util';
import { parseEncointerBalance } from '@encointer/types';
import { config } from '../config';

let api: ApiPromise | null = null;

export async function getChainApi(): Promise<ApiPromise> {
  if (api && api.isConnected) {
    return api;
  }

  const opts = options();
  const provider = new WsProvider(config.chain.rpcUrl);
  api = await ApiPromise.create({
    ...opts,
    provider,
    types: {
      ...opts.types,
      // On-chain BalanceType is FixedI128 { bits: i128 }, not plain i128
      BalanceType: { bits: 'i128' },
    },
  });
  return api;
}

export async function disconnectChain(): Promise<void> {
  if (api) {
    await api.disconnect();
    api = null;
  }
}

export function parseCommunityId(communityId: string, chainApi: ApiPromise): ReturnType<typeof communityIdentifierFromString> | null {
  try {
    return communityIdentifierFromString(chainApi.registry, communityId);
  } catch {
    return null;
  }
}

export async function isValidCommunityId(communityId: string): Promise<boolean> {
  const chainApi = await getChainApi();
  return parseCommunityId(communityId, chainApi) !== null;
}

export async function hasMinimumBalance(address: string, communityId: string): Promise<boolean> {
  const chainApi = await getChainApi();
  const cid = parseCommunityId(communityId, chainApi);
  if (!cid) return false;

  const balanceEntry = await (chainApi.query as any).encointerBalances.balance(cid, address);
  const principal = parseEncointerBalance(balanceEntry.principal.bits.toBn());
  return principal >= config.chain.minBalanceCC;
}
