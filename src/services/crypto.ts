import { cryptoWaitReady, decodeAddress, signatureVerify } from '@polkadot/util-crypto';
import { u8aToHex, hexToU8a, isHex } from '@polkadot/util';

let cryptoReady = false;

export async function ensureCryptoReady(): Promise<void> {
  if (!cryptoReady) {
    await cryptoWaitReady();
    cryptoReady = true;
  }
}

export async function verifySr25519Signature(
  message: string,
  signature: string,
  address: string
): Promise<boolean> {
  await ensureCryptoReady();

  try {
    const publicKey = decodeAddress(address);
    const sigBytes = isHex(signature) ? hexToU8a(signature) : signature;
    const result = signatureVerify(message, sigBytes, u8aToHex(publicKey));
    return result.isValid;
  } catch {
    return false;
  }
}

export function isValidSS58Address(address: string): boolean {
  try {
    decodeAddress(address);
    return true;
  } catch {
    return false;
  }
}

export function buildAuthMessage(nonce: string, timestamp: number, communityId: string): string {
  return `IPFS-AUTH:${nonce}:${timestamp}:${communityId}`;
}
