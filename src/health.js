import express from 'express';
import helmet from 'helmet';
import client from 'prom-client';
import { logger } from './logger.js';
import { checkSourceAvailability } from './status.js';
import { http } from './http.js';
// Removed unused imports for Einthusan functionality

const collectDefaultMetrics = client.collectDefaultMetrics;
collectDefaultMetrics();

// Removed Einthusan functionality - it was too problematic with geo-blocking

export async function startHealthServer(port) {
  const app = express();
  app.use(helmet());

  app.get('/health', async (_req, res) => {
    try {
      const sources = await checkSourceAvailability();
      const health = {
        sources,
        memory: process.memoryUsage(),
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
      };
      res.json(health);
    } catch (e) {
      res.status(500).json({ ok: false });
    }
  });


  app.get('/metrics', async (_req, res) => {
    res.set('Content-Type', client.register.contentType);
    res.end(await client.register.metrics());
  });

  // Removed Einthusan download proxy - it was too problematic with geo-blocking
  app.get('/download', async (req, res) => {
    res.status(410).json({ ok: false, error: 'Einthusan functionality has been removed due to geo-blocking issues' });
  });

  // Removed Einthusan endpoints - they were too problematic with geo-blocking
  app.get('/estream', async (req, res) => {
    res.status(410).json({ ok: false, error: 'Einthusan functionality has been removed due to geo-blocking issues' });
  });

  app.get('/torrent', async (req, res) => {
    res.status(410).json({ ok: false, error: 'Einthusan functionality has been removed due to geo-blocking issues' });
  });

  // All Einthusan functionality removed due to geo-blocking issues

  return new Promise((resolve) => {
    app.listen(port, () => {
      logger.info(`Health server listening on :${port}`);
      resolve();
    });
  });
}


