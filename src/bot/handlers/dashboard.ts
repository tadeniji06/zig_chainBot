import { Context } from "grammy";
import { userRepository } from "../../database/repositories/userRepository.js";
import { walletRepository } from "../../database/repositories/walletRepository.js";
import { tokenRepository } from "../../database/repositories/tokenRepository.js";
import { zigchainService } from "../../services/zigchain.js";
import { tokenMonitor } from "../../services/tokenMonitor.js";
import { messages } from "../messages.js";
import { keyboards } from "../keyboards.js";
import { setUserState, clearUserState } from "./wallet.js";

export async function handleDashboard(ctx: Context): Promise<void> {
	const telegramId = ctx.from?.id;
	if (!telegramId) return;

	const user = userRepository.findById(telegramId);
	const wallets = walletRepository.findByTelegramId(telegramId);
	const monitorStats = tokenMonitor.getStats();

	let activeWalletAddress: string | null = null;
	let balance = "0 ZIG";

	if (user?.active_wallet_id) {
		const activeWallet = walletRepository.findById(
			user.active_wallet_id
		);
		if (activeWallet) {
			activeWalletAddress = activeWallet.address;
			try {
				const balanceAmount = await zigchainService.getZigBalance(
					activeWallet.address
				);
				balance = zigchainService.formatBalance(
					balanceAmount,
					"uzig"
				);
			} catch {
				balance = "Error";
			}
		}
	}

	const stats = {
		walletCount: wallets.length,
		activeWallet: activeWalletAddress,
		balance,
		tokensTracked: monitorStats.knownTokens,
		autoSnipeEnabled: user?.auto_snipe_enabled === 1,
	};

	if (ctx.callbackQuery) {
		await ctx.editMessageText(messages.dashboard(stats), {
			parse_mode: "MarkdownV2",
			reply_markup: keyboards.backToMain(),
		});
	} else {
		await ctx.reply(messages.dashboard(stats), {
			parse_mode: "MarkdownV2",
			reply_markup: keyboards.backToMain(),
		});
	}
}

export async function handleTokensList(ctx: Context): Promise<void> {
	const tokens = tokenRepository.getRecentTokens(20);

	if (ctx.callbackQuery) {
		await ctx.editMessageText(messages.recentTokens(tokens), {
			parse_mode: "MarkdownV2",
			reply_markup: keyboards.backToMain(),
		});
	} else {
		await ctx.reply(messages.recentTokens(tokens), {
			parse_mode: "MarkdownV2",
			reply_markup: keyboards.backToMain(),
		});
	}
}

export async function handleHistory(ctx: Context): Promise<void> {
	await ctx.editMessageText(
		"📜 *Transaction History*\n\nNo transactions yet\\.\n\nYour snipe history will appear here\\.",
		{
			parse_mode: "MarkdownV2",
			reply_markup: keyboards.backToMain(),
		}
	);
}

export async function handleQuickBuy(ctx: Context): Promise<void> {
	const telegramId = ctx.from?.id;
	if (!telegramId) return;

	setUserState(telegramId, { action: "quick_buy_input" });

	await ctx.editMessageText(
		"🚀 *Quick Buy*\n\nPaste a token address or denom to buy:\n\nExample: `coin.zig1xxx.tokenname`",
		{
			parse_mode: "MarkdownV2",
			reply_markup: keyboards.cancel(),
		}
	);
}

import { tokenMap } from "../../utils/tokenMap.js";
import { sniperService } from "../../services/sniper.js";

export async function handleQuickBuyToken(
	ctx: Context,
	tokenId: number
): Promise<void> {
	const telegramId = ctx.from?.id;
	if (!telegramId) return;

	const denom = tokenMap.getDenom(tokenId);
	if (!denom) {
		await ctx.answerCallbackQuery({
			text: "❌ Token not found or expired",
			show_alert: true,
		});
		return;
	}

	await ctx.answerCallbackQuery({ text: "⏳ Buying token..." });

	// Get user settings for buy amount
	const settings = userRepository.getSnipeSettings(telegramId);
	if (!settings) {
		await ctx.reply("❌ Please configure your settings first.");
		return;
	}

	const result = await sniperService.manualBuy(
		telegramId,
		denom,
		settings.buy_amount_uzig
	);

	if (result.success) {
		await ctx.reply(
			`✅ *Buy Successful!*\n\n*Token:* \`${denom}\`\n*Amount:* ${settings.buy_amount_uzig} uZIG\n*Tx Hash:* \`${result.txHash}\``,
			{
				parse_mode: "MarkdownV2",
			}
		);
	} else {
		await ctx.reply(`❌ *Buy Failed*\n\nError: ${result.error}`, {
			parse_mode: "MarkdownV2",
		});
	}
}

export async function handleQuickBuyInput(
	ctx: Context,
	text: string
): Promise<void> {
	const telegramId = ctx.from?.id;
	if (!telegramId) return;

	clearUserState(telegramId);

	// Simple validation: check if it looks like a denom or address
	const denom = text.replace(/\s/g, ""); // Remove all whitespace (newlines, spaces)
	if (!denom.startsWith("coin.") && !denom.startsWith("factory/")) {
		await ctx.reply(
			"❌ Invalid token format\\. Must start with `coin\\.` or `factory/`\\.",
			{ parse_mode: "MarkdownV2" }
		);
		return;
	}

	await ctx.reply(`⏳ Buying token \`${denom}\`\\.\\.\\.`, {
		parse_mode: "MarkdownV2",
	});

	// Get user settings for buy amount
	const settings = userRepository.getSnipeSettings(telegramId);
	if (!settings) {
		await ctx.reply("❌ Please configure your settings first\\.");
		return;
	}

	const result = await sniperService.manualBuy(
		telegramId,
		denom,
		settings.buy_amount_uzig
	);

	if (result.success) {
		await ctx.reply(
			`✅ *Buy Successful\\!*\n\n*Token:* \`${denom}\`\n*Amount:* ${settings.buy_amount_uzig} uZIG\n*Tx Hash:* \`${result.txHash}\``,
			{
				parse_mode: "MarkdownV2",
			}
		);
	} else {
		await ctx.reply(`❌ *Buy Failed*\n\nError: \`${result.error}\``, {
			parse_mode: "MarkdownV2",
		});
	}
}
