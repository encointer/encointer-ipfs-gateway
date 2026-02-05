import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  generateNonce,
  storeNonce,
  validateAndConsumeNonce,
} from '../src/services/nonce';

describe('nonce service', () => {
  describe('generateNonce', () => {
    it('should generate 64-character hex string', () => {
      const nonce = generateNonce();
      expect(nonce).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should generate unique nonces', () => {
      const nonces = new Set<string>();
      for (let i = 0; i < 100; i++) {
        nonces.add(generateNonce());
      }
      expect(nonces.size).toBe(100);
    });
  });

  describe('validateAndConsumeNonce', () => {
    const address = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
    const communityId = 'sqm1v79dF6b';
    const timestamp = Date.now();

    beforeEach(() => {
      vi.useFakeTimers();
    });

    it('should validate correct nonce', () => {
      const nonce = generateNonce();
      storeNonce(nonce, address, communityId, timestamp);

      const result = validateAndConsumeNonce(nonce, address, communityId, timestamp);
      expect(result.valid).toBe(true);
    });

    it('should reject unknown nonce', () => {
      const result = validateAndConsumeNonce('unknown', address, communityId, timestamp);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid or expired nonce');
    });

    it('should reject nonce with wrong address', () => {
      const nonce = generateNonce();
      storeNonce(nonce, address, communityId, timestamp);

      const result = validateAndConsumeNonce(nonce, 'wrong-address', communityId, timestamp);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Address mismatch');
    });

    it('should reject nonce with wrong communityId', () => {
      const nonce = generateNonce();
      storeNonce(nonce, address, communityId, timestamp);

      const result = validateAndConsumeNonce(nonce, address, 'wrong-cid', timestamp);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Community ID mismatch');
    });

    it('should reject nonce with wrong timestamp', () => {
      const nonce = generateNonce();
      storeNonce(nonce, address, communityId, timestamp);

      const result = validateAndConsumeNonce(nonce, address, communityId, timestamp + 1);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Timestamp mismatch');
    });

    it('should consume nonce after use (single-use)', () => {
      const nonce = generateNonce();
      storeNonce(nonce, address, communityId, timestamp);

      const first = validateAndConsumeNonce(nonce, address, communityId, timestamp);
      expect(first.valid).toBe(true);

      const second = validateAndConsumeNonce(nonce, address, communityId, timestamp);
      expect(second.valid).toBe(false);
    });

    it('should reject expired nonce', () => {
      const nonce = generateNonce();
      storeNonce(nonce, address, communityId, timestamp);

      // Advance time past TTL (5 minutes = 300 seconds)
      vi.advanceTimersByTime(301 * 1000);

      const result = validateAndConsumeNonce(nonce, address, communityId, timestamp);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Nonce expired');
    });
  });
});
