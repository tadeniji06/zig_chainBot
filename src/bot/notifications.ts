import { Bot } from 'grammy';
import { tokenMap } from '../utils/tokenMap.js';
import { userRepository } from '../database/repositories/userRepository.js';
// import { walletRepository } from '../database/repositories/walletRepository.js';
import { tokenMonitor, NewTokenEvent, GraduationEvent } from '../services/tokenMonitor.js';
import { sniperService } from '../services/sniper.js';
import { messages } from './messages.js';
import { keyboards } from './keyboards.js';
import { logger } from '../utils/logger.js';
import { InlineKeyboard } from 'grammy';

export function setupNotifications(bot: Bot): void {
  tokenMonitor.on('newToken', async (event: NewTokenEvent) => {
    await notifyNewToken(bot, event);
  });

  tokenMonitor.on('graduation', async (event: GraduationEvent) => {
    await notifyGraduation(bot, event);
  });

  sniperService.on('snipeResult', async ({ userId, result }) => {
     await sendSnipeResult(bot, userId, result);
  });

  logger.info('Notifications setup complete');
}

async function notifyNewToken(bot: Bot, event: NewTokenEvent): Promise<void> {
  const users = userRepository.getAllAutoSnipeUsers();

  for (const user of users) {
    const settings = userRepository.getSnipeSettings(user.telegram_id);
    if (!settings?.auto_buy_new_tokens) continue;

    try {
      const tokenId = tokenMap.getId(event.token.denom);
      const kb = new InlineKeyboard()
        .text('🛒 Buy Now', `quick_buy_${tokenId}`)
        .text('👀 Watch', `watch_${tokenId}`);

      await bot.api.sendMessage(
        user.telegram_id,
        messages.newTokenAlert(event.token),
        {
          parse_mode: 'MarkdownV2',
          reply_markup: kb,
        }
      );
    } catch (error) {
      logger.error('Failed to send new token notification', {
        userId: user.telegram_id,
        error,
      });
    }
  }
}

async function notifyGraduation(bot: Bot, event: GraduationEvent): Promise<void> {
  const users = userRepository.getAllAutoSnipeUsers();

  for (const user of users) {
    const settings = userRepository.getSnipeSettings(user.telegram_id);
    if (!settings?.auto_buy_graduated) continue;

    try {
      const kb = new InlineKeyboard()
        .text('🛒 Buy Now', `quick_buy_${encodeURIComponent(event.token.denom)}`)
        .text('📊 View Pool', `pool_${event.pool.poolId}`);

      await bot.api.sendMessage(
        user.telegram_id,
        messages.graduationAlert({
          denom: event.token.denom,
          name: event.token.name,
          poolId: event.pool.poolId,
        }),
        {
          parse_mode: 'MarkdownV2',
          reply_markup: kb,
        }
      );
    } catch (error) {
      logger.error('Failed to send graduation notification', {
        userId: user.telegram_id,
        error,
      });
    }
  }
}

export async function sendSnipeResult(
  bot: Bot,
  userId: number,
  result: { success: boolean; txHash?: string; error?: string; tokenDenom: string; amountSpent: string }
): Promise<void> {
  try {
    await bot.api.sendMessage(
      userId,
      messages.snipeResult(result),
      {
        parse_mode: 'MarkdownV2',
        reply_markup: keyboards.backToMain(),
      }
    );
  } catch (error) {
    logger.error('Failed to send snipe result', { userId, error });
  }
}
