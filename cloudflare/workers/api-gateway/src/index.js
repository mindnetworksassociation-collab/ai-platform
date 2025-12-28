/**
 * LLM Platform API Gateway
 * Handles authentication, rate limiting, and routing to backend services
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
      'Content-Type': 'application/json'
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Get client IP for audit
    const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
    const userAgent = request.headers.get('User-Agent') || 'unknown';

    try {
      // Health check
      if (path === '/health' || path === '/') {
        return json({ 
          status: 'ok', 
          service: 'llm-api-gateway',
          timestamp: new Date().toISOString()
        }, corsHeaders);
      }

      // Auth routes (no authentication required)
      if (path.startsWith('/auth/')) {
        return handleAuth(path, request, env, corsHeaders);
      }

      // All other routes require authentication
      const authResult = await authenticate(request, env);
      if (!authResult.success) {
        await logAudit(env.DB, null, 'AUTH_FAILED', path, clientIP, userAgent, authResult.error);
        return json({ error: authResult.error }, corsHeaders, 401);
      }

      const userId = authResult.userId;

      // Rate limiting
      const rateLimitKey = `rate:${userId}:${Math.floor(Date.now() / 60000)}`;
      const currentCount = parseInt(await env.CACHE.get(rateLimitKey) || '0');
      
      if (currentCount >= 100) { // 100 requests per minute
        await logAudit(env.DB, userId, 'RATE_LIMITED', path, clientIP, userAgent, null);
        return json({ error: 'Rate limit exceeded' }, corsHeaders, 429);
      }
      
      await env.CACHE.put(rateLimitKey, String(currentCount + 1), { expirationTtl: 60 });

      // Route to appropriate handler
      let response;
      
      if (path.startsWith('/api/chat')) {
        response = await handleChat(path, request, env, userId);
      } else if (path.startsWith('/api/search')) {
        response = await handleSearch(path, request, env, userId);
      } else if (path.startsWith('/api/documents')) {
        response = await handleDocuments(path, request, env, userId);
      } else if (path.startsWith('/api/agents')) {
        response = await handleAgents(path, request, env, userId);
      } else {
        response = { error: 'Not found' };
        await logAudit(env.DB, userId, 'NOT_FOUND', path, clientIP, userAgent, null);
        return json(response, corsHeaders, 404);
      }

      await logAudit(env.DB, userId, 'API_CALL', path, clientIP, userAgent, JSON.stringify({ method: request.method }));
      return json(response, corsHeaders);

    } catch (error) {
      console.error('Gateway error:', error);
      return json({ error: 'Internal server error' }, corsHeaders, 500);
    }
  }
};

function json(data, headers, status = 200) {
  return new Response(JSON.stringify(data), { status, headers });
}

async function authenticate(request, env) {
  // Check API Key
  const apiKey = request.headers.get('X-API-Key');
  if (apiKey) {
    const keyHash = await hashKey(apiKey);
    const result = await env.DB.prepare(
      'SELECT user_id FROM api_keys WHERE key_hash = ?'
    ).bind(keyHash).first();
    
    if (result) {
      await env.DB.prepare(
        'UPDATE api_keys SET last_used_at = CURRENT_TIMESTAMP WHERE key_hash = ?'
      ).bind(keyHash).run();
      return { success: true, userId: result.user_id };
    }
  }

  // Check Bearer token (Supabase JWT)
  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    // Verify with Supabase or local session
    const session = await env.DB.prepare(
      'SELECT user_id FROM sessions WHERE token = ? AND expires_at > CURRENT_TIMESTAMP'
    ).bind(token).first();
    
    if (session) {
      return { success: true, userId: session.user_id };
    }
  }

  return { success: false, error: 'Invalid authentication' };
}

async function hashKey(key) {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function logAudit(db, userId, action, resource, ip, userAgent, details) {
  try {
    await db.prepare(`
      INSERT INTO audit_log (user_id, action, resource, ip, user_agent, details)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(userId, action, resource, ip, userAgent, details).run();
  } catch (e) {
    console.error('Audit log error:', e);
  }
}

async function handleAuth(path, request, env, headers) {
  if (path === '/auth/register' && request.method === 'POST') {
    const body = await request.json();
    const { email } = body;
    
    if (!email) {
      return json({ error: 'Email required' }, headers, 400);
    }

    const userId = crypto.randomUUID();
    try {
      await env.DB.prepare(
        'INSERT INTO users (id, email) VALUES (?, ?)'
      ).bind(userId, email).run();
      
      // Create API key
      const apiKey = `llm_${crypto.randomUUID().replace(/-/g, '')}`;
      const keyHash = await hashKey(apiKey);
      
      await env.DB.prepare(
        'INSERT INTO api_keys (id, user_id, name, key_hash) VALUES (?, ?, ?, ?)'
      ).bind(crypto.randomUUID(), userId, 'default', keyHash).run();

      return json({ 
        userId, 
        apiKey,
        message: 'Save your API key - it will not be shown again'
      }, headers, 201);
    } catch (e) {
      if (e.message.includes('UNIQUE')) {
        return json({ error: 'Email already exists' }, headers, 409);
      }
      throw e;
    }
  }

  if (path === '/auth/login' && request.method === 'POST') {
    // Simplified login - in production use Supabase Auth
    const body = await request.json();
    const { email } = body;
    
    const user = await env.DB.prepare(
      'SELECT id FROM users WHERE email = ?'
    ).bind(email).first();
    
    if (!user) {
      return json({ error: 'User not found' }, headers, 404);
    }

    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    
    await env.DB.prepare(
      'INSERT INTO sessions (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)'
    ).bind(crypto.randomUUID(), user.id, token, expiresAt).run();

    return json({ token, expiresAt }, headers);
  }

  return json({ error: 'Not found' }, headers, 404);
}

async function handleChat(path, request, env, userId) {
  // Proxy to DigitalOcean backend (Ollama)
  // For now return placeholder
  if (request.method === 'POST') {
    const body = await request.json();
    return {
      message: 'Chat endpoint ready',
      note: 'Connect to DigitalOcean Ollama backend',
      received: body
    };
  }
  return { error: 'Method not allowed' };
}

async function handleSearch(path, request, env, userId) {
  const url = new URL(request.url);
  const query = url.searchParams.get('q');
  
  if (!query) {
    return { error: 'Query parameter required' };
  }

  try {
    // Use Service Binding to call search worker
    if (env.SEARCH) {
      const searchUrl = new URL('https://fake.host/search');
      searchUrl.searchParams.set('q', query);
      searchUrl.searchParams.set('count', '10');
      
      const response = await env.SEARCH.fetch(searchUrl.toString());
      const data = await response.json();
      return data;
    }
    
    return { error: 'Search service not available' };
  } catch (error) {
    console.error('Search error:', error);
    return { error: 'Search failed', details: error.message };
  }
}

async function handleDocuments(path, request, env, userId) {
  // R2 document storage - placeholder
  return {
    message: 'Documents endpoint ready',
    note: 'Connect to R2 storage'
  };
}

async function handleAgents(path, request, env, userId) {
  // Agent orchestration - placeholder  
  return {
    message: 'Agents endpoint ready',
    note: 'Connect to n8n/agent backend'
  };
}
