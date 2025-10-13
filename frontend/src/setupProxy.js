const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  console.log('[proxy] setupProxy loaded');
  
  // Use environment variable for backend URL or fallback to localhost
  const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8000';
  console.log('[proxy] Backend URL:', backendUrl);
  
  const apiProxy = createProxyMiddleware({
    target: backendUrl,
    changeOrigin: true,
    secure: false,
    xfwd: true,
    logLevel: 'warn', // Reduced from 'debug' to minimize console noise
    timeout: 10000, // 10 second timeout instead of indefinite
    proxyTimeout: 10000, // 10 second proxy timeout
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
      
      // Only log in development for important requests
      if (process.env.NODE_ENV === 'development') {
        console.log(`[PROXY] ${req.method} ${req.path}`);
      }
    },
    onProxyRes: (proxyRes, req, res) => {
      const duration = Date.now() - req.startTime;
      // Only log slow requests (>1s) or errors
      if (duration > 1000 || proxyRes.statusCode >= 400) {
        console.log(`[PROXY] ${req.method} ${req.path} -> ${proxyRes.statusCode} (${duration}ms)`);
      }
    },
    onError: (err, req, res) => {
      console.error('[PROXY ERROR]', err.message);
      // Respond quickly instead of hanging
      if (!res.headersSent) {
        res.writeHead(503, {
          'Content-Type': 'application/json'
        });
        res.end(JSON.stringify({ 
          message: 'Backend server unavailable', 
          error: 'The backend server is not responding. Please ensure it is running on port 8000.',
          hint: 'Check if backend is started with: cd backend && python manage.py runserver'
        }));
      }
    }
  });

  // Apply the proxy to /api routes
  app.use('/api', apiProxy);
};
