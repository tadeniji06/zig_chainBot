import { Context } from 'grammy';
import { userRepository } from '../../database/repositories/userRepository.js';
import { walletRepository } from '../../database/repositories/walletRepository.js';
import { zigchainService } from '../../services/zigchain.js';
import { encrypt } from '../../utils/encryption.js';
import { messages } from '../messages.js';
import { keyboards } from '../keyboards.js';
import { logger } from '../../utils/logger.js';
import { InlineKeyboard } from 'grammy';

const userStates = new Map<number, { action: string; data?: any }>();

export function getUserState(userId: number) {
  return userStates.get(userId);
}

export function setUserState(userId: number, state: { action: string; data?: any }) {
  userStates.set(userId, state);
}

export function clearUserState(userId: number) {
  userStates.delete(userId);
}

export async function handleWalletMenu(ctx: Context): Promise<void> {
  if (ctx.callbackQuery) {
    await ctx.editMessageText(messages.walletMenu(), {
      parse_mode: 'MarkdownV2',
      reply_markup: keyboards.walletMenu(),
    });
  } else {
    await ctx.reply(messages.walletMenu(), {
      parse_mode: 'MarkdownV2',
      reply_markup: keyboards.walletMenu(),
    });
  }
}

export async function handleWalletList(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  const wallets = walletRepository.findByTelegramId(telegramId);
  const user = userRepository.findById(telegramId);
  
  const kb = new InlineKeyboard();
  
  for (const wallet of wallets) {
    const isActive = wallet.id === user?.active_wallet_id;
    const badge = isActive ? '✅ ' : '';
    const shortAddr = `${wallet.address.slice(0, 8)}...${wallet.address.slice(-4)}`;
    kb.text(`${badge}${wallet.name} (${shortAddr})`, `wallet_view_${wallet.id}`).row();
  }
  
  kb.text('➕ Add Wallet', 'wallet_add').row();
  kb.text('◀️ Back', 'wallets');

  await ctx.editMessageText(messages.walletList(wallets, user?.active_wallet_id || null), {
    parse_mode: 'MarkdownV2',
    reply_markup: kb,
  });
}

export async function handleWalletView(ctx: Context, walletId: number): Promise<void> {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  const wallet = walletRepository.findById(walletId);
  if (!wallet || wallet.telegram_id !== telegramId) {
    await ctx.answerCallbackQuery('Wallet not found');
    return;
  }

  const user = userRepository.findById(telegramId);
  const isActive = wallet.id === user?.active_wallet_id;

  let balance = '0 ZIG';
  try {
    const balanceAmount = await zigchainService.getZigBalance(wallet.address);
    balance = zigchainService.formatBalance(balanceAmount, 'uzig');
  } catch (error) {
    balance = 'Error fetching balance';
  }

  await ctx.editMessageText(messages.walletDetails(wallet, balance, isActive), {
    parse_mode: 'MarkdownV2',
    reply_markup: keyboards.walletActions(walletId, isActive),
  });
}

export async function handleWalletGenerate(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  try {
    await ctx.answerCallbackQuery('Generating wallet...');

    const { mnemonic, address } = await zigchainService.generateWallet();
    
    const encryptedKey = encrypt(mnemonic);
    const walletCount = walletRepository.count(telegramId);
    const walletName = `Wallet ${walletCount + 1}`;

    const wallet = walletRepository.create(telegramId, walletName, address, encryptedKey);

    if (walletCount === 0) {
      userRepository.setActiveWallet(telegramId, wallet.id);
    }

    const message = await ctx.editMessageText(messages.generateWalletSuccess(address, mnemonic), {
      parse_mode: 'MarkdownV2',
      reply_markup: keyboards.backToMain(),
    });

    setTimeout(async () => {
      try {
        await ctx.api.editMessageText(
          ctx.chat!.id,
          (message as any).message_id,
          `✅ Wallet created: \`${address}\`\n\n⚠️ *Recovery phrase was shown and is now hidden for security\\.*`,
          { parse_mode: 'MarkdownV2', reply_markup: keyboards.backToMain() }
        );
      } catch (e) {
        logger.error('Failed to delete sensitive message', { error: e });
      }
    }, 60000);

    logger.info('Wallet generated', { telegramId, address });
  } catch (error) {
    logger.error('Failed to generate wallet', { error });
    await ctx.editMessageText(messages.error('Failed to generate wallet. Please try again.'), {
      parse_mode: 'MarkdownV2',
      reply_markup: keyboards.backToMain(),
    });
  }
}

export async function handleWalletImportMnemonic(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  setUserState(telegramId, { action: 'import_mnemonic' });

  await ctx.editMessageText(messages.importMnemonicPrompt(), {
    parse_mode: 'MarkdownV2',
    reply_markup: keyboards.cancel(),
  });
}

export async function handleWalletImportKey(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  setUserState(telegramId, { action: 'import_key' });

  await ctx.editMessageText(messages.importKeyPrompt(), {
    parse_mode: 'MarkdownV2',
    reply_markup: keyboards.cancel(),
  });
}

