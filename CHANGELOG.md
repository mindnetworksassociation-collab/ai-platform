# CHANGELOG

All notable changes to this project will be documented in this file.

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
