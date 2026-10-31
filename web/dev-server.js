const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const { initIndexes } = require('./lib/mongodb');

const PORT = process.env.PORT || 3000;

// Handlers
const clerkConfigHandler = require('./api/auth/clerk-config');
const clerkFlowHandler = require('./api/auth/clerk-flow');
const authMeHandler = require('./api/auth/me');
const conversationsHandler = require('./api/conversations/index');
const conversationDetailHandler = require('./api/conversations/[id]');
const chatHandler = require('./api/chat');
const uploadDocHandler = require('./api/documents/upload');
const docDetailHandler = require('./api/documents/[id]');
const usageStatusHandler = require('./api/usage/status');

const mimeTypes = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  req.query = parsedUrl.query;
  res.status = function(code) {
    res.statusCode = code;
    return res;
  };
  res.json = function(data) {
    const payload = JSON.stringify(data);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Length', Buffer.byteLength(payload));
    res.end(payload);
    return res;
  };

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-dev-user-id, x-clerk-auth-token, x-user-email');

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.setHeader('Content-Length', 0);
    return res.end();
  }

  // Parse JSON bodies only for POST/PUT/PATCH with application/json
  if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.headers['content-type'] && req.headers['content-type'].includes('application/json')) {
    let bodyData = '';
    req.on('data', chunk => { bodyData += chunk; });
    await new Promise(resolve => req.on('end', resolve));
    try {
      req.body = bodyData ? JSON.parse(bodyData) : {};
    } catch (e) {
      req.body = {};
    }
  }

  try {
    // API Routing
    if (pathname === '/api/auth/clerk-config') {
      return await clerkConfigHandler(req, res);
    }
    if (pathname === '/api/auth/clerk-flow') {
      return await clerkFlowHandler(req, res);
    }
    if (pathname === '/api/auth/me') {
      return await authMeHandler(req, res);
    }
    if (pathname === '/api/conversations') {
      return await conversationsHandler(req, res);
    }
    const convMatch = pathname.match(/^\/api\/conversations\/([^/]+)$/);
    if (convMatch) {
      req.query.id = convMatch[1];
      return await conversationDetailHandler(req, res);
    }
    if (pathname === '/api/chat') {
      return await chatHandler(req, res);
    }
    if (pathname === '/api/documents/upload') {
      return await uploadDocHandler(req, res);
    }
    const docMatch = pathname.match(/^\/api\/documents\/([^/]+)(\/raw)?$/);
    if (docMatch) {
      req.query.id = docMatch[1];
      if (docMatch[2]) req.query.raw = 'true';
      return await docDetailHandler(req, res);
    }
    if (pathname === '/api/usage/status') {
      return await usageStatusHandler(req, res);
    }

    // Static Files (Web Frontend from public/)
    let filePath = path.join(__dirname, 'public', pathname === '/' ? 'index.html' : pathname);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath);
      const contentType = mimeTypes[ext] || 'application/octet-stream';
      const fileStat = fs.statSync(filePath);
      res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Length': fileStat.size
      });
      return fs.createReadStream(filePath).pipe(res);
    }

    // Default 404
    res.statusCode = 404;
    res.json({ error: 'Not found: ' + pathname });
  } catch (err) {
    console.error('[Server Error]', err);
    res.statusCode = 500;
    res.json({ error: 'Internal Server Error: ' + err.message });
  }
});

initIndexes().then(() => {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[LegalHelp Backend] Running on http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('Failed to initialize MongoDB indexes, starting server anyway:', err.message);
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[LegalHelp Backend] Running on http://localhost:${PORT}`);
  });
});
