import { FastifyReply, FastifyRequest } from 'fastify';

export interface JWTPayload {
  sub: string; // address
  cid: string; // communityId
  scope: string; // 'ipfs:write'
}

declare module 'fastify' {
  interface FastifyRequest {
    jwtPayload?: JWTPayload;
  }
}

export async function verifyJWT(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const decoded = await request.jwtVerify<JWTPayload>();
    request.jwtPayload = decoded;
  } catch (err) {
    reply.code(401).send({ error: 'Invalid or expired token' });
  }
}

export function requireScope(scope: string) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.jwtPayload) {
      reply.code(401).send({ error: 'Authentication required' });
      return;
    }

    if (request.jwtPayload.scope !== scope) {
      reply.code(403).send({ error: 'Insufficient permissions' });
      return;
    }
  };
}
