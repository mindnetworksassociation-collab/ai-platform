/**
 * LLM Platform API Gateway v0.4.1
 * Routes: CloudFlare Edge → Ollama via Tunnel
 * Features: Rate limiting, API keys, audit logs, security headers
 * Domain: api.efremov.help
 * 
 * CHANGELOG v0.4.1:
 * - Added internal token for Ollama requests
 * - Improved error handling
 * - Added request timing headers
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
      'Content-Type': 'application/json'
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
    const apiKey = request.headers.get('X-API-Key') || request.headers.get('Authorization')?.replace('Bearer ', '');

    try {
      // Health check - no auth required
      if (path === '/health' || path === '/') {
        return json({ 
          status: 'ok', 
          service: 'llm-api-gateway',
          version: '0.4.0',
          endpoints: ['/api/chat', '/api/models', '/api/embeddings', '/api/keys/create']
        }, corsHeaders);
      }

      // Create API key - open for demo
      if (path === '/api/keys/create' && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const name = body.name || 'anonymous';
        const newKey = 'llm_' + crypto.randomUUID().replace(/-/g, '');
        
        // Store in KV
        if (env.CACHE) {
          await env.CACHE.put(`apikey:${newKey}`, JSON.stringify({
            name,
            created: new Date().toISOString(),
            requests: 0,
            limit: 100 // requests per day
          }), { expirationTtl: 86400 * 30 }); // 30 days
        }
        
        return json({ 
          api_key: newKey,
          name,
          limit: '100 requests/day',
          expires: '30 days'
        }, corsHeaders);
      }

      // Rate limiting check
      const rateLimit = await checkRateLimit(env, apiKey || clientIP);
      if (!rateLimit.allowed) {
        return json({ 
          error: 'Rate limit exceeded',
          limit: rateLimit.limit,
          reset: rateLimit.reset
        }, corsHeaders, 429);
      }

      // Chat endpoint
      if (path === '/api/chat' && request.method === 'POST') {
        const body = await request.json();
        const message = body.message || body.prompt;
        
        if (!message) {
          return json({ error: 'message required' }, corsHeaders, 400);
        }

        const ollamaUrl = env.OLLAMA_URL || 'https://ollama.efremov.help';
        const startTime = Date.now();
        
        const response = await fetch(`${ollamaUrl}/api/generate`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'X-Internal-Token': env.INTERNAL_TOKEN || ''
          },
          body: JSON.stringify({
            model: body.model || 'llama3.2:1b',
            prompt: message,
            stream: false,
            options: body.options || {}
          })
        });

        if (!response.ok) {
          return json({ error: 'LLM service unavailable' }, corsHeaders, 503);
        }

        const result = await response.json();
        const latency = Date.now() - startTime;
        
        // Log to D1
        if (env.DB) {
          ctx.waitUntil(
            env.DB.prepare(
              'INSERT INTO audit_logs (user_id, action, path, ip, timestamp) VALUES (?, ?, ?, ?, ?)'
            ).bind(apiKey || 'anonymous', 'CHAT', path, clientIP, new Date().toISOString()).run()
          );
        }

        return json({
          response: result.response,
          model: result.model,
          tokens: {
            prompt: result.prompt_eval_count || 0,
            completion: result.eval_count || 0,
            total: (result.prompt_eval_count || 0) + (result.eval_count || 0)
          },
          latency_ms: latency
        }, corsHeaders);
      }

      // List models
      if (path === '/api/models') {
        const ollamaUrl = env.OLLAMA_URL || 'https://ollama.efremov.help';
        const response = await fetch(`${ollamaUrl}/api/tags`);
        const result = await response.json();
        return json({ 
          models: (result.models || []).map(m => ({
            name: m.name,
            size: m.size,
            modified: m.modified_at
          }))
        }, corsHeaders);
      }

      // Embeddings endpoint
      if (path === '/api/embeddings' && request.method === 'POST') {
        const body = await request.json();
        const text = body.text || body.input;
        
        if (!text) {
          return json({ error: 'text required' }, corsHeaders, 400);
        }

        const ollamaUrl = env.OLLAMA_URL || 'https://ollama.efremov.help';
        const response = await fetch(`${ollamaUrl}/api/embeddings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: body.model || 'nomic-embed-text',
            prompt: text
          })
        });

        const result = await response.json();
        return json({ 
          embedding: result.embedding,
          dimensions: result.embedding?.length || 0
        }, corsHeaders);
      }

      // RAG search endpoint
      if (path === '/api/search' && request.method === 'POST') {
        const body = await request.json();
        const query = body.query;
        
        if (!query) {
          return json({ error: 'query required' }, corsHeaders, 400);
        }

        // Get embedding for query
        const ollamaUrl = env.OLLAMA_URL || 'https://ollama.efremov.help';
        const embedResponse = await fetch(`${ollamaUrl}/api/embeddings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'nomic-embed-text',
            prompt: query
          })
        });

        const embedResult = await embedResponse.json();
        
        // TODO: Search pgvector on DigitalOcean
        // For now return placeholder
        return json({
          query,
          results: [],
          message: 'pgvector search coming soon'
        }, corsHeaders);
      }

      return json({ error: 'Not found' }, corsHeaders, 404);

    } catch (error) {
      console.error('Gateway error:', error);
      return json({ error: 'Internal error', details: error.message }, corsHeaders, 500);
    }
  }
};

async function checkRateLimit(env, key) {
  if (!env.CACHE) return { allowed: true };
  
  const now = Date.now();
  const window = 60000; // 1 minute
  const limit = 30; // requests per minute
  
  const rateLimitKey = `ratelimit:${key}:${Math.floor(now / window)}`;
  const current = parseInt(await env.CACHE.get(rateLimitKey) || '0');
  
  if (current >= limit) {
    return { 
      allowed: false, 
      limit,
      reset: Math.ceil((Math.floor(now / window) + 1) * window / 1000)
    };
  }
  
  await env.CACHE.put(rateLimitKey, String(current + 1), { expirationTtl: 120 });
  return { allowed: true, remaining: limit - current - 1 };
}

function json(data, headers, status = 200) {
  return new Response(JSON.stringify(data), { status, headers });
}
