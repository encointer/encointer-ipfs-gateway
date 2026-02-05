import { randomBytes } from 'crypto';
import { config } from '../config';

interface NonceEntry {
  address: string;
  communityId: string;
  timestamp: number;
  expiresAt: number;
}

const nonceStore = new Map<string, NonceEntry>();

export function generateNonce(): string {
  return randomBytes(32).toString('hex');
}

export function storeNonce(
  nonce: string,
  address: string,
  communityId: string,
  timestamp: number
): void {
  const expiresAt = Date.now() + config.nonce.ttlSeconds * 1000;
  nonceStore.set(nonce, { address, communityId, timestamp, expiresAt });
}

export function validateAndConsumeNonce(
  nonce: string,
  address: string,
  communityId: string,
  timestamp: number
): { valid: boolean; error?: string } {
  const entry = nonceStore.get(nonce);

  if (!entry) {
    return { valid: false, error: 'Invalid or expired nonce' };
  }

  if (Date.now() > entry.expiresAt) {
    nonceStore.delete(nonce);
    return { valid: false, error: 'Nonce expired' };
  }

  if (entry.address !== address) {
    return { valid: false, error: 'Address mismatch' };
  }

  if (entry.communityId !== communityId) {
    return { valid: false, error: 'Community ID mismatch' };
  }

  if (entry.timestamp !== timestamp) {
    return { valid: false, error: 'Timestamp mismatch' };
  }

  // Single-use: delete after validation
  nonceStore.delete(nonce);
  return { valid: true };
}

export function cleanupExpiredNonces(): void {
  const now = Date.now();
  for (const [nonce, entry] of nonceStore.entries()) {
    if (now > entry.expiresAt) {
      nonceStore.delete(nonce);
    }
  }
}

// Run cleanup every minute
setInterval(cleanupExpiredNonces, 60000);
