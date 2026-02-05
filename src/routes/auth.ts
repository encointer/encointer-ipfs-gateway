import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { generateNonce, storeNonce, validateAndConsumeNonce } from '../services/nonce';
import { verifySr25519Signature, isValidSS58Address, buildAuthMessage } from '../services/crypto';
import { isCCHolder, isValidCommunityId } from '../services/chain';
import { metrics } from '../services/metrics';
import { config } from '../config';

interface ChallengeBody {
  address: string;
  communityId: string;
}

interface VerifyBody {
  address: string;
  communityId: string;
  signature: string;
  nonce: string;
  timestamp: number;
}

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  // POST /challenge (mounted at /auth prefix)
  fastify.post<{ Body: ChallengeBody }>(
    '/challenge',
    {
      schema: {
        body: {
          type: 'object',
          required: ['address', 'communityId'],
          properties: {
            address: { type: 'string' },
            communityId: { type: 'string' },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Body: ChallengeBody }>, reply: FastifyReply) => {
      const { address, communityId } = request.body;
      metrics.inc(metrics.AUTH_CHALLENGE_TOTAL, { communityId });

      if (!isValidSS58Address(address)) {
        return reply.code(400).send({ error: 'Invalid SS58 address' });
      }

      if (!isValidCommunityId(communityId)) {
        return reply.code(400).send({ error: 'Invalid community ID' });
      }

      const nonce = generateNonce();
      const timestamp = Date.now();

      storeNonce(nonce, address, communityId, timestamp);

      fastify.log.info({ address, communityId }, 'Challenge issued');

      return {
        nonce,
        timestamp,
        message: buildAuthMessage(nonce, timestamp, communityId),
      };
    }
  );

  // POST /verify (mounted at /auth prefix)
  fastify.post<{ Body: VerifyBody }>(
    '/verify',
    {
      schema: {
        body: {
          type: 'object',
          required: ['address', 'communityId', 'signature', 'nonce', 'timestamp'],
          properties: {
            address: { type: 'string' },
            communityId: { type: 'string' },
            signature: { type: 'string' },
            nonce: { type: 'string' },
            timestamp: { type: 'number' },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Body: VerifyBody }>, reply: FastifyReply) => {
      const { address, communityId, signature, nonce, timestamp } = request.body;
      metrics.inc(metrics.AUTH_VERIFY_TOTAL, { communityId });

      if (!isValidSS58Address(address)) {
        metrics.inc(metrics.AUTH_VERIFY_FAILURE, { reason: 'invalid_address' });
        return reply.code(400).send({ error: 'Invalid SS58 address' });
      }

      if (!isValidCommunityId(communityId)) {
        metrics.inc(metrics.AUTH_VERIFY_FAILURE, { reason: 'invalid_community' });
        return reply.code(400).send({ error: 'Invalid community ID' });
      }

      // Validate nonce
      const nonceResult = validateAndConsumeNonce(nonce, address, communityId, timestamp);
      if (!nonceResult.valid) {
        metrics.inc(metrics.AUTH_VERIFY_FAILURE, { reason: 'invalid_nonce' });
        fastify.log.warn({ address, communityId, error: nonceResult.error }, 'Verify failed: invalid nonce');
        return reply.code(401).send({ error: nonceResult.error });
      }

      // Verify signature
      const message = buildAuthMessage(nonce, timestamp, communityId);
      const validSignature = await verifySr25519Signature(message, signature, address);
      if (!validSignature) {
        metrics.inc(metrics.AUTH_VERIFY_FAILURE, { reason: 'invalid_signature' });
        fastify.log.warn({ address, communityId }, 'Verify failed: invalid signature');
        return reply.code(401).send({ error: 'Invalid signature' });
      }

      // Check CC holder status
      metrics.inc(metrics.CC_HOLDER_CHECK_TOTAL, { communityId });
      const isHolder = await isCCHolder(address, communityId);
      if (!isHolder) {
        metrics.inc(metrics.CC_HOLDER_CHECK_FAILED, { communityId });
        metrics.inc(metrics.AUTH_VERIFY_FAILURE, { reason: 'not_cc_holder' });
        fastify.log.warn({ address, communityId }, 'Verify failed: not a CC holder');
        return reply.code(403).send({
          error: 'Not a CC holder',
          details: `Minimum balance of ${config.minCCBalance} CC required`,
        });
      }
      metrics.inc(metrics.CC_HOLDER_CHECK_PASSED, { communityId });

      // Issue JWT
      const token = fastify.jwt.sign(
        {
          sub: address,
          cid: communityId,
          scope: 'ipfs:write',
        },
        { expiresIn: config.jwt.expiresIn }
      );

      const expiresIn = config.jwt.expiresIn;
      const expiresInMs = parseExpiresIn(expiresIn);

      metrics.inc(metrics.AUTH_VERIFY_SUCCESS, { communityId });
      fastify.log.info({ address, communityId }, 'Authentication successful');

      return {
        token,
        expires_at: Date.now() + expiresInMs,
      };
    }
  );
}

function parseExpiresIn(expiresIn: string): number {
  const match = expiresIn.match(/^(\d+)([smhd])$/);
  if (!match) return 3600000; // default 1h

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case 's': return value * 1000;
    case 'm': return value * 60 * 1000;
    case 'h': return value * 60 * 60 * 1000;
    case 'd': return value * 24 * 60 * 60 * 1000;
    default: return 3600000;
  }
}
