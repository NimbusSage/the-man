# Contributing to The MAN

Thanks for considering a contribution. This document covers the workflow, conventions, and standards we follow.

## Code of Conduct

This project is governed by the [Contributor Covenant](https://www.contributor-covenant.org/). By participating, you agree to uphold this code. Report unacceptable behavior to the project maintainers.

## Development Setup

**Prerequisites:**

- Node.js 20+ (recommend [nvm](https://github.com/nvm-sh/nvm))
- pnpm 8+ (`curl -fsSL https://get.pnpm.io/install.sh | sh -`)
- Docker (for Postgres and Redis)

**Steps:**

```bash
git clone https://github.com/NimbusSage/the-man.git
cd the-man
pnpm install

cp .env.example .env
docker compose up -d

cd packages/backend
cp .env.example .env
pnpm db:migrate
pnpm db:seed    # creates admin/admin
cd ../..

pnpm dev        # starts backend (port 3000) + frontend (port 5173)
```

Open http://localhost:5173 and log in with `admin` / `admin`.

## Project Structure

```
the-man/
├── apps/
│   ├── web/           # React (Vite) frontend
│   └── desktop/       # Tauri desktop app (placeholder)
├── packages/
│   ├── backend/       # Fastify API, Prisma, BullMQ workers
│   ├── cli/           # CLI tool
│   └── shared/        # Shared constants, validators, types
├── docker/
│   ├── Dockerfile.backend
│   ├── Dockerfile.web
│   ├── Dockerfile.web.prod
│   └── nginx/         # Production nginx config
├── docker-compose.yml       # Dev environment
├── docker-compose.prod.yml  # Production deployment
├── CONTRIBUTING.md
├── DEPLOY.md
└── README.md
```

## Coding Standards

- **Plain JavaScript** — no TypeScript. The project is intentionally kept JS-only to avoid a build step for core logic.
- **ESLint** — run `pnpm lint` before committing. The config enforces consistency.
- **ES Modules** — all code uses `import`/`export` (`"type": "module"` in package.json).
- **Naming:**
  - Files: `kebab-case.js` for utilities, `PascalCase.js` for classes/components
  - Variables/functions: `camelCase`
  - Classes: `PascalCase`
- **No `any`** — when you don't know the type, use `unknown` and narrow it.
- **Comments** — prefer self-documenting code over comments. If you must comment, explain *why*, not *what*.
- **Async** — use async/await over raw promises.

## Branch Naming

| Prefix     | Purpose                          |
|------------|----------------------------------|
| `feature/` | New functionality                |
| `fix/`     | Bug fixes                        |
| `docs/`    | Documentation changes            |
| `chore/`   | Tooling, dependencies, CI        |
| `refactor/`| Code restructuring, no behavior change |

Example: `feature/bgp-neighbor-monitoring`

## Commit Conventions

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short description>

<body (optional)>
```

Types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `style`, `perf`.

Scope is the package or area: `backend`, `web`, `shared`, `cli`, `discovery`, `docker`, etc.

Examples:
```
feat(discovery): add SNMP ifTable polling
fix(backend): handle null parentId in device import
docs(readme): update quick-start prerequisites
chore(deps): bump fastify to 4.26
```

## Pull Request Workflow

1. **Fork** the repository (or create a branch if you're a contributor).
2. **Create a branch** from `main` following the naming convention above.
3. **Make your changes.** Keep commits small and well-described.
4. **Run tests and lint:**

   ```bash
   pnpm test
   pnpm lint
   ```

5. **Push** to your fork and open a pull request against `main`.
6. **PR description** should include:
   - What the change does and why
   - Screenshots or logs for UI/behavior changes
   - Any breaking changes or migration steps
   - Related issue number (if applicable)
7. **Review** — maintainers will review. Expect discussion. Keep PRs focused — one feature/fix per PR.
8. **Merge** — a maintainer merges once CI passes and at least one approval is received.

### PR Checklist

Before submitting:

- [ ] `pnpm test` passes
- [ ] `pnpm lint` produces no errors
- [ ] New functionality includes tests where practical
- [ ] API changes are reflected in docs
- [ ] `.env` files and secrets are never committed
- [ ] Commit messages follow conventional commits

## Plugin Development

Custom pollers are plain JavaScript classes in the `plugins/` directory:

```javascript
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

See the [Plugin API docs](docs/developer-guide/plugins.md) for the full interface.

## Getting Help

- **Issues:** [GitHub Issues](https://github.com/NimbusSage/the-man/issues)
- **Discussions:** [GitHub Discussions](https://github.com/NimbusSage/the-man/discussions)
