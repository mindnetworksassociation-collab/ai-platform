/**
 * LLM Platform API Gateway
 * Routes: CloudFlare Edge → Ollama via Tunnel
 * Domain: efremov.help
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

    try {
      // Health check
      if (path === '/health' || path === '/') {
        return json({ 
          status: 'ok', 
          service: 'llm-api-gateway',
          version: '0.2.0',
          endpoints: ['/api/chat', '/api/models', '/api/embeddings']
        }, corsHeaders);
      }

      // Chat endpoint - proxy to Ollama
      if (path === '/api/chat' && request.method === 'POST') {
        const body = await request.json();
        const message = body.message || body.prompt;
        
        if (!message) {
          return json({ error: 'message required' }, corsHeaders, 400);
        }

        // Call Ollama via tunnel
        const ollamaUrl = env.OLLAMA_URL || 'https://ollama.efremov.help';
        const response = await fetch(`${ollamaUrl}/api/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: body.model || 'llama3.2:1b',
            prompt: message,
            stream: false
          })
        });

        if (!response.ok) {
          return json({ error: 'LLM service unavailable' }, corsHeaders, 503);
        }

        const result = await response.json();
        
        // Log to D1
        if (env.DB) {
          await env.DB.prepare(
            'INSERT INTO audit_logs (user_id, action, path, ip, timestamp) VALUES (?, ?, ?, ?, ?)'
          ).bind('anonymous', 'CHAT', path, clientIP, new Date().toISOString()).run();
        }

        return json({
          response: result.response,
          model: result.model,
          tokens: result.prompt_eval_count + (result.eval_count || 0)
        }, corsHeaders);
      }

      // List models
      if (path === '/api/models') {
        const ollamaUrl = env.OLLAMA_URL || 'https://ollama.efremov.help';
        const response = await fetch(`${ollamaUrl}/api/tags`);
        const result = await response.json();
        return json({ models: result.models || [] }, corsHeaders);
      }

      // Embeddings endpoint (for RAG)
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
            model: body.model || 'llama3.2:1b',
            prompt: text
          })
        });

        const result = await response.json();
        return json({ embedding: result.embedding }, corsHeaders);
      }

      return json({ error: 'Not found' }, corsHeaders, 404);

    } catch (error) {
      console.error('Gateway error:', error);
      return json({ error: 'Internal error', details: error.message }, corsHeaders, 500);
    }
  }
};

function json(data, headers, status = 200) {
  return new Response(JSON.stringify(data), { status, headers });
}
