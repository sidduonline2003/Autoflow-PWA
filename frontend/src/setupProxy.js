const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  console.log('[proxy] setupProxy loaded');
  const apiProxy = createProxyMiddleware({
    target: 'http://localhost:8000',
    changeOrigin: true,
    secure: false,
    xfwd: true,
    logLevel: 'debug',
    // IMPORTANT: do NOT strip /api - removed pathRewrite
    onProxyReq: (proxyReq, req, res) => {
      // Add request time for debugging
      req.startTime = Date.now();
      
      // Explicitly forward Authorization and other important headers
      if (req.headers['authorization']) {
        proxyReq.setHeader('authorization', req.headers['authorization']);
      }
      if (req.headers['cookie']) {
        proxyReq.setHeader('cookie', req.headers['cookie']);
      }
      
      console.log(`[PROXY] ${req.method} ${req.path} -> ${proxyReq.path}`);
      if (req.headers['authorization']) {
        console.log(`[PROXY] Forwarding Authorization header: ${req.headers['authorization'].substring(0, 20)}...`);
      }
    },
    onProxyRes: (proxyRes, req, res) => {
      const duration = Date.now() - req.startTime;
      console.log(`[PROXY] ${req.method} ${req.path} -> ${proxyRes.statusCode} (${duration}ms)`);
    },
    onError: (err, req, res) => {
      console.error('[PROXY ERROR]', err);
      res.writeHead(500, {
        'Content-Type': 'application/json'
      });
      res.end(JSON.stringify({ 
        message: 'Proxy error - Backend server may be offline or not responding', 
        error: err.message 
      }));
    }
  });

  // Apply the proxy to /api routes
  app.use('/api', apiProxy);
  
  // Catch all other routes and warn about them
  app.use('/*', (req, res, next) => {
    if (!req.url.startsWith('/static/') && 
        !req.url.startsWith('/sockjs-node/') && 
        !req.url.startsWith('/favicon.ico') && 
        !req.url.startsWith('/manifest.json') && 
        !req.url.startsWith('/logo')) {
      console.log(`[Non-proxied request] ${req.method} ${req.url}`);
    }
    next();
  });
};
