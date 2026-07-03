import express from 'express';
import cors from 'cors';
import './db.js';
import { router } from './routes.js';
import { marketData } from './marketData/index.js';

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api', router);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, dataProvider: marketData.name });
});

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = Number(process.env.PORT) || 4000;
app.listen(PORT, () => {
  console.log(`Yoo trading sim server listening on :${PORT} (data: ${marketData.name})`);
});
