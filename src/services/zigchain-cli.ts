import { exec } from "child_process";
import { promisify } from "util";
import { logger } from "../utils/logger.js";

const execAsync = promisify(exec);

export class ZigChainCLI {
	/**
	 * Execute a swap using the zigchaind CLI
	 * This requires zigchaind to be installed and accessible
	 */
	async swapExactIn(
		mnemonic: string,
		poolId: string,
		tokenIn: { denom: string; amount: string },
		minTokenOut: string
	): Promise<{ success: boolean; txHash?: string; error?: string }> {
		try {
			// Format: zigchaind tx dex swap-exact-in [pool-id] [token-in] --min-out [amount] --from [key-name] --gas auto --gas-prices 0.025uzig -y
			const tokenInStr = `${tokenIn.amount}${tokenIn.denom}`;

			// First, import the key from mnemonic (this is a one-time setup)
			// For now, we'll skip this and assume the key is already imported

			const command = `zigchaind tx dex swap-exact-in "${poolId}" "${tokenInStr}" --min-out "${minTokenOut}" --gas auto --gas-adjustment 1.5 --gas-prices 0.025uzig --chain-id zigchain-1 --node https://public-zigchain-rpc.numia.xyz:443 -y --output json`;

			logger.info("[CLI] Executing swap command", { command });

			const { stdout, stderr } = await execAsync(command, {
				timeout: 30000, // 30 second timeout
			});

			if (stderr) {
				logger.error("[CLI] Command stderr", { stderr });
			}

			logger.info("[CLI] Command output", { stdout });

			// Parse the JSON output to get tx hash
			try {
				const result = JSON.parse(stdout);
				if (result.txhash) {
					return {
						success: true,
						txHash: result.txhash,
					};
				}
			} catch (parseError) {
				logger.warn("[CLI] Could not parse output as JSON", {
					stdout,
				});
			}

			return {
				success: true,
				txHash: stdout.trim(),
			};
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Unknown error";
			logger.error("[CLI] Swap failed", { error: errorMessage });

			return {
				success: false,
				error: errorMessage,
			};
		}
	}

	/**
	 * Check if zigchaind CLI is available
	 */
	async isAvailable(): Promise<boolean> {
		try {
			await execAsync("zigchaind version", { timeout: 5000 });
			return true;
		} catch (error) {
			return false;
		}
	}
}

export const zigchainCLI = new ZigChainCLI();
