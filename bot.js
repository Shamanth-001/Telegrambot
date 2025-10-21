import 'dotenv/config';
import { logger } from './src/logger.js';
import { startBot } from './src/bot/index.js';
import { startHealthServer } from './src/health.js';

// Simple CLI args parser to allow --token and --health-port overrides
const argv = process.argv.slice(2);
let cliToken = null;
let cliHealthPort = null;
for (const arg of argv) {
  if (arg.startsWith('--token=')) cliToken = arg.slice('--token='.length).trim();
  if (arg.startsWith('--health-port=')) cliHealthPort = Number(arg.slice('--health-port='.length));
}

// Accept BOT_TOKEN from env or CLI (CLI wins when provided)
const BOT_TOKEN = (cliToken || process.env.BOT_TOKEN || '').trim() || undefined;
const HEALTH_PORT = Number.isFinite(cliHealthPort) ? cliHealthPort : Number(process.env.HEALTH_PORT || 3000);

// Global error handlers
process.on('unhandledRejection', (err) => console.error('[UNHANDLED]', err));
process.on('uncaughtException', (err) => console.error('[EXCEPTION]', err));

async function main() {
  try {
    if (!BOT_TOKEN) {
      throw new Error('BOT_TOKEN is required');
    }
    console.log('[DEBUG] Using token suffix:', '****' + BOT_TOKEN.slice(-4));
    console.log('[DEBUG] Health port:', HEALTH_PORT);

    await startBot(BOT_TOKEN);
    await startHealthServer(HEALTH_PORT);

    logger.info('Bot and health server started');
  } catch (error) {
    logger.error('Fatal startup error', { error: error?.stack || String(error) });
    process.exit(1);
  }
}

main();


