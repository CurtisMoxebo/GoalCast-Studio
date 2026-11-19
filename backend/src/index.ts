import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'goalcast-studio-backend',
    timestamp: new Date().toISOString()
  });
});

app.listen(port, () => {
  console.log(`[GoalCast Backend] Server running on port ${port}`);
});

export default app;
