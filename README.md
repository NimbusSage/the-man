# The MAN (The Monitoring of All Networks)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen)](https://nodejs.org/)

A free, open-source network monitoring platform, written in plain JavaScript.

## Why this exists

MikroTik built The Dude, a lot of network engineers came to depend on it, and then MikroTik quietly let it die. 7.23.1 was the last release before it was declared end-of-life, and no replacement ships from MikroTik itself. If you're one of the people who kept a Dude server running past its expiration date because nothing else quite fit the job, this project is for you.

The Dude grew up. It's still free. It's still built by network engineers, for network engineers, and it still imports your existing Dude database instead of making you start your topology from scratch.

## What it does

- **Network discovery** - scan CIDR ranges over ICMP, SNMP, and the RouterOS API.
- **Monitoring** - per-service polling with configurable intervals, WebSocket push for live status.
- **Topology maps** - D3-based device maps with submaps for hierarchical networks (datacenter to rack to device).
- **Alerting** - threshold rules with email notifications, and suppression so a downed switch doesn't page you for every device behind it.
- **Dude migration** - upload your existing Dude `.db` file and it imports devices, services, maps, links, notes, outage history, and graph data directly into Postgres.
- **RBAC and audit logging** - admin/editor/viewer roles, JWT auth, and a log of who changed what.
- **Plugin pollers** - write a custom check in plain JavaScript, no build step.

Some of this (SNMP/RouterOS discovery in particular) is still catching up to the vision. See the roadmap below for what's actually wired up today versus what's next.

## Importing from Dude

This is the part we built most recently, so it gets its own section.

Dude stores almost everything as opaque binary blobs in a generic SQLite table. There's no public spec for the format, and MikroTik doesn't offer an API or CLI to get the data out any other way. We reverse-engineered it (building on prior work from the community, see Acknowledgments) and wrote a parser for it in plain JavaScript, plus a full transform into our own schema: devices, services, maps (with submap hierarchy), links, notes, outage history, and graph data at all four of Dude's retention resolutions.

We tested it against a real, years-old production Dude 7.23.1 database: 500MB, roughly 185,000 objects, 25,000+ devices, 19 million graph samples. It came back clean. Some links and older graph samples don't resolve, because the source database itself has dangling references to devices that were deleted years ago. That's a property of the data, not a bug in the importer; it logs and skips those cases rather than guessing.

To use it: log in, click "Import from Dude," and pick your `.db` file (gzipped exports work too). The import runs as a background job and the UI polls for status, since a database that size takes a few minutes to process.

## Quick start

You'll need(example commands for debian based linux):

1. Node 20+ `curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.5/install.sh | bash` + `nvm list available && nvm install <version>`
2. pnpm 8+ `curl -fsSL https://get.pnpm.io/install.sh | sh -`
3. Docker (for Postgres and Redis) `sudo apt install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin`

```bash
git clone https://github.com/NimbusSage/the-man.git
cd the-man
pnpm install

# Copy to customize exposed host ports (e.g. if 3000 is already in use)
cp .env.example .env

docker compose up -d

cd packages/backend
cp .env.example .env
pnpm db:migrate
pnpm db:seed  # creates an admin/admin user

cd ../..
pnpm dev  # starts backend + frontend
```

Open `http://localhost:5173` (or the port set via `HOST_WEB_PORT` in `.env`) and log in with `admin` / `admin`.

## Architecture

```
Client:       React (Vite) web app, Tauri desktop, mobile PWA
                    |  WebSocket + REST
Application:  Fastify API, Socket.io, JWT auth
                    |  Discovery / Monitoring / Alerting services
Data:         PostgreSQL, Redis
Polling:      ICMP / SNMP / HTTP / SSH / RouterOS pollers
```

## Plugin development

Custom pollers are plain JavaScript classes:

```javascript
// plugins/custom-http-poller/index.js

export class CustomHTTPPoller {
  async poll(device, service) {
    const response = await fetch(`https://${device.ip}/api/status`);
    const data = await response.json();

    return {
      success: response.ok,
      status: response.ok ? 'ok' : 'critical',
      timestamp: new Date(),
      metrics: [
        { name: 'response_time', value: data.latency, unit: 'ms' },
        { name: 'active_users', value: data.users, unit: 'count' },
      ],
    };
  }

  validateConfig(config) {
    return Boolean(config.endpoint && config.method);
  }

  getDefaultConfig() {
    return { endpoint: '/api/status', method: 'GET', timeout: 5000 };
  }
}
```

## Deployment

See [DEPLOY.md](DEPLOY.md) for production deployment — Docker Compose, SSL, backups, scaling, and security hardening.

## Contributing

Pull requests welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for the full workflow: development setup, coding standards, branch naming, commit conventions, and the PR process.

## Roadmap

### v0.1.0 (current)

- [X]  Network discovery (ICMP, SNMP, RouterOS)
- [X]  Ping monitoring with metrics
- [X]  D3 interactive maps
- [X]  WebSocket real-time updates
- [X]  PostgreSQL storage (TimescaleDB extension enabled, hypertables not yet wired up)
- [X]  Basic alerting (email)
- [X]  Dude database import (file upload, full device/service/map/link/note/history import)

### v0.5.0 (beta)

- [ ]  Full SNMP poller (ifTable, custom OIDs)
- [ ]  SSH/Telnet console proxy
- [ ]  Advanced alerting (escalations, schedules)
- [ ]  Multi-user RBAC
- [ ]  Plugin marketplace
- [ ]  Mobile app (PWA)

### v1.0.0

- [ ]  10,000+ device validation
- [ ]  Layer 2 topology (CDP/LLDP)
- [ ]  NetFlow/sFlow integration
- [ ]  Live Dude import over SSH/RouterOS API (today it's file-upload only)
- [ ]  Comprehensive docs

### Later

- [ ]  Multi-site federation
- [ ]  Custom dashboards
- [ ]  LDAP/SAML SSO

## License

MIT. Free forever, no catch, no tier that unlocks the features you actually need.

## Support

- **Issues and questions:** [GitHub Issues](https://github.com/NimbusSage/the-man/issues)
- **Discussion:** [GitHub Discussions](https://github.com/NimbusSage/the-man/discussions)

## Acknowledgments

- MikroTik, for building The Dude in the first place, and for eventually giving us a reason to build its replacement.
- [TheDudeToHuman](https://github.com/german77/TheDudeToHuman), whose reverse-engineering of Dude's object format saved us a lot of time when we built our own importer.
- Everyone still running a Dude server past its expiration date. We see you.

---

`node src/server.js`, and you're monitoring.
