import { EventEmitter } from "events";
import { logger } from "../utils/logger.js";
import { zigchainService } from "./zigchain.js";
import {
	tokenMonitor,
	NewTokenEvent,
	GraduationEvent,
} from "./tokenMonitor.js";
import { userRepository } from "../database/repositories/userRepository.js";
import { walletRepository } from "../database/repositories/walletRepository.js";
import { decrypt } from "../utils/encryption.js";
import { config } from "../config/index.js";

export interface SnipeResult {
	success: boolean;
	txHash?: string;
	error?: string;
	tokenDenom: string;
	amountSpent: string;
	amountReceived?: string;
}

export interface PendingSnipe {
	userId: number;
	tokenDenom: string;
	poolId: string;
	status: "pending" | "executing" | "completed" | "failed";
	result?: SnipeResult;
}

class SniperService extends EventEmitter {
	private isRunning = false;
	private pendingSnipes: Map<string, PendingSnipe> = new Map();

	async start(): Promise<void> {
		if (this.isRunning) return;

		logger.info("Starting sniper service...");
		this.isRunning = true;

		tokenMonitor.on("newToken", (event: NewTokenEvent) =>
			this.handleNewToken(event)
		);
		tokenMonitor.on("graduation", (event: GraduationEvent) =>
			this.handleGraduation(event)
		);

		logger.info("Sniper service started");
	}

	stop(): void {
		if (!this.isRunning) return;

		logger.info("Stopping sniper service...");
		this.isRunning = false;

		tokenMonitor.removeAllListeners("newToken");
		tokenMonitor.removeAllListeners("graduation");

		logger.info("Sniper service stopped");
	}

	private async handleNewToken(event: NewTokenEvent): Promise<void> {
		logger.info("Processing new token for sniping", {
			denom: event.token.denom,
			name: event.token.name,
		});

		// For bonding curve tokens, we don't need to wait for a pool!
		// The token contract itself is the trading venue.

		const autoSnipeUsers = userRepository.getAllAutoSnipeUsers();

		for (const user of autoSnipeUsers) {
			const settings = userRepository.getSnipeSettings(
				user.telegram_id
			);
			if (!settings?.auto_buy_new_tokens) continue;

			logger.info("User has auto-snipe enabled for new tokens", {
				userId: user.telegram_id,
				tokenDenom: event.token.denom,
			});

			// Execute the snipe immediately using contract swap
			await this.executeSnipe(
				user.telegram_id,
				event.token.denom,
				settings.buy_amount_uzig
			);
		}
	}

	private async handleGraduation(
		event: GraduationEvent
	): Promise<void> {
		logger.info("Processing graduated token for sniping", {
			denom: event.token.denom,
			poolId: event.pool.poolId,
		});

		const autoSnipeUsers = userRepository.getAllAutoSnipeUsers();

		for (const user of autoSnipeUsers) {
			const settings = userRepository.getSnipeSettings(
				user.telegram_id
			);
			if (!settings?.auto_buy_graduated) continue;

			await this.executeSnipe(
				user.telegram_id,
				event.token.denom,
				settings.buy_amount_uzig
			);
		}
	}

