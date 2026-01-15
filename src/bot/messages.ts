import { Wallet } from "../database/repositories/walletRepository.js";
import { TrackedToken } from "../database/repositories/tokenRepository.js";
import { SnipeResult } from "../services/sniper.js";

export const messages = {
	welcome: (username?: string) => `
🚀 *Welcome to ZigChain Sniper Bot${
		username ? `, ${escapeMarkdown(username)}` : ""
	}\\!*

I help you snipe tokens on meme\\.fun and OroSwap on ZigChain\\.

*Features:*
• 🎯 Auto\\-snipe new token launches
• 🎓 Auto\\-buy graduated tokens
• 💼 Multi\\-wallet support
• ⚡ Lightning\\-fast execution

*Get Started:*
1\\. Add or generate a wallet
2\\. Fund it with ZIG tokens
3\\. Configure your snipe settings
4\\. Enable auto\\-snipe and relax\\!

Use the buttons below to navigate\\.
`,

	mainMenu: (hasWallet: boolean, autoSnipeEnabled: boolean) => `
🏠 *Main Menu*

${hasWallet ? "✅ Wallet configured" : "⚠️ No wallet configured"}
${autoSnipeEnabled ? "🟢 Auto\\-snipe: ON" : "🔴 Auto\\-snipe: OFF"}

Select an option below:
`,

	walletMenu: () => `
💼 *Wallet Management*

Choose an option to manage your wallets:

• *Add Wallet* \\- Import existing wallet
• *Generate New* \\- Create a fresh wallet
• *My Wallets* \\- View and manage wallets
`,

	walletList: (wallets: Wallet[], activeId: number | null) => {
		if (wallets.length === 0) {
			return `
📭 *No Wallets Found*

You haven't added any wallets yet\\.
Use the buttons below to add one\\!
`;
		}

		const walletLines = wallets
			.map((w, i) => {
				const isActive = w.id === activeId;
				const badge = isActive ? "✅" : "○";
				const shortAddr = `${w.address.slice(
					0,
					10
				)}...${w.address.slice(-6)}`;
				return `${badge} *${w.name}*\n   \`${shortAddr}\``;
			})
			.join("\n\n");

		return `
💼 *Your Wallets* \\(${wallets.length}\\)

${walletLines}

Tap a wallet to manage it\\.
`;
	},

	walletDetails: (
		wallet: Wallet,
		balance: string,
		isActive: boolean
	) => {
		const status = isActive ? "✅ *Active Wallet*" : "○ Inactive";
		return `
💼 *${escapeMarkdown(wallet.name)}*

${status}

*Address:*
\`${wallet.address}\`

*Balance:*
💰 ${escapeMarkdown(balance)}

*Created:*
📅 ${escapeMarkdown(wallet.created_at)}
`;
	},

	generateWalletSuccess: (address: string, mnemonic: string) => `
🎉 *New Wallet Generated\\!*

*Address:*
\`${address}\`

⚠️ *IMPORTANT: Save your recovery phrase\\!*

*Mnemonic \\(24 words\\):*
\`${mnemonic}\`

🔐 This message will be deleted in 60 seconds for security\\.
Store your mnemonic safely \\- it cannot be recovered\\!
`,

	importMnemonicPrompt: () => `
🔑 *Import Wallet from Mnemonic*

Please send your 12 or 24 word recovery phrase\\.

⚠️ *Security Notice:*
• Only import wallets you trust
• Your phrase is encrypted and stored securely
• Delete the message after sending

Send your mnemonic now:
`,

	importKeyPrompt: () => `
🔐 *Import Wallet from Private Key*

Please send your private key \\(hex format\\)\\.

⚠️ *Security Notice:*
• Only import wallets you trust
• Your key is encrypted and stored securely
• Delete the message after sending

Send your private key now:
`,

	walletImported: (name: string, address: string) => `
✅ *Wallet Imported Successfully\\!*

*Name:* ${escapeMarkdown(name)}
*Address:* \`${address}\`

Your wallet has been encrypted and saved\\.
`,

	settings: (settings: {
		buyAmountZig: number;
		slippage: number;
		autoNewTokens: boolean;
		autoGraduated: boolean;
		minLiquidity: string;
	}) => `
⚙️ *Snipe Settings*

*Buy Amount:* ${settings.buyAmountZig} ZIG
*Slippage:* ${settings.slippage}%
*Min Liquidity:* ${escapeMarkdown(settings.minLiquidity)} ZIG

*Auto\\-Snipe:*
${settings.autoNewTokens ? "✅" : "❌"} New token launches
${settings.autoGraduated ? "✅" : "❌"} Graduated tokens

Tap an option to change:
`,

	dashboard: (stats: {
		walletCount: number;
		activeWallet: string | null;
		balance: string;
		tokensTracked: number;
		autoSnipeEnabled: boolean;
	}) => `
📊 *Dashboard*

*Wallets:* ${stats.walletCount}
*Active:* ${
		stats.activeWallet
			? `\`${stats.activeWallet.slice(0, 10)}...\``
			: "None"
	}
