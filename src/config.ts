import 'dotenv/config';

export const config = {
  port: parseInt(process.env.PORT || '5050', 10),
  host: process.env.HOST || '0.0.0.0',

  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '1h',
  },

  ipfs: {
    apiUrl: process.env.IPFS_API_URL || 'http://localhost:5001',
  },

  chain: {
    rpcUrl: process.env.CHAIN_RPC_URL || 'wss://kusama.api.encointer.org',
    minBalanceCC: parseFloat(process.env.MIN_BALANCE_CC || '0.1'),
  },

  rateLimit: {
    uploadsPerDay: parseInt(process.env.RATE_LIMIT_UPLOADS_PER_DAY || '10', 10),
  },

  nonce: {
    ttlSeconds: parseInt(process.env.NONCE_TTL_SECONDS || '300', 10),
  },

};
