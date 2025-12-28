/**
 * Ollama Proxy Worker
 * Protects direct Ollama access - requires internal token
 * Public users should use api.efremov.help instead
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // Allow health check
    if (url.pathname === '/' || url.pathname === '/health') {
      return new Response(JSON.stringify({
        status: 'protected',
        message: 'Use api.efremov.help for public access'
      }), { 
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Check internal service token
    const authHeader = request.headers.get('X-Internal-Token');
    const internalToken = env.INTERNAL_TOKEN;
    
    if (!internalToken || authHeader !== internalToken) {
      return new Response(JSON.stringify({
        error: 'Unauthorized',
        message: 'Direct Ollama access requires internal token. Use api.efremov.help for public API.'
      }), { 
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Proxy to tunnel (this worker sits in front)
    const response = await fetch(request);
    return response;
  }
};
