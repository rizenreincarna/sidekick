# Engraphis MCP wiring for Hermes (ready to apply — coordinate a gateway restart with Tars first)

Engraphis ships an MCP server (`engraphis-mcp`, 28 tools) that is **free-tier** and
**not** team-gated (verified: `engraphis_remember` + `engraphis_recall` work over
stdio against the same SQLite DB the dashboard serves). The Hermes gateways are NOT
restarted as part of this migration (constraint: don't break the live Telegram bots
without Tars). When Tars is ready, apply the snippet below and restart each gateway.

## Dashboard
Engraphis WebUI + REST API is live at **https://m.rizen.space** (Nginx reverse proxy
→ 127.0.0.1:8700, HTTPS via Let's Encrypt, protected by Nginx Basic Auth using the
existing `/etc/nginx/.htpasswd-work` — same `tars:` credential as work.rizen.space).

## 1. Add the engraphis stdio MCP server to /root/.hermes/config.yaml

Under `mcp_servers:` add:

```yaml
  engraphis:
    type: stdio
    command: /usr/local/lib/hermes-agent/venv/bin/engraphis-mcp
    env:
      ENGRAPHIS_DB_PATH: /root/.local/share/engraphis/engraphis.db
      # Default workspace = this gateway's private workspace. Falls back to shared.
      ENGRAPHIS_WORKSPACES: will,shared      # for the will/default profile
```

For the marie and will (default) profile configs, set the `ENGRAPHIS_WORKSPACES`
allow-list to that agent's private workspace + shared:
- marie profile → `ENGRAPHIS_WORKSPACES: marie,shared`
- will/default  → `ENGRAPHIS_WORKSPACES: will,shared`

(Jack's profile was sunset 2026-07-19; his workspace was merged into `will`.)

## 2. Expose the toolset to Telegram

In each config's `platform_toolsets.telegram:` list, add `engraphis` (and optionally
remove the now-unused `mnemosyne`).

## 3. Restart the gateways (this is the step to coordinate with Tars)

```bash
pm2 restart hermes-gateway hermes-gateway-marie
```

(`hermes-gateway-jack` was deleted 2026-07-19 when Jack was sunset.)

## 4. Retire the old mnemosyne stdio MCP

While editing, remove the `mcp_servers.mnemosyne` block and drop `mnemosyne` from the
telegram toolsets. The three Mnemosyne dashboard PM2 processes are ALREADY deleted.
The original Mnemosyne SQLite DBs remain on disk (archived copies in
/root/.hermes/mnemosyne-backup/) so the currently-running gateways still have working
mnemosyne MCP until you do this coordinated restart.
