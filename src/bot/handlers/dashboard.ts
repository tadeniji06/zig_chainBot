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
		"🚀 *Quick Buy*\\n\\nPaste the token contract address \\(bare format\\):\\n\\n*Example:*\\n`zig15d0zmcmlmycvywzjl4nwmuyn7p2d55gzxsn53axwwajlthenaqessmnwzz`\\n\\n_Copy addresses directly from ZigChain explorer_",
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

	// Remove all whitespace (newlines, spaces, tabs)
	let address = text.replace(/\s/g, "");

	// If user provided full denom format (coin.zig1xxx.tokenname), extract just the address
	if (address.startsWith("coin.")) {
		// Extract the zig1... address from coin.zig1xxx.tokenname format
		const parts = address.split(".");
		if (parts.length >= 2) {
			address = parts[1]; // Get the zig1... part
			console.log(
				`[Quick Buy] Extracted address from full denom: ${address}`
			);
		}
	}

	// Validation: Must start with "zig"
	if (!address.startsWith("zig")) {
		await ctx.reply(
			"❌ *Invalid Address*\\n\\nAddress must start with `zig`\\n\\n*Example:*\\n`zig15d0zmcmlmycvywzjl4nwmuyn7p2d55gzxsn53axwwajlthenaqessmnwzz`\\n\\n_Or you can paste the full token denom:_\\n`coin.zig15nes6ctvl8f7tdwdgv5ekgfuv2k54qcq58s7zx5p86rdv2y4vn6qmjlqug.karakchai`",
			{ parse_mode: "MarkdownV2" }
		);
		return;
	}

	// Basic length validation (ZigChain addresses are typically 43+ characters)
	if (address.length < 40) {
		await ctx.reply(
			"❌ *Invalid Address*\\n\\nAddress appears too short\\. Please check and try again\\.",
			{ parse_mode: "MarkdownV2" }
		);
		return;
	}

	console.log(`[Quick Buy] Address Validated: ${address}`);

	// Store address in state and ask for amount
	setUserState(telegramId, {
		action: "quick_buy_amount",
		data: { address: address },
	});

	await ctx.reply(
		"💰 *Enter Buy Amount*\\n\\nPlease enter the amount of ZIG you want to spend\\:\\n\\n*Example:* `10` or `100.5`",
		{ parse_mode: "MarkdownV2" }
	);
}

export async function handleQuickBuyAmountInput(
	ctx: Context,
	text: string,
	data: any
): Promise<void> {
	const telegramId = ctx.from?.id;
	if (!telegramId) return;

	clearUserState(telegramId);

	const address = data?.address;
	if (!address) {
		await ctx.reply("❌ Session expired\\. Please start over\\.");
		return;
	}

	let amount = parseFloat(text.replace(",", "."));
	if (isNaN(amount) || amount <= 0) {
		await ctx.reply(
			"❌ *Invalid Amount*\\n\\nPlease enter a valid positive number\\.",
			{ parse_mode: "MarkdownV2" }
		);
		return;
	}

	// Convert ZIG to uZIG
	const amountUZig = Math.floor(amount * 1_000_000);

	// Escape dots for MarkdownV2
	const escapedAddress = address.replace(/\./g, "\\.");

	await ctx.reply(
		`⏳ Buying token \`${escapedAddress}\` with ${amount} ZIG\\.\\.\\.`,
		{ parse_mode: "MarkdownV2" }
	);

	// Use the provided amount
	const result = await sniperService.manualBuy(
		telegramId,
		address,
		amountUZig.toString()
	);

	if (result.success) {
		await ctx.reply(
			`✅ *Buy Successful\\!*\\n\\n*Token:* \`${escapedAddress}\`\\n*Amount:* ${amount} ZIG\\n*Tx Hash:* \`${result.txHash}\``,
			{
				parse_mode: "MarkdownV2",
			}
		);
	} else {
		// Specific help message for "Account does not exist" error
		let helpText = "";
		if (
			result.error &&
			result.error.includes("does not exist on chain")
		) {
			helpText =
				"\\n\\nℹ️ *Tip:* This error usually means your wallet address has not been initialized on\\-chain\\. Send any amount of ZIG to your wallet address to activate it\\.";
		}

		const escapedError =
			result.error?.replace(/\./g, "\\.") || "Unknown error";

		await ctx.reply(
			`❌ *Buy Failed*\\n\\nError: \`${escapedError}\`${helpText}`,
			{
				parse_mode: "MarkdownV2",
			}
		);
	}
}
