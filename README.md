# LLM Platform

AI-powered platform with edge computing and dedicated backend.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    CLOUDFLARE (Edge - Free/Cheap)               │
├─────────────────────────────────────────────────────────────────┤
│  Pages (Landing)    Workers (API)      D1/KV/R2 (Storage)       │
│  - Marketing        - Gateway          - Sessions (KV)          │
│  - Docs             - Auth proxy       - Audit logs (D1)        │
│  - Dashboard SPA    - Rate limiting    - Files (R2)             │
└──────────────────────────┬──────────────────────────────────────┘
                           │ Cloudflare Tunnel (Zero Trust)
┌──────────────────────────▼──────────────────────────────────────┐
│               DIGITALOCEAN (Backend - $24/mo)                   │
├─────────────────────────────────────────────────────────────────┤
│  PostgreSQL+pgvector    Ollama (LLM)      Custom Agents         │
│  - Embeddings           - llama3.2        - RAG pipeline        │
│  - Vector search        - Local inference - Tool execution      │
│  - User data            - No API costs    - Async workers       │
│                                                                 │
│  Redis                  (Future: Vault for secrets)             │
│  - Caching                                                      │
│  - Queues                                                       │
└─────────────────────────────────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│                    SUPABASE (Auth - Free Tier)                  │
├─────────────────────────────────────────────────────────────────┤
│  Auth          RLS Policies       Realtime                      │
│  - OAuth       - Row security     - Subscriptions               │
│  - JWT         - Per-user data    - Presence                    │
└─────────────────────────────────────────────────────────────────┘
```

## Quick Start

```bash
# Deploy CloudFlare workers
cd cloudflare/workers/api-gateway
npm install && npx wrangler deploy

# Deploy DigitalOcean stack
ssh root@YOUR_IP
cd /opt/llm-platform
docker compose up -d
```

## Costs

| Service | Tier | Monthly Cost |
|---------|------|--------------|
| CloudFlare | Free | $0 |
| DigitalOcean | s-2vcpu-4gb | $24 |
| Supabase | Free | $0 |
| **Total** | | **$24/mo** |

## Version History

See [versions.txt](versions.txt) for detailed changelog.
