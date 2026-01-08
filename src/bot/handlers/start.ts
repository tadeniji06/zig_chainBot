import { Context } from 'grammy';
import { userRepository } from '../../database/repositories/userRepository.js';
import { walletRepository } from '../../database/repositories/walletRepository.js';
import { messages } from '../messages.js';
import { keyboards } from '../keyboards.js';
import { logger } from '../../utils/logger.js';

export async function handleStart(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id;
  const username = ctx.from?.username || ctx.from?.first_name;

  if (!telegramId) {
    await ctx.reply('Unable to identify user.');
    return;
  }

  logger.info('User started bot', { telegramId, username });

  const user = userRepository.findOrCreate(telegramId, username);

  await ctx.reply(messages.welcome(username), {
    parse_mode: 'MarkdownV2',
    reply_markup: keyboards.mainMenu(),
  });
}

export async function handleMainMenu(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  const user = userRepository.findOrCreate(telegramId);
  const hasWallet = walletRepository.count(telegramId) > 0;
  const autoSnipeEnabled = user.auto_snipe_enabled === 1;

  await ctx.editMessageText(messages.mainMenu(hasWallet, autoSnipeEnabled), {
    parse_mode: 'MarkdownV2',
    reply_markup: keyboards.mainMenu(),
  });
}

export async function handleHelp(ctx: Context): Promise<void> {
  await ctx.reply(messages.help(), {
    parse_mode: 'MarkdownV2',
    reply_markup: keyboards.backToMain(),
  });
}