export async function handleMnemonicInput(ctx: Context, mnemonic: string): Promise<void> {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  clearUserState(telegramId);

  try {
    await ctx.deleteMessage().catch(() => {});

    const words = mnemonic.trim().split(/\s+/);
    if (words.length !== 12 && words.length !== 24) {
      await ctx.reply(messages.error('Invalid mnemonic. Must be 12 or 24 words.'), {
        parse_mode: 'MarkdownV2',
        reply_markup: keyboards.walletMenu(),
      });
      return;
    }

    const { address } = await zigchainService.importWalletFromMnemonic(mnemonic.trim());

    const existing = walletRepository.findByAddress(telegramId, address);
    if (existing) {
      await ctx.reply(messages.error('This wallet is already imported.'), {
        parse_mode: 'MarkdownV2',
        reply_markup: keyboards.walletMenu(),
      });
      return;
    }

    const encryptedKey = encrypt(mnemonic.trim());
    const walletCount = walletRepository.count(telegramId);
    const walletName = `Wallet ${walletCount + 1}`;

    const wallet = walletRepository.create(telegramId, walletName, address, encryptedKey);

    if (walletCount === 0) {
      userRepository.setActiveWallet(telegramId, wallet.id);
    }

    await ctx.reply(messages.walletImported(walletName, address), {
      parse_mode: 'MarkdownV2',
      reply_markup: keyboards.backToMain(),
    });

    logger.info('Wallet imported from mnemonic', { telegramId, address });
  } catch (error) {
    logger.error('Failed to import mnemonic', { error });
    await ctx.reply(messages.error('Invalid mnemonic. Please check and try again.'), {
      parse_mode: 'MarkdownV2',
      reply_markup: keyboards.walletMenu(),
    });
  }
}

export async function handleKeyInput(ctx: Context, privateKey: string): Promise<void> {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  clearUserState(telegramId);

  try {
    await ctx.deleteMessage().catch(() => {});

    const { address } = await zigchainService.importWalletFromPrivateKey(privateKey.trim());

    const existing = walletRepository.findByAddress(telegramId, address);
    if (existing) {
      await ctx.reply(messages.error('This wallet is already imported.'), {
        parse_mode: 'MarkdownV2',
        reply_markup: keyboards.walletMenu(),
      });
      return;
    }

    const encryptedKey = encrypt(privateKey.trim());
    const walletCount = walletRepository.count(telegramId);
    const walletName = `Wallet ${walletCount + 1}`;

    const wallet = walletRepository.create(telegramId, walletName, address, encryptedKey);

    if (walletCount === 0) {
      userRepository.setActiveWallet(telegramId, wallet.id);
    }

    await ctx.reply(messages.walletImported(walletName, address), {
      parse_mode: 'MarkdownV2',
      reply_markup: keyboards.backToMain(),
    });

    logger.info('Wallet imported from private key', { telegramId, address });
  } catch (error) {
    logger.error('Failed to import private key', { error });
    await ctx.reply(messages.error('Invalid private key. Please check and try again.'), {
      parse_mode: 'MarkdownV2',
      reply_markup: keyboards.walletMenu(),
    });
  }
}

export async function handleWalletActivate(ctx: Context, walletId: number): Promise<void> {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  const wallet = walletRepository.findById(walletId);
  if (!wallet || wallet.telegram_id !== telegramId) {
    await ctx.answerCallbackQuery('Wallet not found');
    return;
  }

  userRepository.setActiveWallet(telegramId, walletId);
  await ctx.answerCallbackQuery(`✅ ${wallet.name} is now active`);

  await handleWalletView(ctx, walletId);
}

export async function handleWalletDelete(ctx: Context, walletId: number): Promise<void> {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  const wallet = walletRepository.findById(walletId);
  if (!wallet || wallet.telegram_id !== telegramId) {
    await ctx.answerCallbackQuery('Wallet not found');
    return;
  }

  await ctx.editMessageText(
    `⚠️ *Delete Wallet*\n\nAre you sure you want to delete *${wallet.name}*?\n\n\`${wallet.address}\`\n\nThis action cannot be undone\\.`,
    {
      parse_mode: 'MarkdownV2',
      reply_markup: keyboards.confirmDelete(walletId),
    }
  );
}

export async function handleWalletConfirmDelete(ctx: Context, walletId: number): Promise<void> {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  const wallet = walletRepository.findById(walletId);
  if (!wallet || wallet.telegram_id !== telegramId) {
    await ctx.answerCallbackQuery('Wallet not found');
    return;
  }

  const user = userRepository.findById(telegramId);
  if (user?.active_wallet_id === walletId) {
    userRepository.setActiveWallet(telegramId, null);
  }

  walletRepository.delete(walletId, telegramId);
  
  await ctx.answerCallbackQuery('Wallet deleted');
  await handleWalletList(ctx);

  logger.info('Wallet deleted', { telegramId, walletId });
}

export async function handleWalletBalance(ctx: Context, walletId: number): Promise<void> {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  const wallet = walletRepository.findById(walletId);
  if (!wallet || wallet.telegram_id !== telegramId) {
    await ctx.answerCallbackQuery('Wallet not found');
    return;
  }

  try {
    await ctx.answerCallbackQuery('Fetching balance...');
    const balances = await zigchainService.getBalance(wallet.address);
    
    let balanceText = balances.length > 0
      ? balances.map(b => zigchainService.formatBalance(b.amount, b.denom)).join('\n')
      : '0 ZIG';

    await ctx.reply(`💰 *Balance for ${wallet.name}*\n\n${balanceText.replace(/[._]/g, '\\$&')}`, {
      parse_mode: 'MarkdownV2',
    });
  } catch (error) {
    await ctx.answerCallbackQuery('Failed to fetch balance');
  }
}
