import Fastify from 'fastify';
import fastifyJwt from '@fastify/jwt';
import fastifyMultipart from '@fastify/multipart';
import fastifyCors from '@fastify/cors';
import { config } from './config';
import { authRoutes } from './routes/auth';
import { ipfsRoutes } from './routes/ipfs';
import { ensureCryptoReady } from './services/crypto';
import { getChainApi, disconnectChain } from './services/chain';
import { metrics } from './services/metrics';

async function buildApp() {
  const fastify = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
    },
  });

  // Register plugins
  await fastify.register(fastifyCors, {
    origin: true,
    methods: ['GET', 'POST'],
  });

  await fastify.register(fastifyJwt, {
    secret: config.jwt.secret,
  });

  await fastify.register(fastifyMultipart, {
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB max
    },
  });

  // Health check
  fastify.get('/health', async () => ({ status: 'ok' }));

  // Prometheus metrics endpoint
  fastify.get('/metrics', async (request, reply) => {
    reply.header('Content-Type', 'text/plain; version=0.0.4');
    return metrics.expose();
  });

  // Register routes
  await fastify.register(authRoutes, { prefix: '/auth' });
  await fastify.register(ipfsRoutes, { prefix: '/ipfs' });

  return fastify;
}

async function main() {
  // Initialize crypto
  console.log('Initializing crypto...');
  await ensureCryptoReady();

  // Connect to chain (lazy, will connect on first request)
  console.log(`Chain RPC: ${config.chain.rpcUrl}`);

  // Build and start server
  const app = await buildApp();

  // Graceful shutdown
  const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
  for (const signal of signals) {
    process.on(signal, async () => {
      console.log(`\nReceived ${signal}, shutting down...`);
      await app.close();
      await disconnectChain();
      process.exit(0);
    });
  }

  try {
    await app.listen({ port: config.port, host: config.host });
    console.log(`Server listening on http://${config.host}:${config.port}`);
    console.log(`IPFS API: ${config.ipfs.apiUrl}`);
    console.log(`Min CC balance: ${config.minCCBalance}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

// Export for testing
export { buildApp };

// Run if main module
main();
