<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./docs/logo.svg" />
    <img src="./docs/logo-light.svg" alt="tokagentOS" width="320" />
  </picture>
  <p><strong>Build autonomous AI agents that come with their own crypto wallet.</strong></p>

  [![license](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
  [![bun](https://img.shields.io/badge/bun-%E2%89%A5%201.3.14-black.svg)](https://bun.sh)
  [![node](https://img.shields.io/badge/node-24.15.0-339933.svg)](./.nvmrc)
</div>

## What is tokagentOS?

**tokagentOS is an open-source framework for building autonomous AI agents — and every agent ships with a built-in EVM wallet** (an Ethereum-style crypto wallet). Because the wallet is part of the runtime, an agent can hold tokens, sign messages, pay for things, mint NFTs, or run trading strategies on its own — you don't wire up a separate wallet stack.

Two things make it different from a generic agent framework:

1. **The wallet is built in.** It's a first-class part of the runtime, not a plugin. You choose how much the agent is allowed to do with it: sign transactions directly (**direct mode**), or route every on-chain action through a non-custodial smart contract with an allowlist (**vault mode**) so a compromised agent can't drain funds.
2. **Two ways to pay for the LLM.** Use your own provider API key (Anthropic, OpenAI, OpenRouter, xAI/Grok, Google Gemini, Groq, or local Ollama) — *or* let the agent's own wallet pay per call in crypto, with no account and no subscription, via the [x402](https://x402.org/) payment standard.

> tokagentOS is a fork of [elizaOS](https://github.com/elizaos/eliza) restyled for the Tokamak ecosystem. The runtime and plugin model come from upstream; the wallet integration, crypto billing rail, project scaffolder, and Tokamak app catalog are Tokamak-native. See [`NOTICE.md`](./NOTICE.md) for attribution.

---

## What you can build here

tokagentOS isn't just a runtime — it ships a catalog of real agent apps and plugins you can use, fork, or contribute to. Each app under [`apps/`](./apps) is a standalone workspace; pick what you want.

| If you're into…            | Look at                                                                                 |
| -------------------------- | --------------------------------------------------------------------------------------- |
| Chat-first companion avatars | [`apps/app-companion`](./apps) — VRM 3D avatar (voice + face + body)                   |
| Personal productivity      | [`apps/app-lifeops`](./apps) — routines, goals, Google Workspace, reminders             |
| Commerce                   | [`apps/app-shopify`](./apps) — Shopify storefront agents                                 |
| Multi-agent orchestration  | [`apps/app-steward`](./apps), [`apps/app-task-coordinator`](./apps)                      |
| NFT drops                  | [`apps/app-tokagentmaker`](./apps) — ERC-8041 drops, verified whitelists                 |
| Document RAG               | [`apps/app-knowledge`](./apps) — retrieval over a user's documents                       |
| DeFi automation            | [`plugins/plugin-tokagent-*`](./plugins) — Hyperliquid, Aave, Polymarket                 |
| Crypto-metered LLM billing | [`plugins/plugin-tokagent-billing`](./plugins), [`packages/billing`](./packages/billing) |

If you're coming from the AI-agent world and crypto feels unfamiliar — that's fine. You can run, build, and contribute to most of tokagentOS without touching the on-chain parts. The wallet only matters when your agent does something on-chain.

---

## Pick your path

| You want to…                                       | Go to                                                            |
| -------------------------------------------------- | --------------------------------------------------------------- |
| **Run an agent in 5 minutes**                      | [Quick start](#quick-start-run-an-agent)                        |
| **Hack on the framework, plugins, or apps**        | [Work in the monorepo](#work-in-the-monorepo)                   |
| **Understand how it fits together**                | [How it fits together](#how-it-fits-together)                   |
| **Decide wallet mode & how to pay for the LLM**    | [Choosing your setup](#choosing-your-setup)                     |
| **Send your first contribution**                   | [Contributing](#contributing)                                   |
| **Look up an env var, command, or deploy step**    | [Reference](#reference)                                         |

---

## Quick start: run an agent

> **Prerequisites:** macOS or Linux · [Bun ≥ 1.3.14](https://bun.sh) · [Node 24.15.0](./.nvmrc) · Git ≥ 2.40. Windows: run inside [WSL 2](https://learn.microsoft.com/en-us/windows/wsl/install-manual). (An EVM wallet like MetaMask/Rabby is only needed for the crypto billing dashboard.)

The [`@tokagent/tokagentos`](./packages/tokagentos) CLI scaffolds a fresh, self-contained project. Use this when you want to **run** an agent, not develop the framework itself.

```bash
# 1. Scaffold — no install needed (bunx fetches the published CLI)
bunx @tokagent/tokagentos@latest
#    Follow the prompts: project name, template, plugin set.
#    Output: ./<your-project>/ with a Vite + React UI and your chosen plugins.

# 2. Configure
cd <your-project>
cp .env.example .env
```

Fill in the essentials, then **pick one LLM path**:

```bash
# Required — the agent's built-in wallet:
TOKAGENT_PRIVATE_KEY=0x...        # operator hot wallet (hex)
TOKAGENT_RPC_URL=https://...      # Ethereum mainnet RPC

# LLM path A — bring your own key (any one of these):
ANTHROPIC_API_KEY=sk-ant-...      # or OPENAI_API_KEY / OPENROUTER_API_KEY /
                                  # XAI_API_KEY / GOOGLE_GENERATIVE_AI_API_KEY / GROQ_API_KEY
# LLM path B — pay per call in crypto (no API key):
BILLING_CHAT_KEY=sk-ai-...        # mint from the billing dashboard
TOKAGENT_GATEWAY_URL=https://...

# Optional — only in vault execution mode:
TOKAGENT_VAULT_ADDRESS=0x...
```

```bash
# 3. Run
bun install
bun run dev
# UI         → http://localhost:2138
# API server → http://localhost:31337
```

`bun run dev` launches the React UI on `:2138`, an API server on `:31337`, and the headless agent runtime. Hot-reload works for both. Full CLI reference: `bunx @tokagent/tokagentos --help`.

Don't have an LLM key handy? With no provider set, the runtime falls back to a local model via Ollama.

---

## Work in the monorepo

Clone this repo when you're editing one of the packages, plugins, or apps themselves — this is the contributor path.

```bash
git clone https://github.com/tokamak-network/Tokagentos-monorepo.git
cd Tokagentos-monorepo

bun install        # workspace install (postinstall patches nested core dist)
bun run build      # builds all packages in order (~1–3 min cold, seconds cached)
bun run typecheck  # smoke test the whole tree (~30s)

cp .env.example .env   # set at least one LLM provider key
bun run dev            # run a sample agent against your local edits
```

Iterating on one package? Run its build in watch mode in a side shell:

```bash
bun run dev:core            # watch-build @tokagentos/core
cd packages/agent && bun run dev   # or per package
```

<details>
<summary><strong>How the scaffolder works (templates &amp; patches)</strong></summary>

`@tokagent/tokagentos` ([`packages/tokagentos/`](./packages/tokagentos)) generates a project that references the **same workspace packages this monorepo defines**:

- **`templates/`** — project skeletons per template (`fullstack-app`, `headless-daemon`, …).
- **`scaffold-patches/`** — per-file overrides layered on top of the chosen template at scaffold time. This is how a scaffolded project picks up tweaks (like the `BILLING_CHAT_KEY → OPENAI_API_KEY` mirror) without those edits living in the upstream package.
- **`templates-manifest.json`** — declares which files come from which template and which patches apply.

Because scaffolded projects depend on `@tokagentos/*` via published or `workspace:*` versions, you can edit a plugin here and `bun link` it into a scaffolded project to test without re-publishing.
</details>

---

## How it fits together

tokagentOS has four kinds of building block. Keeping them straight is the fastest way to know where any piece of code lives.

- **Framework** — the runtime: `@tokagentos/core`, the agent loop, the plugin model (actions, providers, services), and the model-agnostic LLM layer. If you import `@tokagentos/core`, you're using the framework.
- **Project** — a deployable product workspace generated by the CLI. It owns its branded UI (`apps/app/`), its `.env`, and its plugin selection.
- **Plugin** — a runtime extension (actions/providers/services) mounted into an agent. First-party ones live in [`plugins/plugin-tokagent-*`](./plugins).
- **App** — a top-level workspace under [`apps/`](./apps) that adds its own UI surface (avatar runtime, NFT minting, …), consumed by `@tokagentos/app-core` at boot.

The directory tree mirrors that split:

```
Tokagentos-monorepo/
├── packages/                 # framework + shared libraries (workspace-only)
│   ├── typescript/           #  @tokagentos/core    — runtime interfaces, action/route types, Service base
│   ├── shared/               #  @tokagentos/shared  — env resolution, port discovery, connectors
│   ├── agent/                #  @tokagentos/agent   — headless agent runtime + API server (Elysia)
│   ├── app-core/             #  @tokagentos/app-core— dev-server + Vite bridge + plugin registry
│   ├── ui/                   #  @tokagentos/ui      — shared React primitives + design tokens
│   ├── billing/              #  @tokagentos/billing — Postgres credit ledger + on-chain settlement
│   ├── schemas/              #  @tokagentos/schemas — protobuf types (single source of truth)
│   └── tokagentos/           #  @tokagent/tokagentos — public CLI that scaffolds projects (npm)
│
├── plugins/                  # opt-in features mounted into a runtime
│   ├── plugin-tokagent-billing/   # x402 LLM payment rail (/v1/auth, /v1/keys, /v1/topup, /v1/messages)
│   ├── plugin-tokagent-shared/    # (DeFi pack) vault bindings, chain config, wallet helpers
│   ├── plugin-tokagent-strategy/  # (DeFi pack) strategy engine
│   ├── plugin-tokagent-perps/     # (DeFi pack) Hyperliquid perpetuals
│   ├── plugin-tokagent-yield/     # (DeFi pack) Aave v3 on Polygon
│   ├── plugin-tokagent-polymarket/# (DeFi pack) Polymarket
│   ├── plugin-signal/             # (upstream submodule) Signal messaging
│   └── plugin-bluebubbles/        # (upstream submodule) iMessage via BlueBubbles
│
├── apps/                     # standalone deployable apps — pick what you want, none required
│   └── …                     # companion, lifeops, shopify, steward, task-coordinator,
│                             #   tokagentmaker, knowledge, training, vincent, billing-server
│
├── scripts/                  # dev tooling: lockfile sync, submodule bootstrap, build orchestration
└── docs/                     # design notes, ADRs, runbooks
```

**Request lifecycle, in one breath:** a chat message hits the API server → `AgentRuntime` builds context and calls the LLM (your API key, or the x402 gateway) → if the LLM emits an action (send tokens, mint an NFT, deposit to Aave …) the runtime dispatches it to a plugin → on-chain actions are either signed directly or routed through the `ClaudeVault` allowlist → the result flows back to the UI and into memory.

<details>
<summary><strong>Architecture diagram &amp; key components</strong></summary>

```
                              ┌────────────────────────────┐
                              │   Chat UI (Vite + React)   │  :2138
                              └─────────────┬──────────────┘
                                            │ HTTP / SSE
                              ┌─────────────▼──────────────┐
                              │   @tokagentos/app-core     │  plugin registry · Vite bridge
                              └─────────────┬──────────────┘
                              ┌─────────────▼──────────────┐
                              │   @tokagentos/agent        │  AgentRuntime · built-in wallet
                              │   API server (Elysia)      │  :31337
                              └──┬──────────────┬──────────┘
            ┌────────────────────┘              └────────────────────┐
┌───────────▼────────────┐                          ┌───────────────▼──────────┐
│  LLM access            │                          │   On-chain (wallet)       │
│  A) your API key       │                          │   vault: ClaudeVault.exec │
│  B) x402 → PTON →      │                          │   direct: plugin-evm sign │
│     ClaudeVault        │                          │   → viem → any EVM chain  │
└────────────────────────┘                          └───────────────────────────┘
```

- **`@tokagentos/core`** (`packages/typescript/`) — runtime interfaces, `Action`/`Provider`/`Service` base types, logger, message/memory primitives. Everything depends on this.
- **`@tokagentos/agent`** (`packages/agent/`) — headless runtime: `AgentRuntime`, plugin loader, API server, CLI entry. The built-in wallet is wired up here.
- **`@tokagentos/app-core`** (`packages/app-core/`) — dev-server + Vite bridge + plugin registry powering white-label apps. Scaffolded projects use this as their entry point.
- **`@tokagentos/shared`** (`packages/shared/`) — env resolution, port discovery, message connectors.
- **`@tokagentos/billing`** (`packages/billing/`) — the x402 payment rail (only loaded if you opt into x402; bring-your-own-key never touches it).
- **`@tokagentos/ui`** (`packages/ui/`) — shared React primitives on Radix + Tailwind.
- **`@tokagentos/schemas`** (`packages/schemas/`) — protobuf schemas with generated TS/Python/Rust types.
- **Tokagent plugins** (`plugins/plugin-tokagent-*/`) — optional Tokamak feature pack (billing routes + the DeFi automation pack). None required for a wallet-only agent.

**Database:** local dev defaults to PGLite (file-backed, no separate process; set `PGLITE_DATA_DIR=memory://` for in-memory). Production uses `POSTGRES_URL`. Migrations are per-package — see [Reference → Troubleshooting & migrations](#reference).
</details>

---

## Choosing your setup

Two independent decisions shape how your agent behaves. You only need to understand these when your agent goes on-chain or you want crypto-metered LLM calls.

### 1. Wallet execution mode (`TOKAGENT_EXECUTION_MODE`)

This is the trust boundary around the agent's wallet — it applies to every on-chain action.

| Mode       | What it does                                                                                      | Use when                                                                 |
| ---------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `vault`    | Every call routes through a deployed `ClaudeVault` contract that enforces per-method allowlists on-chain. No raw signing from chat. | **Production.** A compromised/prompt-injected agent still can't drain funds. (Default.) |
| `direct`   | The operator wallet signs directly. Chat can drive arbitrary transfers/swaps via `@elizaos/plugin-evm`. | Development, demos, or full chat-driven on-chain control.                |
| `both`     | Both paths loaded; the LLM picks per request.                                                      | Rare — reduced safety. Only if you understand both.                      |

### 2. How you pay for the LLM

| Option                       | What it means                                                                                       |
| ---------------------------- | --------------------------------------------------------------------------------------------------- |
| **A — Bring your own key**   | Set any provider key in `.env` (Anthropic, OpenAI, OpenRouter, xAI, Gemini, Groq, Ollama, LiteLLM). The matching plugin auto-loads; you pay the provider directly. Falls back to local Ollama if none set. |
| **B — x402 pay-per-call**    | The agent's own wallet funds each call in crypto — no account, no subscription. Set `BILLING_CHAT_KEY` + `TOKAGENT_GATEWAY_URL`. |

<details>
<summary><strong>How x402 pay-per-call works (the on-chain mechanics)</strong></summary>

The agent's wallet funds each LLM call via [x402](https://x402.org/), an HTTP-402 "pay-per-call" standard. Every request settles on-chain in **PTON** (an EIP-3009 wrapper over Tokamak TON, 1:1).

1. The agent makes an LLM request to the gateway (`/v1/messages` for Anthropic-shaped, `/v1/chat/completions` for OpenAI-shaped).
2. Either a **SIWE** login (sign-in-with-Ethereum → 24-hour session token) or an HMAC API key (`sk-ai-*`) authenticates the wallet. API keys are stateless — good for headless agents.
3. The gateway reserves credits against the wallet's PTON balance in `ClaudeVault`, forwards to LiteLLM (which fans out to any model), streams the response back, then commits actual usage.
4. Periodic on-chain `consumeCredits` calls batch the charges. Wallets top up by depositing PTON via EIP-3009 (`vault.depositX402`) — gasless from the user's side.
5. The dashboard swaps USDC / USDT / ETH / WBTC → TON → PTON in one flow.

**Use the hosted Tokamak gateway:**
```bash
BILLING_CHAT_KEY=sk-ai-...            # mint via the dashboard
TOKAGENT_GATEWAY_URL=https://billing-service-production-a8e7.up.railway.app
```
Or run your own from [`apps/billing-server/`](./apps/billing-server). The dashboard at `/v1/billing/dashboard/` handles API-key minting, swap-to-PTON top-up, and 90-day usage history.

**Code:** [`packages/billing/`](./packages/billing) (ledger + settlement + TWAP oracle) · [`plugins/plugin-tokagent-billing/`](./plugins/plugin-tokagent-billing) (the routes) · [`apps/billing-server/`](./apps/billing-server) (hosted gateway) · [`docs/x402-e2e-test.md`](./docs/x402-e2e-test.md) (end-to-end walkthrough).
`ClaudeVault` mainnet address: `0x091365301a461bEeFd5e2Fe1BD244befCE274F5c`.
</details>

### Messaging channels (optional)

Set any of these to activate the matching channel — no code changes: `TELEGRAM_BOT_TOKEN`, `DISCORD_BOT_TOKEN`, `TWITTER_API_KEY` + `TWITTER_API_SECRET`, `WHATSAPP_ACCESS_TOKEN`, `SIGNAL_PHONE_NUMBER`. iMessage is available via the BlueBubbles submodule plugin.

---

## Contributing

Contributions are welcome — and you don't need to understand the whole system to make a useful one.

**Where to start looking:**
- Fixing or extending a **plugin**? → [`plugins/plugin-tokagent-*`](./plugins)
- Working on an **app/UI**? → [`apps/`](./apps) + [`packages/app-core`](./packages/app-core) + [`packages/ui`](./packages/ui)
- Changing **runtime behavior**? → [`packages/agent`](./packages/agent) (and `packages/typescript` for core types)
- Touching **billing**? → [`packages/billing`](./packages/billing) + [`plugins/plugin-tokagent-billing`](./plugins/plugin-tokagent-billing)

**Before you open a PR:**
```bash
bun run lint:all     # lint + typecheck
bun run test         # full suite (Vitest — not `bun test`; see Reference → Testing)
```

**Norms:**
- Open an issue before a non-trivial PR — the architecture is intentionally constrained, and agreeing on shape first makes reviews faster.
- **Conventional Commits** are enforced on the default branch.
- Issue and PR templates live in [`.github/`](./.github/).

---

## Reference

Look-up material lives below so the guide above stays short. Full environment reference is always [`.env.example`](./.env.example).

<details>
<summary><strong>Environment variables</strong></summary>

**Required for any run** — `TOKAGENT_EXECUTION_MODE` (`vault`/`direct`/`both`, default `vault`) and **one** LLM path: a provider key (`ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `OPENROUTER_API_KEY` / `XAI_API_KEY` / `GOOGLE_GENERATIVE_AI_API_KEY` / `GROQ_API_KEY` / `OLLAMA_API_ENDPOINT`) **or** `BILLING_CHAT_KEY` + `TOKAGENT_GATEWAY_URL`.

**On-chain (any wallet activity)** — `TOKAGENT_PRIVATE_KEY` (operator hot wallet, auto-mirrored to `EVM_PRIVATE_KEY`), `TOKAGENT_RPC_URL` (mainnet RPC), `TOKAGENT_VAULT_ADDRESS` (vault mode), `POLYGON_RPC_URL` (Aave yield plugin), `HYPERLIQUID_API_URL` (perps plugin). *Alternatively, leave `TOKAGENT_PRIVATE_KEY` empty and use the `/wallet` page wizard to generate/import a key stored in the OS keychain.*

**Server** — `SERVER_PORT` (`3000`), `SERVER_HOST` (`0.0.0.0`), `NODE_ENV`, `EXPRESS_MAX_PAYLOAD` (`2mb`), `TOKAGENT_UI_PORT` (`2138`), `TOKAGENT_API_PORT` (`31337`).

**Messaging** — `TELEGRAM_BOT_TOKEN`, `DISCORD_BOT_TOKEN`, `TWITTER_API_KEY` + `TWITTER_API_SECRET`, `WHATSAPP_ACCESS_TOKEN`, `SIGNAL_PHONE_NUMBER`.

**Billing** (only when `BILLING_ENABLED=true`) — `BILLING_AUTH_REQUIRED`, `BILLING_AUTH_SECRET` (`openssl rand -hex 32`), `BILLING_AUTH_SESSION_TTL_MS` (`86400000`), `BILLING_DATABASE_URL`, `BILLING_CHAIN_RPC_URL`, `BILLING_CHAIN_ID`, `BILLING_VAULT_ADDRESS`, `BILLING_PTON_ADDRESS`, `BILLING_OPERATOR_PRIVATE_KEY`, `BILLING_LITELLM_BASE_URL`, `BILLING_LITELLM_API_KEY`, `BILLING_MAINNET_RPC_URL`, `BILLING_MARGIN_BPS` (`10` dev / `100` prod), `BILLING_TOPUP_AMOUNT_PTON` (`5e18`), `BILLING_RATE_LIMIT_ENABLED`, `BILLING_RATE_LIMIT_QUOTE_PER_MIN` (`60`), `BILLING_RATE_LIMIT_SETTLE_PER_MIN` (`30`).
</details>

<details>
<summary><strong>Common commands</strong></summary>

Run from the repo root unless noted.

| Command | What it does |
| --- | --- |
| `bun install` | Install everything (postinstall patches nested core dist). |
| `bun run build` | Turbo builds every package in order (~1–3 min cold). |
| `bun run build:core` / `build:server` | Force-rebuild just core / server (no cache). |
| `bun run typecheck` | `tsc --noEmit` per package (~30s warm). |
| `bun run lint:check` / `lint` | Biome lint (read-only / autofix). |
| `bun run lint:all` | `lint:check` + `typecheck`. |
| `bun run format:check` / `format` | Biome format (read-only / write). |
| `bun run dev` | Multi-process supervisor for local dev (`scripts/dev.mjs`). |
| `bun run dev:core` / `dev:agent` | Watch-build core / agent. |
| `bun run start` / `start:tokagent` / `start:debug` | Run the agent / app-core entry / with debug logs. |
| `bun run test` / `test:core` / `test:plugins` | Test suite (serial) / per-target. |
| `bun run migrate` / `migrate:generate` | Run / generate Drizzle migrations (`plugin-sql`). |
| `bun run generate:types` | Regenerate protobuf types. |
| `bun run check:env-sync` | Verify `.env.example` matches what plugins read. |
| `bun run fix-deps:check` / `fix-deps` | Report / rewrite drifted `workspace:*` deps. |
| `bun run clean` / `clean:cache` | Nuke dist+node_modules+lockfile & reinstall / caches only. |
| `bun run release` / `release:alpha` / `version:*` | Lerna publish / version bump *(maintainers)*. |

**Per-package** — every package supports a uniform surface:
```bash
cd packages/<name>
bun run build      # bun build.ts
bun run typecheck  # tsc --noEmit
bun run test       # vitest run
bun run lint       # biome check
bun run clean      # rm -rf dist
```
The billing package adds `bun run sync-abis` (pull latest ABIs) and `bun run db:generate` (Drizzle migration).
</details>

<details>
<summary><strong>Testing</strong></summary>

The runner is **Vitest** — **not `bun test`** (Bun doesn't implement `vi.importActual` / `vi.stubEnv`, which several tests need).

```bash
bun run test                                   # whole tree (serial, ~3–5 min)
cd packages/typescript && bun run test         # single package
cd packages/billing && bunx vitest run src/ledger/credit-ledger.test.ts   # single file
bun run test:plugins                           # all plugins
```
The [`typecheck-billing.yml`](./.github/workflows/typecheck-billing.yml) CI is a fast path for billing-only changes: build core + billing, typecheck, run the 290-test plugin suite — under 5 minutes.
</details>

<details>
<summary><strong>Deployment</strong></summary>

**Hosted billing gateway (Fly.io)** — [`apps/billing-server/`](./apps/billing-server):
```bash
fly deploy --config apps/billing-server/fly.toml
```
CI ([`deploy-billing-server.yml`](./.github/workflows/deploy-billing-server.yml)) runs migrations → Fly.io bluegreen deploy → readiness check on `billing-server-v*` tags. Full runbook: [`scripts/billing-server-DEPLOY.md`](./scripts/billing-server-DEPLOY.md).

**Operator agents (Docker / Railway / VPS)** — deployable as a single container:
```bash
docker build -t tokagentos .
docker run -p 3000:3000 -p 2138:2138 \
  -e TOKAGENT_EXECUTION_MODE=vault \
  -e ANTHROPIC_API_KEY=sk-ant-... \
  -e TOKAGENT_PRIVATE_KEY=0x... \
  -e TOKAGENT_VAULT_ADDRESS=0x... \
  -e TOKAGENT_RPC_URL=https://eth.llamarpc.com \
  -e POSTGRES_URL=postgres://... \
  tokagentos
```
Also ships [`railway.toml`](./railway.toml) and [`docker-compose.billing.yml`](./docker-compose.billing.yml). **TEE** (hardware-attested custody) builds via [`tee-build-deploy.yml`](./.github/workflows/tee-build-deploy.yml).
</details>

<details>
<summary><strong>CI workflows</strong></summary>

| Workflow | Gates |
| --- | --- |
| [`typecheck-billing.yml`](./.github/workflows/typecheck-billing.yml) | Build + typecheck + 290-test plugin suite on billing changes (~5 min). |
| [`deploy-billing-server.yml`](./.github/workflows/deploy-billing-server.yml) | Migrations → Fly.io deploy on `billing-server-v*`. |
| [`ci.yaml`](./.github/workflows/ci.yaml) | Workspace lint + typecheck + test. |
| [`pr.yaml`](./.github/workflows/pr.yaml) | PR-only checks (changesets, labels). |
| [`codeql.yml`](./.github/workflows/codeql.yml) | Security scan (weekly + PR). |
| [`multi-lang-tests.yaml`](./.github/workflows/multi-lang-tests.yaml) | Python + Rust tests for generated client libs. |
| [`release.yaml`](./.github/workflows/release.yaml) | Lerna publish. |
| [`tee-build-deploy.yml`](./.github/workflows/tee-build-deploy.yml) | TEE-attested image build. |

Full list (Electron/iOS/Android, JSDoc, supply-chain attestation, maintenance): [`.github/workflows/README.md`](./.github/workflows/README.md).
</details>

<details>
<summary><strong>Troubleshooting &amp; database migrations</strong></summary>

- **`bun install` fails (peer dep / native build):** `bun run clean` (nuclear reinstall). On macOS native-module failures: `brew install cairo pango libpng jpeg giflib librsvg`.
- **Workspace dep mismatch:** `bun run fix-deps:check` then `bun run fix-deps`.
- **"Cannot find module '@tokagentos/core'" after editing core:** `bun run build:core` (or `bun run dev:core`).
- **Vault transactions reverting:** confirm `TOKAGENT_EXECUTION_MODE=vault` + `TOKAGENT_VAULT_ADDRESS` is a deployed vault on your target chain; confirm the vault admin whitelisted the target contract + selector (logs show rejected calldata). For Hyperliquid, set `TOKAGENT_HYPERLIQUID_HELPER_ADDRESS` (mainnet `0x8350777738059f29f639e493ea96e20d2f58171c`).
- **Billing "401 Unauthorized" on `/v1/messages`:** `BILLING_CHAT_KEY` set and starts with `sk-ai-`; `TOKAGENT_GATEWAY_URL` reachable; use the dashboard "Test key" button.
- **"vi.importActual/vi.stubEnv is not a function":** you used `bun test`. Use `bun run test` or `bunx vitest run`.
- **PGLite "database is locked":** two processes share one dir — give each its own `PGLITE_DATA_DIR`, or `export PGLITE_DATA_DIR=memory://`.
- **Migrations:** main DB → `bun run migrate`; billing ledger → `cd packages/billing && bun run db:generate && bunx drizzle-kit migrate`.
</details>

---

## License & attribution

MIT — see [`LICENSE`](./LICENSE).

A fork of [elizaOS](https://github.com/elizaos/eliza) (commit `4552f7b98c`, `v2.0.0-alpha.223`). See [`NOTICE.md`](./NOTICE.md) for upstream credits and overridden files. This repo is the standalone home of what used to live at `tokagentos/` inside [`tokamak-network/Tokamak-AI-Layer`](https://github.com/tokamak-network/Tokamak-AI-Layer) — git history is preserved.

### Contributors

<a href="https://github.com/tokamak-network/Tokagentos-monorepo/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=tokamak-network/Tokagentos-monorepo" alt="tokagentOS project contributors" />
</a>
