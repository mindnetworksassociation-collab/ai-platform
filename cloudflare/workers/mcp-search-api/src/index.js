/**
 * MCP Search API - CloudFlare Worker
 * DuckDuckGo search without API keys
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Content-Type': 'application/json'
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      if (path === '/health' || path === '/') {
        return json({ status: 'ok', service: 'mcp-search-api' }, corsHeaders);
      }

      if (path === '/search') {
        const query = url.searchParams.get('q');
        const count = parseInt(url.searchParams.get('count') || '10');
        if (!query) return json({ error: 'Missing q parameter' }, corsHeaders, 400);
        
        const results = await duckduckgoSearch(query, count);
        return json({ query, count: results.length, results }, corsHeaders);
      }

      if (path === '/news') {
        const query = url.searchParams.get('q');
        const count = parseInt(url.searchParams.get('count') || '10');
        if (!query) return json({ error: 'Missing q parameter' }, corsHeaders, 400);
        
        const results = await duckduckgoNews(query, count);
        return json({ query, count: results.length, results }, corsHeaders);
      }

      if (path === '/fetch') {
        const targetUrl = url.searchParams.get('url');
        if (!targetUrl) return json({ error: 'Missing url parameter' }, corsHeaders, 400);
        
        const content = await fetchPage(targetUrl);
        return json(content, corsHeaders);
      }

      return json({ error: 'Not found' }, corsHeaders, 404);
    } catch (error) {
      return json({ error: error.message }, corsHeaders, 500);
    }
  }
};

function json(data, headers, status = 200) {
  return new Response(JSON.stringify(data), { status, headers });
}

function decodeUrl(url) {
  // Handle DuckDuckGo redirect URLs
  if (url.includes('duckduckgo.com/l/?uddg=')) {
    const match = url.match(/uddg=([^&]+)/);
    if (match) {
      return decodeURIComponent(match[1]);
    }
  }
  // Clean up relative URLs
  if (url.startsWith('//')) {
    return 'https:' + url;
  }
  return url;
}

function decodeHtml(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#92;/g, '\\')
    .replace(/<[^>]+>/g, '');
}

async function duckduckgoSearch(query, count = 10) {
  const resp = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' }
  });
  const html = await resp.text();
  
  const results = [];
  // Match result links and snippets
  const resultRegex = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
  
  let match;
  while ((match = resultRegex.exec(html)) && results.length < count) {
    const url = decodeUrl(match[1]);
    if (url && !url.includes('duckduckgo.com')) {
      results.push({
        title: decodeHtml(match[2]).trim(),
        url: url,
        description: decodeHtml(match[3]).trim()
      });
    }
  }
  
  return results;
}

async function duckduckgoNews(query, count = 10) {
  const resp = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&iar=news&ia=news`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' }
  });
  const html = await resp.text();
  
  const results = [];
  const resultRegex = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
  
  let match;
  while ((match = resultRegex.exec(html)) && results.length < count) {
    const url = decodeUrl(match[1]);
    if (url && !url.includes('duckduckgo.com')) {
      results.push({
        title: decodeHtml(match[2]).trim(),
        url: url,
        description: decodeHtml(match[3]).trim()
      });
    }
  }
  
  return results;
}

async function fetchPage(url) {
  const resp = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
    redirect: 'follow'
  });
  
  const html = await resp.text();
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = titleMatch ? decodeHtml(titleMatch[1]).trim() : '';
  
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<[^>]+>/g, '\n');
  
  text = decodeHtml(text);
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0).slice(0, 200);
  
  return { url, title, content: lines.join('\n') };
}
