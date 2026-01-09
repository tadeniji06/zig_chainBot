import { config } from './config/index.js';
import { logger } from './utils/logger.js';
import { initDatabase } from './database/index.js';
import { zigchainService } from './services/zigchain.js';
import { tokenMonitor } from './services/tokenMonitor.js';
import { sniperService } from './services/sniper.js';
import { createBot } from './bot/index.js';
import { setupNotifications } from './bot/notifications.js';
import fs from 'fs';
import path from 'path';

const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

async function main(): Promise<void> {
  logger.info('🚀 Starting ZigChain Sniper Bot...');

  try {
    initDatabase();
    logger.info('✅ Database initialized');

    await zigchainService.connect();
    logger.info('✅ Connected to ZigChain');

    const bot = createBot();
    logger.info('✅ Bot created');

    setupNotifications(bot);
    logger.info('✅ Notifications configured');

    await tokenMonitor.start();
    logger.info('✅ Token monitor started');

    await sniperService.start();
    logger.info('✅ Sniper service started');

    process.once('SIGINT', async () => {
      logger.info('Shutting down...');
      bot.stop();
      tokenMonitor.stop();
      sniperService.stop();
      await zigchainService.disconnect();
      process.exit(0);
    });

    process.once('SIGTERM', async () => {
      logger.info('Shutting down...');
      bot.stop();
      tokenMonitor.stop();
      sniperService.stop();
      await zigchainService.disconnect();
      process.exit(0);
    });

    await bot.start({
      onStart: (botInfo) => {
        logger.info(`✅ Bot started as @${botInfo.username}`);
        logger.info('🎯 ZigChain Sniper Bot is now running!');
        logger.info(`📡 Monitoring ZigChain at ${config.zigchain.rpcUrl}`);
      },
    });

    // Start a dummy HTTP server for Railway health checks
    const port = process.env.PORT || 3000;
    const http = await import('http');
    http.createServer((req, res) => {
      res.writeHead(200);
      res.end('Bot is running!');
    }).listen(port, () => {
      logger.info(`Health check server listening on port ${port}`);
    });
  } catch (error) {
    logger.error('Failed to start bot', { error });
    process.exit(1);
  }
}

main().catch((error) => {
  logger.error('Unhandled error', { error });
  process.exit(1);
});
