.PHONY: help dev prod build test clean logs

# Use 'docker compose' (v2) instead of 'docker-compose' (v1)
COMPOSE := docker compose

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
	$(COMPOSE) -f docker-compose.dev.yml up --build

dev-down:
	$(COMPOSE) -f docker-compose.dev.yml down

# Production
prod:
	$(COMPOSE) up -d --build

prod-down:
	$(COMPOSE) down

# Build
build:
	npm run build

# Test
test:
	npm test

# Logs
logs:
	$(COMPOSE) logs -f gateway

logs-all:
	$(COMPOSE) logs -f

# Monitoring (optional)
monitoring:
	$(COMPOSE) --profile monitoring up -d --build

# Clean
clean:
	$(COMPOSE) -f docker-compose.dev.yml down -v 2>/dev/null || true
	$(COMPOSE) down -v 2>/dev/null || true
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
