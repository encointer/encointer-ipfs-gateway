import { describe, it, expect, beforeAll, vi, afterAll } from 'vitest';
import { Keyring } from '@polkadot/keyring';
import { u8aToHex } from '@polkadot/util';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import { buildApp } from '../src/index';
import type { FastifyInstance } from 'fastify';

// Mock chain service
vi.mock('../src/services/chain', () => ({
  isCCHolder: vi.fn().mockResolvedValue(true),
  isValidCommunityId: vi.fn().mockReturnValue(true),
  getChainApi: vi.fn(),
  disconnectChain: vi.fn(),
}));

describe('auth routes', () => {
  let app: FastifyInstance;
  let keyring: Keyring;
  let alice: ReturnType<Keyring['addFromUri']>;

  beforeAll(async () => {
    await cryptoWaitReady();
    keyring = new Keyring({ type: 'sr25519' });
    alice = keyring.addFromUri('//Alice');
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /auth/challenge', () => {
    it('should return nonce and timestamp', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/challenge',
        payload: {
          address: alice.address,
          communityId: 'sqm1v79dF6b',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.nonce).toMatch(/^[a-f0-9]{64}$/);
      expect(body.timestamp).toBeTypeOf('number');
      expect(body.message).toContain('IPFS-AUTH:');
    });

    it('should reject invalid address', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/challenge',
        payload: {
          address: 'invalid',
          communityId: 'sqm1v79dF6b',
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /auth/verify', () => {
    it('should issue JWT for valid signature', async () => {
      // Get challenge
      const challengeRes = await app.inject({
        method: 'POST',
        url: '/auth/challenge',
        payload: {
          address: alice.address,
          communityId: 'sqm1v79dF6b',
        },
      });

      const { nonce, timestamp, message } = JSON.parse(challengeRes.body);

      // Sign message
      const signature = u8aToHex(alice.sign(message));

      // Verify
      const verifyRes = await app.inject({
        method: 'POST',
        url: '/auth/verify',
        payload: {
          address: alice.address,
          communityId: 'sqm1v79dF6b',
          signature,
          nonce,
          timestamp,
        },
      });

      expect(verifyRes.statusCode).toBe(200);
      const body = JSON.parse(verifyRes.body);
      expect(body.token).toBeDefined();
      expect(body.expires_at).toBeTypeOf('number');
    });

    it('should reject invalid signature', async () => {
      // Get challenge
      const challengeRes = await app.inject({
        method: 'POST',
        url: '/auth/challenge',
        payload: {
          address: alice.address,
          communityId: 'sqm1v79dF6b',
        },
      });

      const { nonce, timestamp } = JSON.parse(challengeRes.body);

      // Wrong signature
      const signature = '0x' + '00'.repeat(64);

      const verifyRes = await app.inject({
        method: 'POST',
        url: '/auth/verify',
        payload: {
          address: alice.address,
          communityId: 'sqm1v79dF6b',
          signature,
          nonce,
          timestamp,
        },
      });

      expect(verifyRes.statusCode).toBe(401);
    });

    it('should reject reused nonce', async () => {
      // Get challenge
      const challengeRes = await app.inject({
        method: 'POST',
        url: '/auth/challenge',
        payload: {
          address: alice.address,
          communityId: 'sqm1v79dF6b',
        },
      });

      const { nonce, timestamp, message } = JSON.parse(challengeRes.body);
      const signature = u8aToHex(alice.sign(message));

      // First verify succeeds
      await app.inject({
        method: 'POST',
        url: '/auth/verify',
        payload: {
          address: alice.address,
          communityId: 'sqm1v79dF6b',
          signature,
          nonce,
          timestamp,
        },
      });

      // Second verify fails (nonce consumed)
      const secondRes = await app.inject({
        method: 'POST',
        url: '/auth/verify',
        payload: {
          address: alice.address,
          communityId: 'sqm1v79dF6b',
          signature,
          nonce,
          timestamp,
        },
      });

      expect(secondRes.statusCode).toBe(401);
    });
  });
});
