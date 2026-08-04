import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import propertiesRouter from './routes/properties.js';
import contractsRouter from './routes/contracts.js';
import contractEntriesRouter from './routes/contractEntries.js';
import contractPasswordAuthRouter from './routes/contractPasswordAuth.js';
import { parseTrustProxyHops } from './utils/serverConfig.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT ?? 3001;
const trustProxyHops = parseTrustProxyHops(process.env.TRUST_PROXY_HOPS);
const corsOrigin = process.env.NODE_ENV === 'production'
  ? process.env.CONTRACT_PUBLIC_BASE_URL?.trim() || false
  : true;

if (trustProxyHops > 0) {
  app.set('trust proxy', trustProxyHops);
}

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json({ limit: '256kb' }));

// Strip Vercel's experimentalServices route prefix if present
app.use((req, _res, next) => {
  if (req.url.startsWith('/_/backend')) {
    req.url = req.url.replace('/_/backend', '');
  }
  next();
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.use('/properties', propertiesRouter);
app.use('/api/contracts', contractEntriesRouter);
app.use('/api/contracts', contractsRouter);
app.use('/api/auth', contractPasswordAuthRouter);

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[server] Running on http://localhost:${PORT}`);
});
