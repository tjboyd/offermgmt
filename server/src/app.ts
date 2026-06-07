import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import path from 'path';

import authRouter         from './routes/auth';
import usersRouter        from './routes/users';
import integrationsRouter from './routes/integrations';
import seExplorerRouter   from './routes/seExplorer';
import syncRouter         from './routes/sync';
import teamsRouter           from './routes/teams';
import seasonsRouter         from './routes/seasons';
import playersRouter         from './routes/players';
import configRouter          from './routes/config';
import dashboardRouter       from './routes/dashboard';
import offersRouter          from './routes/offers';
import emailTemplatesRouter  from './routes/emailTemplates';
import publicRouter          from './routes/public';
import wizardRouter from './routes/wizard';
import brandingRouter        from './routes/branding';
import csvImportRouter       from './routes/csvImport';
import divisionsRouter       from './routes/divisions';

export function createApp() {
  const app = express();

  // ─── Health check (must be first — before HTTPS redirect) ────────────────────
  app.get('/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

  // ─── Security ────────────────────────────────────────────────────────────────
  app.use(helmet({
    // Allow inline scripts for the server-rendered acceptance landing page
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc:  ["'self'"],
        styleSrc:   ["'self'", "'unsafe-inline'"],
        imgSrc:     ["'self'", 'data:'],
      },
    },
  }));

  // HTTPS redirect in production
  if (process.env.NODE_ENV === 'production') {
    app.use((req, res, next) => {
      if (req.headers['x-forwarded-proto'] !== 'https') {
        return res.redirect(301, `https://${req.headers.host}${req.url}`);
      }
      next();
    });
  }

  // ─── CORS ─────────────────────────────────────────────────────────────────────
  app.use(cors({
    origin:      process.env.NODE_ENV === 'production'
                   ? (process.env.APP_BASE_URL ?? false)
                   : ['http://localhost:5173', 'http://localhost:3001'],
    credentials: true,
  }));

  // ─── Body parsing ─────────────────────────────────────────────────────────────
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false }));
  app.use(cookieParser());

  // ─── Rate limiting ────────────────────────────────────────────────────────────
  app.use('/api/v1/auth/login', rateLimit({
    windowMs: 15 * 60 * 1000, max: 10,
    message: { error: 'Too many login attempts. Try again in 15 minutes.' },
  }));

  app.use('/api/v1/auth/activate', rateLimit({
    windowMs: 60 * 60 * 1000, max: 10,
    message: { error: 'Too many activation attempts.' },
  }));

  app.use('/accept', rateLimit({
    windowMs: 60 * 1000, max: 30,
    message: 'Too many requests.',
  }));

  // ─── API routes ───────────────────────────────────────────────────────────────
  app.use('/api/v1/auth',         authRouter);
  app.use('/api/v1/users',        usersRouter);
  app.use('/api/v1/integrations', integrationsRouter);
  app.use('/api/v1/integrations/se-explorer', seExplorerRouter);
  app.use('/api/v1/sync',         syncRouter);
  app.use('/api/v1/teams',           teamsRouter);
  app.use('/api/v1/seasons',         seasonsRouter);
  app.use('/api/v1/players',         playersRouter);
  app.use('/api/v1/config',          configRouter);
  app.use('/api/v1/dashboard',       dashboardRouter);
  app.use('/api/v1/offers',          offersRouter);
  app.use('/api/v1/email-templates', emailTemplatesRouter);
  app.use('/api/v1/wizard',          wizardRouter);
  app.use('/api/v1/org/branding',    brandingRouter);
  app.use('/api/v1/import',          csvImportRouter);
  app.use('/api/v1/divisions',       divisionsRouter);
  // Public routes (no auth) — acceptance pages + webhooks
  app.use(publicRouter);

  // ─── Static SPA (production) ──────────────────────────────────────────────────
  if (process.env.NODE_ENV === 'production') {
    const staticPath = path.join(__dirname, '../../client/dist');
    app.use(express.static(staticPath));
    // SPA catch-all — must be last, after all API routes
    app.get(/^(?!\/api|\/accept|\/decline|\/webhooks).*/, (_req, res) => {
      res.sendFile(path.join(staticPath, 'index.html'));
    });
  }

  // ─── Error handler ────────────────────────────────────────────────────────────
  app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
