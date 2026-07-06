# Deploying The MAN to Production

This guide covers deploying the-man for real-world use: Docker-based, with PostgreSQL, Redis, and optionally Prometheus/Grafana.

## Prerequisites

- A Linux server (Ubuntu/Debian recommended) with Docker and Docker Compose
- At least 2 GB RAM (4 GB+ recommended if monitoring 1,000+ devices)
- A domain name (if exposing the web UI publicly)
- Firewall rules allowing HTTP/HTTPS (80, 443) and optionally SSH

## Quick Start

```bash
git clone https://github.com/NimbusSage/the-man.git
cd the-man

# Create production environment file
cp .env.example .env
# EDIT .env — set strong secrets (see below)

docker compose -f docker-compose.prod.yml up -d

# Run database migrations
docker compose -f docker-compose.prod.yml exec backend pnpm db:migrate

# Seed admin user (if first deployment)
docker compose -f docker-compose.prod.yml exec backend pnpm db:seed
```

The web UI is served on port 5173 (or whatever `HOST_WEB_PORT` is set to).

## Environment Configuration

Create a `.env` file in the project root. At minimum:

```bash
# --- Secrets (generate these) ---
#   openssl rand -base64 48
JWT_SECRET=paste-the-generated-secret-here

#   openssl rand -base64 24
POSTGRES_PASSWORD=paste-a-strong-password-here

# --- CORS ---
# Set to "true" to reflect any origin (works for private IPs, dev, and domains).
# For strict production, set to your exact origin:
#   CORS_ORIGINS=https://monitor.your-company.com
CORS_ORIGINS=true

# --- Domain (optional — only needed if frontend talks to a separate backend
#     origin). Leave empty for standard nginx-proxied deployments.
# VITE_API_URL=https://monitor.your-company.com

# --- Ports (optional overrides) ---
# HOST_POSTGRES_PORT=5432
# HOST_REDIS_PORT=6379
# HOST_BACKEND_PORT=3000
# HOST_WEB_PORT=5173
```

> **Security:** Never use the default dev passwords. Generate secrets with `openssl rand -base64 48` and keep your `.env` file out of version control (it's already in `.gitignore`).

## Database

Migrations and seeding are run via Docker exec:

```bash
# Run pending migrations
docker compose -f docker-compose.prod.yml exec backend pnpm db:migrate

# Seed the admin user (idempotent — safe to re-run)
docker compose -f docker-compose.prod.yml exec backend pnpm db:seed
```

The admin credentials default to `admin` / `admin`. Change the password immediately after first login.

## Reverse Proxy & SSL

The web service in `docker-compose.prod.yml` serves HTTP on port 5173. You should terminate TLS at a reverse proxy.

### Option A: Caddy (recommended — automatic HTTPS)

```caddy
monitor.your-company.com {
    reverse_proxy theman-web:80
}
```

```bash
docker run -d --name caddy \
  -p 80:80 -p 443:443 \
  -v caddy_data:/data \
  -v $PWD/Caddyfile:/etc/caddy/Caddyfile \
  --network theman-network \
  caddy:2
```

### Option B: Traefik

Add Traefik labels to the `web` service in `docker-compose.prod.yml`.

### Option C: nginx + certbot

```nginx
server {
    listen 443 ssl http2;
    server_name monitor.your-company.com;

    ssl_certificate     /etc/letsencrypt/live/monitor.your-company.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/monitor.your-company.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:80;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 80;
    server_name monitor.your-company.com;
    return 301 https://$host$request_uri;
}
```

## Scaling Workers

Polling runs in BullMQ workers. Scale them by adjusting the `worker` service:

```bash
# Set desired replicas in .env
WORKER_REPLICAS=5

# Or override at deploy time:
docker compose -f docker-compose.prod.yml up -d --scale worker=8
```

Monitor queue depth via Redis or add the optional Prometheus/Grafana stack (see monitoring profile in `docker-compose.yml`).

## Health Checks

Each service has a Docker healthcheck defined. Verify overall status:

```bash
docker compose -f docker-compose.prod.yml ps
```

The backend exposes a health endpoint at `/health`. Monitor it externally (e.g., UptimeRobot, Better Uptime) to alert you if the-man itself goes down.

## Backups

### PostgreSQL

```bash
# Manual backup
docker exec theman-postgres pg_dump -U theman theman > theman-backup-$(date +%F).sql

# Restore
cat theman-backup-2025-01-01.sql | docker exec -i theman-postgres psql -U theman theman
```

### Redis

```bash
# Trigger RDB save
docker exec theman-redis redis-cli SAVE

# The AOF / RDB files are in the theman_redis_data volume
```

### Automate with cron

```bash
0 2 * * * /usr/local/bin/theman-backup.sh
```

## Updating

```bash
cd /opt/the-man

git pull

# Rebuild and restart
docker compose -f docker-compose.prod.yml up -d --build

# Apply any new migrations
docker compose -f docker-compose.prod.yml exec backend pnpm db:migrate
```

This creates new containers without downtime (depending on image build time). For truly zero-downtime updates, use a rolling deploy strategy via Docker Swarm or Kubernetes.

## Monitoring the Deployment Itself

Enable the optional monitoring stack from the dev compose file alongside production:

```bash
docker compose -f docker-compose.prod.yml -f docker-compose.yml up -d prometheus grafana
```

Or add `--profile monitoring` to the deploy command.

## Security Checklist

- [ ] `JWT_SECRET` is a random 64+ character string generated with `openssl rand -base64 48`
- [ ] `POSTGRES_PASSWORD` is strong and unique
- [ ] PostgreSQL and Redis ports are bound to `127.0.0.1` only (default in prod compose)
- [ ] The web UI is behind HTTPS
- [ ] CORS_ORIGINS is set to your actual domain (not `true`) for strict production
- [ ] Default admin password was changed on first login
- [ ] The server's firewall blocks all ports except 80, 443, and SSH
- [ ] Audit logging is enabled and logs are shipped off-host
