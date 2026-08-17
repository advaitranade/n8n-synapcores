# n8n-nodes-synapcores

An [n8n](https://n8n.io) community node for [SynapCores](https://synapcores.com)
— a self-hosted, AI-native database that unifies SQL, vector search, and an
in-database durable agent runtime (`CREATE AGENT`) in a single binary.

There's no official SynapCores node yet, so this wraps their public REST API
(documented at [docs.synapcores.com/api-reference](https://docs.synapcores.com/api-reference/))
so you can query, search, and trigger agents from an n8n workflow.

## What it does

| Resource | Operation      | SynapCores endpoint                          |
| -------- | -------------- | --------------------------------------------- |
| AI       | Chat           | `POST /v1/ai/chat`                           |
| Query    | Execute        | `POST /v1/query/execute`                     |
| Query    | Execute Batch  | `POST /v1/query/execute/batch`                |
| Schema   | List Tables    | `GET /v1/schema/tables`                      |
| Vector   | Search         | `POST /v1/vectors/collections/{name}/search` |

## AI → Chat, and the experimental model fields

`AI → Chat` calls `/v1/ai/chat` and returns whatever SynapCores' configured
model produces. As of this writing, SynapCores' `AiChatRequest` schema
(`GET /v1/openapi.json`) only declares `message`, `session_id`, and
`database` -- the backend model appears to be fixed at the gateway/instance
level (see `gateway.toml`), not swappable per call. Evidence for this: the
error message returned by an unsupported `ALTER AGENT SET` option lists the
full set of valid agent-level settings, and `model`/`provider` isn't among
them.

The node still exposes a **Model Override** and **Model API Key** field on
this operation, sent as extra JSON fields (`model`, `model_api_key`) on the
request. These are speculative and, per typical serde behavior (SynapCores
is Rust-based), most likely silently ignored by the server today rather than
erroring. They're included so the node is forward-compatible if a future
SynapCores version adds per-call model/provider selection -- leave them
blank unless you've confirmed your instance actually honors them.

The **Query → Execute** operation is the most versatile one: since SynapCores'
`CREATE AGENT ... ON INSERT` pattern fires an in-database agent the moment a
row lands in a table, an n8n workflow can trigger a SynapCores agent just by
running an `INSERT` through this node — no separate orchestration needed on
the n8n side. The agent itself, its guardrails, and its audit trail all live
inside SynapCores.

## Installation

This isn't published to npm yet. To try it locally against a self-hosted n8n
instance:

```bash
npm install
npm run build
```

Then make it available to n8n. If your n8n instance is Docker-based (common
for a local CE setup), `npm link` often hits an EACCES permission error
inside the container, since n8n's official image runs as a non-root user
without write access to the global npm folder. The reliable workaround: add
this package as a local `file:` dependency inside n8n's custom nodes folder
instead of linking it.

```bash
mkdir -p /path/to/n8n/custom       # e.g. ~/.n8n/custom, or your mounted volume
cd /path/to/n8n/custom
cat > package.json << 'EOF'
{
  "name": "n8n-custom-nodes",
  "private": true,
  "dependencies": {
    "n8n-nodes-synapcores": "file:./n8n-nodes-synapcores"
  }
}
EOF
# copy or clone this repo's built output into that folder as n8n-nodes-synapcores/
npm install
```

Restart n8n. The **SynapCores** node and **SynapCores API** credential should
now appear in the node panel.

## Credentials

You'll need:

- **Host** — your SynapCores instance's base URL (e.g. `http://127.0.0.1:8080`
  for a local Docker/CE deployment; REST API and Web UI share the same port).
  If n8n and SynapCores are both containers on the same Docker network, use
  the SynapCores service's container-internal port (typically `8080`), not
  the host-mapped port.
- **Bearer Token** — a JWT obtained via `POST /v1/auth/login` (username +
  password). **Note:** the OpenAPI spec also documents an `X-API-Key` header
  scheme (keys created via `POST /v1/api-keys`), which would be preferable
  for automation since it doesn't expire -- but testing against a real CE
  instance (`v1.12.0.1-ce`) found that scheme returns
  `{"error":"missing_authorization"}` even with a freshly-created, valid key,
  on the same request that succeeds with a Bearer JWT. This node uses Bearer
  JWT since it's the scheme that actually works today. JWTs expire (24h
  default per `gateway.toml`'s `token_expiration`), so the token will need
  periodic manual refreshing until the API key path is fixed upstream.

## Example: trigger a database-native agent from n8n

1. Add a **SynapCores** node, resource `Query`, operation `Execute`.
2. SQL statement:
   ```sql
   INSERT INTO trip_budget_requests (destination, travelers, duration_days, requested_budget_usd)
   VALUES ($1, $2, $3, $4)
   ```
3. Parameters: `["Lisbon", 3, 6, 500]`

If you have a `CREATE AGENT ... ON INSERT INTO trip_budget_requests` declared
in SynapCores, this single node execution is enough to trigger it — the agent
runs inside the database process itself, and its structured output lands back
in whatever table it's configured to write to. A downstream **SynapCores**
node (`Query → Execute`, a `SELECT`) can then read the result back into the
same n8n workflow.

## Status

Early / community-maintained, not an official SynapCores integration. Built
and tested against SynapCores Community Edition `v1.12.0.1-ce`. If you hit a
route that doesn't match SynapCores' current API, check
[the API reference](https://docs.synapcores.com/api-reference/) — the REST
surface is versioned at `/v1/` and this node targets that.

### Known upstream issues found while building this

- **`X-API-Key` auth doesn't work** against `v1.12.0.1-ce` -- see the
  Credentials section above.
- **`[query.ai_service].provider = "anthropic"`** (and presumably
  `openai`/`gemini`) doesn't currently work either, despite being documented
  as valid in `gateway.toml`'s own comments. Setting it produces
  `ERROR Unknown AI provider: anthropic, falling back to SimpleAiService` in
  the gateway logs, and `GENERATE()` returns an empty string instead of
  erroring. Cloud-provider support for this config block doesn't appear to
  be fully wired up yet in this CE build.

## License

MIT
