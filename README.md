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
| NL2SQL   | Ask            | `POST /v1/nl2sql/query`                      |
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

## NL2SQL → Ask

**Note:** confirmed by the SynapCores team to be an Enterprise-only feature --
this operation returns `501 Feature disabled` on Community Edition. Kept in
the node for forward-compatibility (e.g. if you're on Enterprise, or CE gets
it later), but CE users should use the SQL-level `RAG()` function instead
(via `Query → Execute`) for similar natural-language question answering:

```sql
SELECT RAG('What is the average requested budget?', ['trip_budget_requests']) AS response
-- or across multiple tables:
SELECT RAG('What is the average requested budget?', ['trip_budget_requests', 'destination_cost_benchmarks']) AS response
```

Usually the simplest way to handle "ask a question about my table" workflows:
it calls `POST /v1/nl2sql/query`, which turns a plain English question into
SQL against your actual schema and (by default) runs it, returning real
results -- not just a description of what the SQL would do.

This is a one-node alternative to a two-step "SELECT rows, then feed them to
AI Chat as context" pattern -- SynapCores handles the schema-awareness and
SQL generation itself, rather than you manually pulling rows and prompting a
model with them yourself.

Turn off **Execute Generated SQL** if you'd rather inspect the generated SQL
before it runs -- useful as a review/approval step ahead of anything
write-adjacent, or if you just want to see what SQL it produced.

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
- **API Key** — created via `POST /v1/api-keys` or the web console
  (Settings → API Keys). **Note:** the OpenAPI spec documents this as an
  `X-API-Key` header, but testing against a real CE instance
  (`v1.12.0.1-ce` through `v1.14.3-ce`) found that header returns
  `{"error":"missing_authorization"}` for every key tried -- both
  API-created and console-created. The header that actually works is
  `Authorization: ApiKey <key>`, which this node uses. Confirmed via direct
  testing, not from documentation (the docs' `X-API-Key` header appears to
  be wrong).

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

- **`X-API-Key` header doesn't work** as documented -- use
  `Authorization: ApiKey <key>` instead. See the Credentials section above.
  (This appears to be a documentation error rather than a broken feature --
  API keys work fine once sent with the correct header.)
- **`[query.ai_service].provider = "anthropic"`** did not work in
  `v1.12.0.1-ce` (`ERROR Unknown AI provider: anthropic, falling back to
  SimpleAiService`, empty `GENERATE()` result). **Fixed in `v1.14.3-ce`** --
  confirmed working via direct testing after upgrading.
- **`RAG('question', ['table'])`** (a suggested alternative to NL2SQL, see
  below) currently fails against Anthropic with a `400` from Anthropic's API:
  `stop_sequences: each stop sequence must contain non-whitespace`. Looks
  like a request-building bug specific to the `RAG()` path -- `GENERATE()`
  had a similar class of bug that was fixed in `v1.14.3-ce`, but `RAG()`
  doesn't appear to share that fix.
- **NL2SQL (`/v1/nl2sql/*`) is Enterprise-only**, not a CE feature -- confirmed
  by the SynapCores team. Returns `501 Feature disabled` on CE. As an
  alternative, the team suggested the SQL-level `RAG()` function (see above)
  for schema-aware, natural-language question answering against one or more
  tables.

## License

MIT
