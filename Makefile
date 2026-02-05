.PHONY: help dev prod build test clean logs

help:
	@echo "IPFS Auth Gateway - Available commands:"
	@echo ""
	@echo "  make dev          - Start development environment (no TLS)"
	@echo "  make prod         - Start production environment (with TLS)"
	@echo "  make build        - Build TypeScript"
	@echo "  make test         - Run tests"
	@echo "  make logs         - View gateway logs"
	@echo "  make clean        - Stop all containers and clean up"
	@echo "  make init-certs   - Initialize Let's Encrypt certificates"
	@echo "  make monitoring   - Start with Prometheus/Grafana"

# Development
dev:
	docker-compose -f docker-compose.dev.yml up --build

dev-down:
	docker-compose -f docker-compose.dev.yml down

# Production
prod:
	docker-compose up -d --build

prod-down:
	docker-compose down

# Build
build:
	npm run build

# Test
test:
	npm test

# Logs
logs:
	docker-compose logs -f gateway

logs-all:
	docker-compose logs -f

# Monitoring (optional)
monitoring:
	docker-compose --profile monitoring up -d --build

# Clean
clean:
	docker-compose -f docker-compose.dev.yml down -v 2>/dev/null || true
	docker-compose down -v 2>/dev/null || true
	rm -rf dist node_modules

# Initialize Let's Encrypt certificates
init-certs:
	@echo "Usage: ./scripts/init-letsencrypt.sh <domain> <email> [staging=0|1]"
	@echo "Example: ./scripts/init-letsencrypt.sh ipfs-auth.encointer.org admin@encointer.org"

# Local development without Docker
local:
	npm run dev

# Install dependencies
install:
	npm install
