import { Context } from "grammy";
import { userRepository } from "../../database/repositories/userRepository.js";
import { walletRepository } from "../../database/repositories/walletRepository.js";
import { transactionRepository } from "../../database/repositories/transactionRepository.js";
import { zigchainService } from "../../services/zigchain.js";
import { decrypt } from "../../utils/encryption.js";
import { keyboards } from "../keyboards.js";
import { setUserState, clearUserState } from "./wallet.js";
import { logger } from "../../utils/logger.js";
import { config } from "../../config/index.js";

export async function handleHoldingsMenu(
	ctx: Context
): Promise<void> {
	const telegramId = ctx.from?.id;
	if (!telegramId) return;

	const holdings = transactionRepository.getHoldings(telegramId);

	if (holdings.length === 0) {
		const message =
			"📭 No Token Holdings\n\nYou haven't bought any tokens yet.\nUse auto-snipe or quick buy to get started!";

		if (ctx.callbackQuery) {
			await ctx.editMessageText(message, {
				reply_markup: keyboards.backToMain(),
			});
		} else {
			await ctx.reply(message, {
				reply_markup: keyboards.backToMain(),
			});
		}
		return;
	}

	const holdingsList = holdings
		.map((h, i) => {
			const name = h.token_name || h.token_symbol || "Unknown Token";
			const balance = parseFloat(h.current_balance).toFixed(2);
			return `${i + 1}. ${name}\n   Balance: ${balance} tokens`;
		})
		.join("\n\n");

	const message = `💎 Your Token Holdings (${holdings.length})\n\n${holdingsList}\n\nSelect a token to sell:`;

	if (ctx.callbackQuery) {
		await ctx.editMessageText(message, {
			reply_markup: keyboards.holdingsActions(holdings),
		});
	} else {
		await ctx.reply(message, {
			reply_markup: keyboards.holdingsActions(holdings),
		});
	}
}

export async function handleSellMenu(
	ctx: Context,
	tokenDenom: string
): Promise<void> {
	const telegramId = ctx.from?.id;
	if (!telegramId) return;

	const holdings = transactionRepository.getHoldings(telegramId);
	const holding = holdings.find((h) => h.token_denom === tokenDenom);

	if (!holding) {
		await ctx.answerCallbackQuery("❌ Token not found in holdings");
		return;
	}

	const name = holding.token_name || holding.token_symbol || "Token";
	const balance = parseFloat(holding.current_balance).toFixed(2);

	await ctx.editMessageText(
		`📉 Sell ${name}\n\nCurrent Balance: ${balance} tokens\n\nSelect percentage to sell:`,
		{
			reply_markup: keyboards.sellPercentageOptions(tokenDenom),
		}
	);
}

export async function handleSellToken(
	ctx: Context,
	tokenDenom: string,
	percentage: number
): Promise<void> {
	const telegramId = ctx.from?.id;
	if (!telegramId) return;

	await ctx.answerCallbackQuery("🔄 Processing sell...");

	try {
		const user = userRepository.findById(telegramId);
		if (!user?.active_wallet_id) {
			await ctx.editMessageText("❌ No active wallet configured", {
				reply_markup: keyboards.backToMain(),
			});
			return;
		}

		const wallet = walletRepository.findById(user.active_wallet_id);
		if (!wallet) {
			await ctx.editMessageText("❌ Active wallet not found", {
				reply_markup: keyboards.backToMain(),
			});
			return;
		}

		const holdings = transactionRepository.getHoldings(telegramId);
		const holding = holdings.find(
			(h) => h.token_denom === tokenDenom
		);

		if (!holding) {
			await ctx.editMessageText("❌ Token not found in holdings", {
				reply_markup: keyboards.backToMain(),
			});
			return;
		}

		const mnemonic = decrypt(wallet.encrypted_private_key);
		const tokenBalance = await zigchainService.getTokenBalance(
			wallet.address,
			tokenDenom
		);

		if (BigInt(tokenBalance) === BigInt(0)) {
			await ctx.editMessageText(
				"❌ No tokens to sell (balance is 0)",
				{
					reply_markup: keyboards.backToMain(),
				}
			);
			return;
		}

		const sellAmount = zigchainService.calculateBuyAmount(
			tokenBalance,
			percentage
		);
		const pool = await zigchainService.getPoolByToken(tokenDenom);

		if (!pool) {
			await ctx.editMessageText(
				"❌ No liquidity pool found for this token",
				{
					reply_markup: keyboards.backToMain(),
				}
			);
			return;
		}

		const settings = userRepository.getSnipeSettings(telegramId);
		const slippageMultiplier =
			(100 - (settings?.slippage_tolerance || 5)) / 100;
		const minOutput = "1";

		logger.info("Executing sell", {
			userId: telegramId,
			tokenDenom,
			sellAmount,
			percentage,
		});

		/* 
    // Temporarily disabled as we migrate to pure CosmWasm Swaps
    const result = await zigchainService.swapExactOut(
      mnemonic,
      pool.poolId,
      { denom: config.zigchain.denom, amount: minOutput },
      sellAmount
    );
    */
		throw new Error(
			"Sell functionality is temporarily undergoing maintenance. Please try again later."
		);

		// Mock result to satisfy TS if we didn't throw above
		const result = {
			transactionHash: "",
			code: 1,
			rawLog: "Maintenance",
		};

		transactionRepository.create(
			telegramId,
			wallet.address,
			result.transactionHash,
			tokenDenom,
			"sell",
			sellAmount,
			result.code === 0 ? "success" : "failed",
			holding.token_name || undefined,
			holding.token_symbol || undefined
		);

		if (result.code === 0) {
			await ctx.editMessageText(
				`✅ Sell Successful!\n\nSold: ${percentage}% of ${
					holding.token_name || "tokens"
				}\nAmount: ${sellAmount}\nTX: ${result.transactionHash.slice(
					0,
					20
				)}...`,
				{
					reply_markup: keyboards.backToMain(),
				}
			);
		} else {
			await ctx.editMessageText(
				`❌ Sell Failed\n\nError: Transaction failed`,
				{
					reply_markup: keyboards.backToMain(),
				}
			);
		}
	} catch (error) {
		logger.error("Sell failed", { error, telegramId, tokenDenom });
		await ctx.editMessageText(
			`❌ Sell Failed\n\nError: ${
				error instanceof Error ? error.message : "Unknown error"
			}`,
			{
				reply_markup: keyboards.backToMain(),
			}
		);
	}
}

export async function handleCustomSellPercentage(
	ctx: Context,
	tokenDenom: string
): Promise<void> {
	const telegramId = ctx.from?.id;
	if (!telegramId) return;

	setUserState(telegramId, {
		action: "custom_sell_percentage",
		data: tokenDenom,
	});

	await ctx.editMessageText(
		"📉 Custom Sell Percentage\n\nEnter a number between 1 and 100:",
		{
			reply_markup: keyboards.cancel(),
		}
	);
}

export async function handleCustomSellPercentageInput(
	ctx: Context,
	input: string,
	tokenDenom: string
): Promise<void> {
	const telegramId = ctx.from?.id;
	if (!telegramId) return;

	clearUserState(telegramId);

	const percentage = parseInt(input, 10);
	if (isNaN(percentage) || percentage < 1 || percentage > 100) {
		await ctx.reply(
			"❌ Invalid percentage. Please enter a number between 1 and 100."
		);
		await handleHoldingsMenu(ctx);
		return;
	}

	await handleSellToken(ctx, tokenDenom, percentage);
}
