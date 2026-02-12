# Encointer IPFS Gateway

IPFS gateway with sr25519 challenge-response authentication for Encointer Bazaar.

## Features

- sr25519 signature verification via @polkadot/util-crypto
- CC (Community Currency) holder verification via Encointer RPC
- JWT-based session management
- Rate limiting (10 uploads/day per address)
- IPFS proxy for uploads

## Quick Start

```bash
# Install dependencies
npm install

# Copy and configure environment
cp .env.example .env

# Run in development
npm run dev

# Run tests
npm test

# Build for production
npm run build
npm start
```

## API

### POST /auth/challenge

Request authentication challenge.

```bash
curl -X POST http://localhost:5050/auth/challenge \
  -H 'Content-Type: application/json' \
  -d '{"address":"5GrwvaEF...", "communityId":"sqm1v79dF6b"}'
```

Response:
```json
{
  "nonce": "abc123...",
  "timestamp": 1704067200000,
  "message": "IPFS-AUTH:abc123...:1704067200000:sqm1v79dF6b"
}
```

### POST /auth/verify

Verify signature and get JWT.

```bash
curl -X POST http://localhost:5050/auth/verify \
  -H 'Content-Type: application/json' \
  -d '{
    "address": "5GrwvaEF...",
    "communityId": "sqm1v79dF6b",
    "signature": "0x...",
    "nonce": "abc123...",
    "timestamp": 1704067200000
  }'
```

Response:
```json
{
  "token": "eyJ...",
  "expires_at": 1704070800000
}
```

### POST /ipfs/add

Upload file to IPFS (requires JWT).

```bash
curl -X POST http://localhost:5050/ipfs/add \
  -H 'Authorization: Bearer <jwt>' \
  -F 'file=@image.png'
```

Response:
```json
{
  "Hash": "QmXyz...",
  "Name": "image.png",
  "Size": "12345",
  "remaining_uploads": 9
}
```

### GET /ipfs/cat/:cid

Retrieve file from IPFS (public).

```bash
curl http://localhost:5050/ipfs/cat/QmXyz...
```

## Deployment

### Development (no TLS)

```bash
make dev
# Or: docker-compose -f docker-compose.dev.yml up --build
```

Access at http://localhost:5050

### Production (with TLS)

1. Initialize Let's Encrypt certificates:
```bash
./scripts/init-letsencrypt.sh ipfs-auth.encointer.org admin@encointer.org
```

2. Create `.env` file:
```bash
JWT_SECRET=$(openssl rand -hex 32)
CHAIN_RPC_URL=wss://kusama.api.encointer.org
```

3. Start services:
```bash
make prod
# Or: docker-compose up -d --build
```

### With Monitoring (Prometheus + Grafana)

```bash
make monitoring
# Or: docker-compose --profile monitoring up -d --build
```

- Prometheus: http://localhost:9090
- Grafana: http://localhost:3000 (admin/admin)
- Metrics endpoint: http://localhost:5050/metrics

## Docker Hub

```bash
docker run -d -p 5050:5050 \
  -e JWT_SECRET=<secret> \
  -e IPFS_API_URL=http://<ipfs-host>:5001 \
  -e CHAIN_RPC_URL=wss://kusama.api.encointer.org \
  encointer/ipfs-gateway
```

## Docker (standalone)

```bash
docker build -t encointer-ipfs-gateway .
docker run -p 5050:5050 --env-file .env encointer-ipfs-gateway
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| PORT | 5050 | Server port |
| JWT_SECRET | - | JWT signing secret (required) |
| JWT_EXPIRES_IN | 1h | JWT expiration |
| IPFS_API_URL | http://localhost:5001 | IPFS node API |
| CHAIN_RPC_URL | wss://kusama.api.encointer.org | Encointer RPC |
| MIN_CC_BALANCE | 0.1 | Minimum CC to qualify |
| RATE_LIMIT_UPLOADS_PER_DAY | 10 | Max uploads per address |
| NONCE_TTL_SECONDS | 300 | Nonce expiration (5 min) |
