import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { verifyJWT, requireScope } from '../middleware/jwt';
import { metrics } from '../services/metrics';
import { config } from '../config';

// Simple in-memory rate limiting
const uploadCounts = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(address: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const entry = uploadCounts.get(address);

  if (!entry || now > entry.resetAt) {
    uploadCounts.set(address, { count: 1, resetAt: now + dayMs });
    return { allowed: true, remaining: config.rateLimit.uploadsPerDay - 1 };
  }

  if (entry.count >= config.rateLimit.uploadsPerDay) {
    return { allowed: false, remaining: 0 };
  }

  entry.count++;
  return { allowed: true, remaining: config.rateLimit.uploadsPerDay - entry.count };
}

export async function ipfsRoutes(fastify: FastifyInstance): Promise<void> {
  // POST /add - Upload file to IPFS (mounted at /ipfs prefix)
  fastify.post(
    '/add',
    {
      preHandler: [verifyJWT, requireScope('ipfs:write')],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const payload = request.jwtPayload!;
      const address = payload.sub;
      const communityId = payload.cid;

      metrics.inc(metrics.UPLOAD_TOTAL, { communityId });

      // Check rate limit
      const rateLimit = checkRateLimit(address);
      if (!rateLimit.allowed) {
        metrics.inc(metrics.RATE_LIMIT_EXCEEDED, { communityId });
        fastify.log.warn({ address, communityId }, 'Upload rate limit exceeded');
        return reply.code(429).send({
          error: 'Rate limit exceeded',
          details: `Maximum ${config.rateLimit.uploadsPerDay} uploads per day`,
        });
      }

      // Get multipart file
      const data = await request.file();
      if (!data) {
        metrics.inc(metrics.UPLOAD_FAILURE, { reason: 'no_file' });
        return reply.code(400).send({ error: 'No file provided' });
      }

      try {
        // Collect file buffer
        const chunks: Buffer[] = [];
        for await (const chunk of data.file) {
          chunks.push(chunk);
        }
        const fileBuffer = Buffer.concat(chunks);

        // Create form data for IPFS using native FormData
        const formData = new FormData();
        formData.append(
          'file',
          new Blob([fileBuffer], { type: data.mimetype }),
          data.filename || 'file'
        );

        // Proxy to IPFS node using native fetch
        const ipfsResponse = await fetch(`${config.ipfs.apiUrl}/api/v0/add?pin=true`, {
          method: 'POST',
          body: formData,
        });

        if (!ipfsResponse.ok) {
          const errorText = await ipfsResponse.text();
          fastify.log.error({ error: errorText }, 'IPFS upload failed');
          metrics.inc(metrics.UPLOAD_FAILURE, { reason: 'ipfs_error' });
          return reply.code(502).send({ error: 'IPFS upload failed' });
        }

        const result = await ipfsResponse.json() as { Hash: string; Name: string; Size: string };

        metrics.inc(metrics.UPLOAD_SUCCESS, { communityId });
        metrics.inc(metrics.UPLOAD_BYTES, {}, parseInt(result.Size, 10));

        fastify.log.info({
          address,
          communityId,
          hash: result.Hash,
          size: result.Size,
          filename: data.filename,
        }, 'File uploaded to IPFS');

        return {
          Hash: result.Hash,
          Name: result.Name,
          Size: result.Size,
          remaining_uploads: rateLimit.remaining,
        };
      } catch (error) {
        fastify.log.error({ error }, 'IPFS proxy error');
        metrics.inc(metrics.UPLOAD_FAILURE, { reason: 'internal_error' });
        return reply.code(500).send({ error: 'Internal server error' });
      }
    }
  );

  // GET /cat/:cid - Retrieve file from IPFS (public, no auth required)
  fastify.get<{ Params: { cid: string } }>(
    '/cat/:cid',
    {
      schema: {
        params: {
          type: 'object',
          required: ['cid'],
          properties: {
            cid: { type: 'string', pattern: '^Qm[a-zA-Z0-9]{44}$|^bafy[a-zA-Z0-9]{50,}$' },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Params: { cid: string } }>, reply: FastifyReply) => {
      const { cid } = request.params;

      try {
        const ipfsResponse = await fetch(`${config.ipfs.apiUrl}/api/v0/cat?arg=${cid}`, {
          method: 'POST',
        });

        if (!ipfsResponse.ok) {
          return reply.code(404).send({ error: 'Content not found' });
        }

        const buffer = Buffer.from(await ipfsResponse.arrayBuffer());
        return reply.send(buffer);
      } catch (error) {
        fastify.log.error({ error }, 'IPFS cat error');
        return reply.code(500).send({ error: 'Internal server error' });
      }
    }
  );
}
