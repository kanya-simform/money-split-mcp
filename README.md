# money-split-mcp

A remote, multi-user [MCP](https://modelcontextprotocol.io) server for splitting group expenses (Splitwise-lite). Each
user registers an account by email, gets an API key, and uses that key to create groups, add members by email, log
expenses, and see who owes whom — all through an MCP client (Claude Desktop, claude.ai connectors, etc.).

## How it works

- `POST /register` is a plain REST endpoint (not an MCP tool) that creates a user and returns a one-time API key.
- Every other call goes through `POST /mcp` (MCP Streamable HTTP) with `Authorization: Bearer <api_key>`. The server
  is stateless: each request resolves the caller from their API key and builds a fresh, user-scoped set of tools.
- Data (users, groups, expenses, shares, settlements) lives in Postgres via Prisma.

## Local setup

1. Copy `.env.example` to `.env` and adjust `DATABASE_URL` if needed.
2. Get a local Postgres running, matching `.env`'s `DATABASE_URL` (`moneysplit`/`moneysplit`/db `moneysplit` on
   `localhost:5432`):
   - **Native install**: `sudo apt-get install -y postgresql postgresql-contrib`, then:
     ```
     sudo -u postgres psql -c "CREATE USER moneysplit WITH PASSWORD 'moneysplit';"
     sudo -u postgres psql -c "CREATE DATABASE moneysplit OWNER moneysplit;"
     ```
   - **Docker** (if available): `docker compose up -d`
3. Install deps and run the first migration:
   ```
   npm install
   npm run prisma:migrate
   ```
4. Start the dev server: `npm run dev` (listens on `http://localhost:3000` by default).
5. Run the unit tests any time: `npm test` (covers the split/balance math, no DB needed).

## Manually testing the full flow

Register two users:

```bash
curl -s localhost:3000/register -H 'content-type: application/json' \
  -d '{"email":"alice@example.com","name":"Alice"}'
curl -s localhost:3000/register -H 'content-type: application/json' \
  -d '{"email":"bob@example.com","name":"Bob"}'
```

Each response includes an `apiKey` — save both, they're never shown again.

Then drive the MCP tools with the [MCP Inspector](https://github.com/modelcontextprotocol/inspector):

```bash
npx @modelcontextprotocol/inspector
```

Connect it to `http://localhost:3000/mcp` (Streamable HTTP transport) with header
`Authorization: Bearer <alice's apiKey>`, then call tools in order:

1. `create_group` `{ "name": "Trip to Goa" }` → note the returned group `id`
2. `add_member_to_group` `{ "group_id": "...", "email": "bob@example.com" }`
3. `add_expense` `{ "group_id": "...", "description": "Hotel", "amount": 100 }` (defaults: paid by Alice, split
   evenly across all members)
4. `get_balances` `{ "group_id": "..." }` → Alice should show `+50`, Bob `-50`, with a suggested settlement of Bob
   paying Alice 50.
5. Reconnect the Inspector with Bob's API key and call `settle_up` `{ "group_id": "...", "to_email":
   "alice@example.com", "amount": 50 }`, then `get_balances` again to confirm both are back to `0`.

## Deploying to Render

This repo includes a `render.yaml` Blueprint that provisions a Postgres database and a Node web service together.

1. Push this repo to GitHub.
2. In the Render dashboard: **New > Blueprint**, point it at the repo — it will read `render.yaml` and create both
   the `money-split-db` database and the `money-split-mcp` web service, wiring `DATABASE_URL` automatically.
3. The web service's build command runs `npx prisma migrate deploy` after compiling, keeping the schema in sync on
   every deploy. (Render's free plan doesn't support the separate `preDeployCommand` step, so it's folded into the
   build instead.)
4. Once deployed, verify:
   ```
   curl https://<your-service>.onrender.com/health
   ```

Note: Render's free Postgres plan expires after a fixed trial period — check current Render pricing before relying
on it long-term; swap in any external Postgres (e.g. Neon, Supabase) by just changing `DATABASE_URL` if needed.

## Using it from an MCP client

1. Register a real account against the deployed URL:
   ```bash
   curl -s https://<your-service>.onrender.com/register -H 'content-type: application/json' \
     -d '{"email":"you@example.com","name":"Your Name"}'
   ```
2. Add it as a remote MCP server in your client, e.g. in Claude Desktop's config:
   ```json
   {
     "mcpServers": {
       "money-split": {
         "url": "https://<your-service>.onrender.com/mcp",
         "headers": { "Authorization": "Bearer <your apiKey>" }
       }
     }
   }
   ```
   (Check your specific client's docs for the exact key names it expects for a remote Streamable HTTP server with
   custom headers — some clients configure this through a UI instead of raw JSON.)
3. Each group member registers their own account and adds the server with their own key — that's what ties MCP
   activity back to "their" groups and balances.
4. From inside the client: "create a group called Goa Trip", "add bob@example.com to it", "log a ₹3000 hotel
   expense split evenly", "who owes whom in the Goa Trip group?".
