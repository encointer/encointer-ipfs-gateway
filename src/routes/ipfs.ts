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

      try {
        // Collect all multipart files
        const parts = request.files();
        const formData = new FormData();
        let fileCount = 0;
        for await (const part of parts) {
          const chunks: Buffer[] = [];
          for await (const chunk of part.file) {
            chunks.push(chunk);
          }
          formData.append(
            'file',
            new Blob([Buffer.concat(chunks)], { type: part.mimetype }),
            part.filename || 'file'
          );
          fileCount++;
        }

        if (fileCount === 0) {
          metrics.inc(metrics.UPLOAD_FAILURE, { reason: 'no_file' });
          return reply.code(400).send({ error: 'No file provided' });
        }

        // Forward client query params (e.g. wrap-with-directory) to kubo
        const clientParams = request.query as Record<string, string>;
        const kuboParams = new URLSearchParams({ pin: 'true', ...clientParams });

        const ipfsResponse = await fetch(
          `${config.ipfs.apiUrl}/api/v0/add?${kuboParams.toString()}`,
          { method: 'POST', body: formData },
        );

        if (!ipfsResponse.ok) {
          const errorText = await ipfsResponse.text();
          fastify.log.error({ error: errorText }, 'IPFS upload failed');
          metrics.inc(metrics.UPLOAD_FAILURE, { reason: 'ipfs_error' });
          return reply.code(502).send({ error: 'IPFS upload failed' });
        }

        // Kubo returns NDJSON (one JSON object per line)
        const responseText = await ipfsResponse.text();
        const lines = responseText.split('\n').filter(l => l.trim());
        const results = lines.map(l => JSON.parse(l) as { Hash: string; Name: string; Size: string });

        const totalBytes = results.reduce((sum, r) => sum + parseInt(r.Size, 10), 0);
        metrics.inc(metrics.UPLOAD_SUCCESS, { communityId });
        metrics.inc(metrics.UPLOAD_BYTES, {}, totalBytes);

        const lastResult = results[results.length - 1];
        fastify.log.info({
          address,
          communityId,
          hash: lastResult.Hash,
          fileCount,
          totalBytes,
        }, 'File(s) uploaded to IPFS');

        if (results.length === 1) {
          // Single file — backwards-compatible JSON response
          return {
            Hash: results[0].Hash,
            Name: results[0].Name,
            Size: results[0].Size,
            remaining_uploads: rateLimit.remaining,
          };
        }

        // Multi-file / wrap-with-directory — NDJSON response
        reply.header('Content-Type', 'application/x-ndjson');
        const ndjson = results
          .map((r, i) => {
            const obj: Record<string, unknown> = { Hash: r.Hash, Name: r.Name, Size: r.Size };
            if (i === results.length - 1) obj.remaining_uploads = rateLimit.remaining;
            return JSON.stringify(obj);
          })
          .join('\n') + '\n';
        return reply.send(ndjson);
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