	async executeSnipe(
		userId: number,
		tokenDenom: string,
		buyAmount: string
	): Promise<SnipeResult> {
		const snipeKey = `${userId}:${tokenDenom}`;

		if (this.pendingSnipes.has(snipeKey)) {
			return {
				success: false,
				error: "Snipe already in progress for this token",
				tokenDenom,
				amountSpent: "0",
			};
		}

		const pending: PendingSnipe = {
			userId,
			tokenDenom,
			poolId: "contract", // Placeholder
			status: "pending",
		};
		this.pendingSnipes.set(snipeKey, pending);

		try {
			pending.status = "executing";

			const user = userRepository.findById(userId);
			if (!user?.active_wallet_id) {
				throw new Error("No active wallet configured");
			}

			const wallet = walletRepository.findById(user.active_wallet_id);
			if (!wallet) {
				throw new Error("Active wallet not found");
			}

			const mnemonic = decrypt(wallet.encrypted_private_key);
			const balance = await zigchainService.getZigBalance(
				wallet.address
			);

			if (BigInt(balance) === BigInt(0)) {
				throw new Error("Insufficient balance: Wallet is empty");
			}

			// Check if balance covers buy amount + estimated gas (e.g. 5000 uzig)
			// This prevents vague transaction failures later
			const estimatedGas = BigInt(5000);
			const requiredAmount = BigInt(buyAmount) + estimatedGas;

			if (BigInt(balance) < requiredAmount) {
				throw new Error(
					`Insufficient balance. Have: ${balance} uzig, Need: ${requiredAmount} uzig (Buy: ${buyAmount} + Gas: ${estimatedGas})`
				);
			}

			logger.info("Executing snipe", {
				userId,
				tokenDenom,
				buyAmount,
				walletAddress: wallet.address,
				method: "swapViaContract",
			});

			// Use the new robust swapViaContract method
			// This handles both Bonding Curve (New Tokens) and DEX (Graduated Tokens)
			const result = await zigchainService.swapViaContract(
				mnemonic,
				tokenDenom,
				{ denom: config.zigchain.denom, amount: buyAmount }
			);

			pending.status = "completed";
			pending.result = {
				success: result.code === 0,
				txHash: result.transactionHash,
				tokenDenom,
				amountSpent: buyAmount,
			};

			logger.info("Snipe completed", {
				userId,
				tokenDenom,
				txHash: result.transactionHash,
				success: result.code === 0,
			});

			this.emit("snipeResult", {
				userId,
				result: pending.result,
			});

			return pending.result;
		} catch (error) {
			pending.status = "failed";
			const errorMessage =
				error instanceof Error ? error.message : "Unknown error";

			pending.result = {
				success: false,
				error: errorMessage,
				tokenDenom,
				amountSpent: "0",
			};

			logger.error("Snipe failed", {
				userId,
				tokenDenom,
				error: errorMessage,
			});

			return pending.result;
		} finally {
			this.pendingSnipes.delete(snipeKey);
		}
	}

	async manualBuy(
		userId: number,
		tokenDenom: string,
		amountZig: string
	): Promise<SnipeResult> {
		try {
			logger.info("[Manual Buy] Starting manual buy", {
				userId,
				tokenDenom,
				amountZig,
			});

			const user = userRepository.findById(userId);
			if (!user?.active_wallet_id) {
				throw new Error("No active wallet configured");
			}

			const wallet = walletRepository.findById(user.active_wallet_id);
			if (!wallet) {
				throw new Error("Active wallet not found");
			}

			logger.info("[Manual Buy] Using CosmWasm contract swap", {
				tokenDenom,
				walletAddress: wallet.address,
			});

			const mnemonic = decrypt(wallet.encrypted_private_key);

			logger.info("[Manual Buy] Executing CosmWasm swap", {
				amountZig,
				tokenDenom,
			});

			// Pass the token address - swapViaContract will find the correct pair contract
			const result = await zigchainService.swapViaContract(
				mnemonic,
				tokenDenom, // The token we want to buy
				{ denom: config.zigchain.denom, amount: amountZig }
			);

			logger.info("[Manual Buy] Swap completed", {
				txHash: result.transactionHash,
				code: result.code,
				success: result.code === 0,
			});

			return {
				success: result.code === 0,
				txHash: result.transactionHash,
				tokenDenom,
				amountSpent: amountZig,
			};
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Unknown error";
			logger.error("[Manual Buy] Buy failed", {
				userId,
				tokenDenom,
				error: errorMessage,
				errorStack: error instanceof Error ? error.stack : undefined,
			});
			return {
				success: false,
				error: errorMessage,
				tokenDenom,
				amountSpent: "0",
			};
		}
	}

	getPendingSnipes(): PendingSnipe[] {
		return Array.from(this.pendingSnipes.values());
	}
}

export const sniperService = new SniperService();
