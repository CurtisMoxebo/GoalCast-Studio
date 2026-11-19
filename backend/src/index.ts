import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';

import gamesRoutes from './routes/games.routes';
import predictionsRoutes from './routes/predictions.routes';
import mediaRoutes from './routes/media.routes';
import videoRoutes from './routes/video.routes';

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json());

// API Routes
app.use('/api/games', gamesRoutes);
app.use('/api/predictions', predictionsRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api/video', videoRoutes);

// Health Check
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'goalcast-studio-backend',
    timestamp: new Date().toISOString()
  });
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(port, () => {
    console.log(`[GoalCast Backend] Server running on port ${port}`);
    console.log(`[GoalCast Backend] Health check: http://localhost:${port}/api/health`);
    console.log(`[GoalCast Backend] Video Test:  http://localhost:${port}/api/video/test`);
  });
}

export default app;
