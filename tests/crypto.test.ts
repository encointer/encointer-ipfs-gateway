import { describe, it, expect, beforeAll } from 'vitest';
import { Keyring } from '@polkadot/keyring';
import { u8aToHex } from '@polkadot/util';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import {
  verifySr25519Signature,
  isValidSS58Address,
  buildAuthMessage,
} from '../src/services/crypto';

describe('crypto service', () => {
  let keyring: Keyring;
  let alice: ReturnType<Keyring['addFromUri']>;

  beforeAll(async () => {
    await cryptoWaitReady();
    keyring = new Keyring({ type: 'sr25519' });
    alice = keyring.addFromUri('//Alice');
  });

  describe('verifySr25519Signature', () => {
    it('should verify valid signature', async () => {
      const message = 'test message';
      const signature = u8aToHex(alice.sign(message));
      const address = alice.address;

      const result = await verifySr25519Signature(message, signature, address);
      expect(result).toBe(true);
    });

    it('should reject invalid signature', async () => {
      const message = 'test message';
      const wrongMessage = 'wrong message';
      const signature = u8aToHex(alice.sign(wrongMessage));

      const result = await verifySr25519Signature(message, signature, alice.address);
      expect(result).toBe(false);
    });

    it('should reject signature from different address', async () => {
      const bob = keyring.addFromUri('//Bob');
      const message = 'test message';
      const signature = u8aToHex(alice.sign(message));

      const result = await verifySr25519Signature(message, signature, bob.address);
      expect(result).toBe(false);
    });

    it('should handle invalid address', async () => {
      const message = 'test message';
      const signature = u8aToHex(alice.sign(message));

      const result = await verifySr25519Signature(message, signature, 'invalid');
      expect(result).toBe(false);
    });
  });

  describe('isValidSS58Address', () => {
    it('should accept valid SS58 address', () => {
      expect(isValidSS58Address(alice.address)).toBe(true);
    });

    it('should reject invalid address', () => {
      expect(isValidSS58Address('invalid')).toBe(false);
      expect(isValidSS58Address('')).toBe(false);
      expect(isValidSS58Address('0x123')).toBe(false);
    });
  });

  describe('buildAuthMessage', () => {
    it('should build correct message format', () => {
      const nonce = 'abc123';
      const timestamp = 1704067200000;
      const communityId = 'sqm1v79dF6b';

      const message = buildAuthMessage(nonce, timestamp, communityId);
      expect(message).toBe('IPFS-AUTH:abc123:1704067200000:sqm1v79dF6b');
    });
  });
});