*Balance:* ${escapeMarkdown(stats.balance)}

*Monitoring:*
📡 Tracking ${stats.tokensTracked} tokens
${
	stats.autoSnipeEnabled
		? "🟢 Auto\\-snipe active"
		: "🔴 Auto\\-snipe disabled"
}
`,

	newTokenAlert: (token: {
		denom: string;
		name?: string;
		symbol?: string;
		creator: string;
	}) => {
		let contract = token.denom;
		// Extract contract address from denom: coin.{address}.{symbol}
		if (
			token.denom.startsWith("coin.") &&
			token.denom.includes(".")
		) {
			const parts = token.denom.split(".");
			if (parts.length >= 2) {
				contract = parts[1];
			}
		}

		return `
🆕 *New Token Detected\\!*

*Name:* ${escapeMarkdown(token.name || "Unknown")}
*Symbol:* ${escapeMarkdown(token.symbol || "N/A")}
*Contract:* \`${contract}\`
*Creator:* \`${token.creator.slice(0, 10)}\\.\\.\\.\`

⏰ ${escapeMarkdown(new Date().toLocaleTimeString())}
`;
	},

	graduationAlert: (token: {
		denom: string;
		name?: string;
		poolId: string;
	}) => `
🎓 *Token Graduated to DEX\\!*

*Token:* ${escapeMarkdown(token.name || token.denom.slice(0, 20))}
*Pool ID:* \`${token.poolId}\`

The token is now available for trading on OroSwap\\!

⏰ ${escapeMarkdown(new Date().toLocaleTimeString())}
`,

	snipeResult: (result: SnipeResult) => {
		if (result.success) {
			return `
✅ *Snipe Successful\\!*

*Token:* \`${result.tokenDenom.slice(0, 30)}\\.\\.\\.\`
*Spent:* ${result.amountSpent} uZIG
*TX:* \`${result.txHash?.slice(0, 20)}\\.\\.\\.\`

[View Transaction](https://explorer\\.zigchain\\.com/tx/${
				result.txHash
			})
`;
		} else {
			return `
❌ *Snipe Failed*

*Token:* \`${result.tokenDenom.slice(0, 30)}\\.\\.\\.\`
*Error:* ${escapeMarkdown(result.error || "Unknown error")}
`;
		}
	},

	recentTokens: (tokens: TrackedToken[]) => {
		if (tokens.length === 0) {
			return `
📭 *No Tokens Found*

No tokens have been detected yet\\.
The monitor is watching for new launches\\!
`;
		}

		const tokenLines = tokens
			.slice(0, 10)
			.map((t, i) => {
				const status = t.graduated ? "🎓" : "🔵";
				const name = t.name || t.symbol || "Unknown";
				return `${status} *${escapeMarkdown(
					name
				)}*\n   \`${t.denom.slice(0, 25)}\\.\\.\\.\``;
			})
			.join("\n\n");

		return `
💎 *Recent Tokens* \\(${tokens.length}\\)

${tokenLines}
`;
	},

	help: () => `
ℹ️ *Help & Commands*

*Commands:*
/start \\- Start the bot
/menu \\- Main menu
/wallets \\- Manage wallets
/settings \\- Snipe settings
/tokens \\- View recent tokens
/help \\- This help message

*How It Works:*
1\\. The bot monitors ZigChain for new tokens
2\\. When a token launches on meme\\.fun, you get alerted
3\\. When it graduates to OroSwap, auto\\-snipe kicks in
4\\. 80% of your balance is used to buy \\(configurable\\)

*Tips:*
• Always keep some ZIG for gas fees
• Start with lower buy percentages
• Monitor your trades in the dashboard


`,

	error: (message: string) => `
❌ *Error*

${escapeMarkdown(message)}


`,

	loading: () => `⏳ Processing...`,

	operationCancelled: () => `❌ Operation cancelled\\.`,
};

function escapeMarkdown(text: string): string {
	return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, "\\$&");
}
