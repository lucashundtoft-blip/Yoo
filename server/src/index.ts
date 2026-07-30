import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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

// In production (single-service deploys like Render), serve the built client
// so the whole app runs from one process. In dev, Vite serves the client.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = Number(process.env.PORT) || 4000;
app.listen(PORT, () => {
  console.log(`Yoo trading sim server listening on :${PORT} (data: ${marketData.name})`);
});
