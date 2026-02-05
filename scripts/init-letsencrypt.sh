#!/bin/bash
# Initialize Let's Encrypt certificates for the IPFS Auth Gateway
# Run this ONCE before starting production deployment

set -e

DOMAIN="${1:-ipfs-auth.encointer.org}"
EMAIL="${2:-admin@encointer.org}"
STAGING="${3:-0}"  # Set to 1 for testing with Let's Encrypt staging server

echo "Initializing Let's Encrypt for domain: $DOMAIN"

# Create required directories
sudo mkdir -p /etc/letsencrypt
sudo mkdir -p /var/www/certbot

# Create temporary nginx config for certificate challenge
cat > /tmp/nginx-certbot.conf << 'EOF'
events {
    worker_connections 1024;
}
http {
    server {
        listen 80;
        server_name _;
        location /.well-known/acme-challenge/ {
            root /var/www/certbot;
        }
        location / {
            return 200 'Certbot challenge server';
        }
    }
}
EOF

# Start temporary nginx
docker run -d --name nginx-certbot \
    -p 80:80 \
    -v /tmp/nginx-certbot.conf:/etc/nginx/nginx.conf:ro \
    -v /var/www/certbot:/var/www/certbot \
    nginx:alpine

# Wait for nginx to start
sleep 2

# Request certificate
STAGING_FLAG=""
if [ "$STAGING" = "1" ]; then
    STAGING_FLAG="--staging"
    echo "Using Let's Encrypt staging server (for testing)"
fi

docker run --rm \
    -v /etc/letsencrypt:/etc/letsencrypt \
    -v /var/www/certbot:/var/www/certbot \
    certbot/certbot certonly \
    --webroot \
    --webroot-path=/var/www/certbot \
    --email "$EMAIL" \
    --agree-tos \
    --no-eff-email \
    $STAGING_FLAG \
    -d "$DOMAIN"

# Stop and remove temporary nginx
docker stop nginx-certbot
docker rm nginx-certbot

echo "Certificate obtained successfully!"
echo "You can now start the production deployment with: docker-compose up -d"
