# CHANGELOG

All notable changes to this project will be documented in this file.

## [0.4.2] - 2025-12-28

### Security - BLACKBOX MODE 🔒
- **FIREWALL**: UFW configured - only SSH (22) open, all else denied
- **CLOUDFLARE**: Security level set to HIGH
- **CLOUDFLARE**: Browser Integrity Check enabled
- **CLOUDFLARE**: Always Use HTTPS enabled  
- **CLOUDFLARE**: Minimum TLS 1.2 enforced
- **KILLED**: Rogue Python process on port 8080 (again)

### Architecture
```
BLACKBOX Architecture:
┌─────────────────────────────────────────────────────┐
│                    INTERNET                          │
└─────────────────────┬───────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────┐
│              CLOUDFLARE EDGE                         │
│  • WAF (Security Level: HIGH)                        │
│  • Bot Protection                                    │
│  • TLS 1.2+ only                                     │
│  • Rate Limiting (Worker-level)                      │
└─────────────────────┬───────────────────────────────┘
                      │ Tunnel (encrypted)
┌─────────────────────▼───────────────────────────────┐
│         DIGITALOCEAN DROPLET (BLACKBOX)              │
│  UFW: DENY ALL except SSH                            │
│  ┌─────────────────────────────────────────────┐    │
│  │ cloudflared tunnel (only external access)   │    │
│  └──────────────┬──────────────────────────────┘    │
│                 │ localhost only                     │
│  ┌──────────────▼──────────────────────────────┐    │
│  │ Docker Services (127.0.0.1 bound)           │    │
│  │  • Ollama :11434                            │    │
│  │  • PostgreSQL :5432                         │    │
│  │  • Redis :6379                              │    │
│  └─────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘
```

### Verified
- All Docker services bound to 127.0.0.1 only
- No public ports except SSH (protected by fail2ban)
- CloudFlare Tunnel is ONLY way to reach services

---

## [0.4.1] - 2025-12-28

### Security
- **ADDED**: Internal token header for Ollama requests (X-Internal-Token)
- **ADDED**: CloudFlare API token configured for automation
- **VERIFIED**: All services bound to localhost only on droplet
- **KILLED**: Rogue Python process on port 8080

### Infrastructure  
- CloudFlare Zone ID: ce7ce48e4e27c7cfc69386af588956a8
- API Token stored (limited permissions - needs Workers:Edit)

### API Gateway v0.4.1
- Added internal token support for secure Ollama communication
- Improved error handling and request timing

---

## [0.3.1] - 2025-12-28

### Security
- **FIXED**: Killed rogue Python process exposing port 8080 publicly
- **HARDENED**: SSH now requires key authentication only (PermitRootLogin prohibit-password)
- **HARDENED**: Password authentication disabled
- **VERIFIED**: All Docker services bound to 127.0.0.1 only
- **VERIFIED**: UFW firewall active, only SSH (22) exposed
- **VERIFIED**: Fail2ban active with 3 IPs currently banned

### Infrastructure
- Cloudflare Tunnel providing zero-trust access to backend services
- No direct internet exposure for PostgreSQL, Redis, or Ollama

---

## [0.3.0] - 2025-12-28

### Added
- **Cloudflare Tunnel**: Secure connection from edge to DigitalOcean droplet
  - Tunnel ID: 4b670c72-305e-4720-8531-391c003bbdb3
  - 4 connections established (fra03, fra10, fra16, fra18)
- **DNS Records**: ollama.efremov.help, api.efremov.help configured
- **D1 audit_logs table**: Request logging for API calls

### Endpoints Live
- `https://api.efremov.help/health` - Health check
- `https://api.efremov.help/api/chat` - Chat with LLM
- `https://api.efremov.help/api/models` - List available models
- `https://api.efremov.help/api/embeddings` - Generate embeddings
- `https://ollama.efremov.help` - Direct Ollama API access

### Tested
- Full end-to-end flow: User → CloudFlare Worker → Tunnel → Ollama → Response

---

## [0.2.0] - 2025-12-28

### Added
- **PostgreSQL Schema**: Users, documents, conversations, messages, agent_tasks tables
- **pgvector Extension**: Vector similarity search with IVFFlat index
- **Ollama Model**: llama3.2:1b (1.3GB) downloaded and tested
- **Landing Page**: index.html with gradient hero, feature grid, live demo

### Database Tables
- `users` - Synced from Supabase
- `documents` - RAG content with vector(1536) embeddings  
- `conversations` - Chat history
- `messages` - Individual messages with token tracking
- `agent_tasks` - Async job queue

---

## [0.1.0] - 2025-12-28

### Added
- Initial project structure
- **GitHub Repository**: mindnetworksassociation-collab/ai-platform
- **CloudFlare Workers**: API Gateway, MCP Search API
- **Docker Stack**: PostgreSQL+pgvector, Redis, Ollama
- **DigitalOcean Droplet**: llm-blackbox (164.92.231.18, fra1, 4GB)

### Architecture
```
CloudFlare Edge (Free Tier)
├── Workers: API Gateway, Auth Proxy
├── D1: Session storage, audit logs
├── KV: Cache, rate limiting
└── Pages: Landing, dashboard SPA

DigitalOcean Backend ($24/mo)
├── PostgreSQL + pgvector
├── Redis
└── Ollama (llama3.2:1b)

Supabase (Free Tier)
├── Auth (OAuth, JWT)
└── RLS policies
```
