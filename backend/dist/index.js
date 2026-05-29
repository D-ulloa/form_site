import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import propertiesRouter from './routes/properties.js';
dotenv.config();
const app = express();
const PORT = process.env.PORT ?? 3001;
// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
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
// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`[server] Running on http://localhost:${PORT}`);
});
//# sourceMappingURL=index.js.map