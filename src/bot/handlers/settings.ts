import { Context } from 'grammy';
import { userRepository } from '../../database/repositories/userRepository.js';
import { messages } from '../messages.js';
import { keyboards } from '../keyboards.js';
import { setUserState, clearUserState } from './wallet.js';

export async function handleSettingsMenu(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  const settings = userRepository.getSnipeSettings(telegramId);
  if (!settings) {
    userRepository.findOrCreate(telegramId);
    return handleSettingsMenu(ctx);
  }

  const buyAmountZig = Math.floor(parseInt(settings.buy_amount_uzig) / 1000000); // Convert uZIG to ZIG

  const settingsData = {
    buyAmountZig,
    slippage: settings.slippage_tolerance,
    autoNewTokens: settings.auto_buy_new_tokens === 1,
    autoGraduated: settings.auto_buy_graduated === 1,
    minLiquidity: settings.min_liquidity,
  };

  if (ctx.callbackQuery) {
    await ctx.editMessageText(messages.settings(settingsData), {
      parse_mode: 'MarkdownV2',
      reply_markup: keyboards.settingsMenu(settingsData),
    });
  } else {
    await ctx.reply(messages.settings(settingsData), {
      parse_mode: 'MarkdownV2',
      reply_markup: keyboards.settingsMenu(settingsData),
    });
  }
}

export async function handleBuyAmountMenu(ctx: Context): Promise<void> {
  await ctx.editMessageText(
    '💵 Select Buy Amount\n\nChoose how much ZIG to use when sniping:',
    {
      reply_markup: keyboards.buyAmountOptions(),
    }
  );
}

export async function handleSetBuyAmount(ctx: Context, amountZig: number): Promise<void> {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  const amountUzig = (amountZig * 1000000).toString(); // Convert ZIG to uZIG
  userRepository.updateSnipeSettings(telegramId, { buy_amount_uzig: amountUzig });
  await ctx.answerCallbackQuery(`✅ Buy amount set to ${amountZig} ZIG`);
  await handleSettingsMenu(ctx);
}

export async function handleCustomBuyAmount(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  setUserState(telegramId, { action: 'custom_buy_amount' });

  await ctx.editMessageText(
    '💵 Custom Buy Amount\n\nEnter amount in ZIG (minimum 100, maximum 100000)\:',
    {
      reply_markup: keyboards.cancel(),
    }
  );
}

export async function handleSlippageMenu(ctx: Context): Promise<void> {
  await ctx.editMessageText(
    '📉 Select Slippage Tolerance\n\nHigher slippage = more likely to succeed but worse price.\n\nMin: 0.1% | Max: 99%',
    {
      reply_markup: keyboards.slippageOptions(),
    }
  );
}

export async function handleSetSlippage(ctx: Context, slippage: number): Promise<void> {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  userRepository.updateSnipeSettings(telegramId, { slippage_tolerance: slippage });
  await ctx.answerCallbackQuery(`✅ Slippage set to ${slippage}%`);
  await handleSettingsMenu(ctx);
}

export async function handleCustomSlippage(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  setUserState(telegramId, { action: 'custom_slippage' });

  await ctx.editMessageText(
    '📉 Custom Slippage\n\nEnter a number between 0.1 and 99:\n\nExamples: 0.5, 1, 2.5, 5, 10, 25, 50',
    {
      reply_markup: keyboards.cancel(),
    }
  );
}

export async function handleToggleAutoNewTokens(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  const settings = userRepository.getSnipeSettings(telegramId);
  if (!settings) return;

  const newValue = settings.auto_buy_new_tokens === 1 ? 0 : 1;
  userRepository.updateSnipeSettings(telegramId, { auto_buy_new_tokens: newValue });

  const status = newValue === 1 ? 'enabled' : 'disabled';
  await ctx.answerCallbackQuery(`Auto-buy new tokens ${status}`);
  await handleSettingsMenu(ctx);
}

export async function handleToggleAutoGraduated(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  const settings = userRepository.getSnipeSettings(telegramId);
  if (!settings) return;

  const newValue = settings.auto_buy_graduated === 1 ? 0 : 1;
  userRepository.updateSnipeSettings(telegramId, { auto_buy_graduated: newValue });

  if (newValue === 1) {
    userRepository.setAutoSnipe(telegramId, true);
  }

  const status = newValue === 1 ? 'enabled' : 'disabled';
  await ctx.answerCallbackQuery(`Auto-buy graduated tokens ${status}`);
  await handleSettingsMenu(ctx);
}

export async function handleCustomBuyAmountInput(ctx: Context, input: string): Promise<void> {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  clearUserState(telegramId);

  const amountZig = parseInt(input, 10);
  if (isNaN(amountZig) || amountZig < 100 || amountZig > 100000) {
    await ctx.reply('❌ Invalid amount. Please enter a number between 100 and 100000 ZIG.');
    await handleSettingsMenu(ctx);
    return;
  }

  const amountUzig = (amountZig * 1000000).toString();
  userRepository.updateSnipeSettings(telegramId, { buy_amount_uzig: amountUzig });
  await ctx.reply(`✅ Buy amount set to ${amountZig} ZIG`);
  await handleSettingsMenu(ctx);
}

export async function handleCustomSlippageInput(ctx: Context, input: string): Promise<void> {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  clearUserState(telegramId);

  const slippage = parseFloat(input);
  if (isNaN(slippage) || slippage < 0.1 || slippage > 99) {
    await ctx.reply('❌ Invalid slippage. Please enter a number between 0.1 and 99.');
    await handleSettingsMenu(ctx);
    return;
  }

  userRepository.updateSnipeSettings(telegramId, { slippage_tolerance: slippage });
  await ctx.reply(`✅ Slippage set to ${slippage}%`);
  await handleSettingsMenu(ctx);
}
