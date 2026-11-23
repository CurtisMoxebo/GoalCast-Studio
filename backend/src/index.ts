import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import gamesRoutes from './routes/games.routes';
import predictionsRoutes from './routes/predictions.routes';
import mediaRoutes from './routes/media.routes';
import videoRoutes from './routes/video.routes';
import socialRoutes from './routes/social.routes';

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json());

// Comprehensive Request Logger Middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  const time = new Date().toLocaleTimeString();
  const ip = req.ip || req.socket.remoteAddress || 'unknown';

  const queryStr = Object.keys(req.query).length > 0 ? ` ? ${JSON.stringify(req.query)}` : '';
  console.log(`\n[${time}] 🌐 INCOMING: ${req.method} ${req.originalUrl || req.url}${queryStr} (from ${ip})`);

  if ((req.method === 'POST' || req.method === 'PUT') && req.body && Object.keys(req.body).length > 0) {
    const bodyCopy = { ...req.body };
    if (Array.isArray(bodyCopy.games) && bodyCopy.games.length > 3) {
      console.log(`[${time}] 📦 Payload (${bodyCopy.games.length} games):`, JSON.stringify({
        ...bodyCopy,
        games: bodyCopy.games.slice(0, 2).concat([`... +${bodyCopy.games.length - 2} more games`] as any)
      }, null, 2));
    } else {
      console.log(`[${time}] 📦 Payload:`, JSON.stringify(bodyCopy, null, 2));
    }
  }

  res.on('finish', () => {
    const elapsed = Date.now() - start;
    const isError = res.statusCode >= 400;
    const badge = isError ? '❌' : '✅';
    console.log(`[${time}] ${badge} RESPONSE: ${req.method} ${req.originalUrl || req.url} -> ${res.statusCode} (${elapsed}ms)`);
  });

  next();
});

// API Routes
app.use('/api/games', gamesRoutes);
app.use('/api/predictions', predictionsRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api/video', videoRoutes);
app.use('/api/social', socialRoutes);
app.use('/', socialRoutes);

// Health Check
app.get('/api/health', (req: Request, res: Response) => {
  console.log(`[GoalCast Health] Health check pinged from ${req.ip || 'unknown'}`);
  res.json({
    status: 'ok',
    service: 'goalcast-studio-backend',
    timestamp: new Date().toISOString()
  });
});

// Global Error Handler Middleware
app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
  const time = new Date().toISOString();
  console.error(`\n[${time}] 💥 UNHANDLED EXPRESS ERROR on ${req.method} ${req.originalUrl || req.url}:`);
  console.error(`  Name: ${err?.name || 'Error'}`);
  console.error(`  Message: ${err?.message || err}`);
  if (err?.stack) console.error(`  Stack Trace:\n${err.stack}`);
  if (err?.errors) console.error(`  Details:`, JSON.stringify(err.errors, null, 2));
  console.error(`====================================================\n`);

  res.status(err.status || 500).json({
    error: err?.message || 'Internal Server Error',
    details: err?.details || undefined
  });
});

// Process-wide unhandled error handlers to guarantee logs are never lost in production
process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  console.error('\n🚨 [FATAL] Unhandled Promise Rejection at:', promise);
  console.error('   Reason:', reason?.stack || reason);
});

process.on('uncaughtException', (err: any) => {
  console.error('\n🚨 [FATAL] Uncaught Exception thrown:', err?.stack || err);
});

const isTest = process.env.NODE_ENV === 'test' || process.argv.some((arg) => arg.includes('test'));
if (!isTest) {
  const host = '0.0.0.0';
  app.listen(Number(port), host, () => {
    console.log(`====================================================`);
    console.log(`⚽ [GoalCast Studio Backend] Running on http://${host}:${port}`);
    console.log(`🔍 Health check: http://localhost:${port}/api/health`);
    console.log(`🎥 Video Test:  http://localhost:${port}/api/video/test`);
    console.log(`📡 Ready to receive connections from mobile app & LAN`);
    console.log(`====================================================\n`);
  });
}

export default app;
