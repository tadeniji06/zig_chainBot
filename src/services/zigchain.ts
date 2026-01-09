import {
	DirectSecp256k1HdWallet,
	DirectSecp256k1Wallet,
} from "@cosmjs/proto-signing";
import { Secp256k1HdWallet } from "@cosmjs/amino";
import {
	SigningStargateClient,
	StargateClient,
	GasPrice,
	DeliverTxResponse,
	AminoTypes,
} from "@cosmjs/stargate";
import { Tendermint37Client } from "@cosmjs/tendermint-rpc";
import { fromHex, toHex } from "@cosmjs/encoding";
import { config } from "../config/index.js";
import { logger } from "../utils/logger.js";

export interface TokenInfo {
	denom: string;
	name?: string;
	symbol?: string;
	creator: string;
	mintingCap: string;
}

export interface PoolInfo {
	poolId: string;
	baseDenom: string;
	quoteDenom: string;
	baseReserve: string;
	quoteReserve: string;
}

export interface Balance {
	denom: string;
	amount: string;
}

export class ZigChainService {
	private rpcClient: StargateClient | null = null;
	private tendermintClient: Tendermint37Client | null = null;

	async connect(): Promise<void> {
		try {
			this.tendermintClient = await Tendermint37Client.connect(
				config.zigchain.rpcUrl
			);
			this.rpcClient = await StargateClient.create(
				this.tendermintClient
			);
			logger.info("Connected to ZigChain RPC");
		} catch (error) {
			logger.error("Failed to connect to ZigChain RPC", { error });
			throw error;
		}
	}

	async disconnect(): Promise<void> {
		if (this.tendermintClient) {
			this.tendermintClient.disconnect();
		}
	}

	async generateWallet(): Promise<{
		mnemonic: string;
		address: string;
		privateKey: string;
	}> {
		const wallet = await DirectSecp256k1HdWallet.generate(24, {
			prefix: config.zigchain.prefix,
		});
		const [account] = await wallet.getAccounts();

		const key = await wallet.serialize("temp-password");

		return {
			mnemonic: wallet.mnemonic,
			address: account.address,
			privateKey: wallet.mnemonic,
		};
	}

	async importWalletFromMnemonic(
		mnemonic: string
	): Promise<{ address: string; privateKey: string }> {
		const wallet = await DirectSecp256k1HdWallet.fromMnemonic(
			mnemonic,
			{ prefix: config.zigchain.prefix }
		);
		const [account] = await wallet.getAccounts();

		return {
			address: account.address,
			privateKey: mnemonic,
		};
	}

	async importWalletFromPrivateKey(
		privateKeyHex: string
	): Promise<{ address: string; privateKey: string }> {
		const privateKey = fromHex(
			privateKeyHex.startsWith("0x")
				? privateKeyHex.slice(2)
				: privateKeyHex
		);
		const wallet = await DirectSecp256k1Wallet.fromKey(
			privateKey,
			config.zigchain.prefix
		);
		const [account] = await wallet.getAccounts();

		return {
			address: account.address,
			privateKey: privateKeyHex,
		};
	}

	async getBalance(address: string): Promise<Balance[]> {
		if (!this.rpcClient) await this.connect();

		const balances = await this.rpcClient!.getAllBalances(address);
		return balances.map((b) => ({
			denom: b.denom,
			amount: b.amount,
		}));
	}

	async getZigBalance(address: string): Promise<string> {
		if (!this.rpcClient) await this.connect();

		const balance = await this.rpcClient!.getBalance(
			address,
			config.zigchain.denom
		);
		return balance.amount;
	}

	async getSigningClient(
		mnemonic: string
	): Promise<SigningStargateClient> {
		// Use Amino wallet for safer JSON-based signing (bypassing proto field number guessing)
		const wallet = await Secp256k1HdWallet.fromMnemonic(mnemonic, {
			prefix: config.zigchain.prefix,
		});
		const gasPrice = GasPrice.fromString(config.zigchain.gasPrice);

		const customAminoTypes = new AminoTypes({
			"/zigchain.dex.MsgSwapExactIn": {
				aminoType: "zigchain/dex/MsgSwapExactIn",
				toAmino: ({ sender, poolId, tokenIn, minTokenOut }: any) => ({
					sender,
					pool_id: poolId,
					token_in: tokenIn,
					min_token_out: minTokenOut,
				}),
				fromAmino: ({
					sender,
					pool_id,
					token_in,
					min_token_out,
				}: any) => ({
					sender,
					poolId: pool_id,
					tokenIn: token_in,
					minTokenOut: min_token_out,
				}),
			},
			"/zigchain.dex.MsgSwapExactOut": {
				aminoType: "zigchain/dex/MsgSwapExactOut",
				toAmino: ({ sender, poolId, tokenOut, maxTokenIn }: any) => ({
					sender,
					pool_id: poolId,
					token_out: tokenOut,
					max_token_in: maxTokenIn,
				}),
				fromAmino: ({
					sender,
					pool_id,
					token_out,
					max_token_in,
				}: any) => ({
					sender,
					poolId: pool_id,
					tokenOut: token_out,
					maxTokenIn: max_token_in,
				}),
			},
		});

		return SigningStargateClient.connectWithSigner(
			config.zigchain.rpcUrl,
			wallet,
			{
				gasPrice,
				aminoTypes: customAminoTypes,
			}
		);
	}

	async swapExactIn(
		mnemonic: string,
		poolId: string,
		tokenIn: { denom: string; amount: string },
		minTokenOut: string
	): Promise<DeliverTxResponse> {
		const wallet = await Secp256k1HdWallet.fromMnemonic(mnemonic, {
			prefix: config.zigchain.prefix,
		});
		const [account] = await wallet.getAccounts();
		const client = await this.getSigningClient(mnemonic);

		const msg = {
			typeUrl: "/zigchain.dex.MsgSwapExactIn",
			value: {
				sender: account.address,
				poolId: poolId,
				tokenIn: tokenIn,
				minTokenOut: minTokenOut,
			},
		};

		const result = await client.signAndBroadcast(
			account.address,
			[msg],
			"auto",
			"ZigChain Sniper Bot"
		);

		client.disconnect();
		return result;
	}

	async swapExactOut(
		mnemonic: string,
		poolId: string,
		tokenOut: { denom: string; amount: string },
		maxTokenIn: string
	): Promise<DeliverTxResponse> {
		const wallet = await Secp256k1HdWallet.fromMnemonic(mnemonic, {
			prefix: config.zigchain.prefix,
		});
		const [account] = await wallet.getAccounts();
		const client = await this.getSigningClient(mnemonic);

		const msg = {
			typeUrl: "/zigchain.dex.MsgSwapExactOut",
			value: {
				sender: account.address,
				poolId: poolId,
				tokenOut: tokenOut,
				maxTokenIn: maxTokenIn,
			},
		};

		const result = await client.signAndBroadcast(
			account.address,
			[msg],
			"auto",
			"ZigChain Sniper Bot - Sell"
		);

		client.disconnect();
		return result;
	}

	async getTokenBalance(
		address: string,
		denom: string
	): Promise<string> {
		if (!this.rpcClient) await this.connect();

		const balance = await this.rpcClient!.getBalance(address, denom);
		return balance.amount;
	}

	async queryNewTokens(fromHeight?: number): Promise<TokenInfo[]> {
		try {
			const response = await fetch(
				`${config.zigchain.apiUrl}/cosmos/bank/v1beta1/supply?pagination.limit=5000`,
				{ signal: AbortSignal.timeout(10000) } // 10 second timeout
			);

			if (!response.ok) {
				throw new Error(
					`API request failed: ${response.status} ${response.statusText}`
				);
			}

			const data = (await response.json()) as {
				supply?: Array<{ denom: string; amount: string }>;
			};
			const tokens: TokenInfo[] = [];

			for (const coin of data.supply || []) {
				if (coin.denom && coin.denom.startsWith("coin.")) {
					const parts = coin.denom.split(".");
					if (parts.length >= 3) {
						const subdenom = parts.slice(2).join(".");
						tokens.push({
							denom: coin.denom,
							creator: parts[1],
							name: subdenom,
							symbol: subdenom.toUpperCase().slice(0, 10),
							mintingCap: coin.amount || "0",
						});
					}
				}
			}

			return tokens;
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Unknown error";
			logger.error("Failed to query new tokens", {
				error: errorMessage,
				url: config.zigchain.apiUrl,
			});
			return [];
		}
	}

	async queryPools(): Promise<PoolInfo[]> {
		try {
			const response = await fetch(
				`${config.zigchain.apiUrl}/cosmos/bank/v1beta1/supply?pagination.limit=5000`,
				{ signal: AbortSignal.timeout(10000) } // 10 second timeout
			);

			if (!response.ok) {
				throw new Error(
					`API request failed: ${response.status} ${response.statusText}`
				);
			}

			const data = (await response.json()) as {
				supply?: Array<{ denom: string; amount: string }>;
			};
			const pools: PoolInfo[] = [];

			for (const coin of data.supply || []) {
				if (coin.denom && coin.denom.includes("oroswaplptoken")) {
					const parts = coin.denom.split(".");
					if (parts.length >= 2) {
						pools.push({
							poolId: coin.denom,
							baseDenom: coin.denom,
							quoteDenom: "uzig",
							baseReserve: coin.amount || "0",
							quoteReserve: "0",
						});
					}
				}
			}

			return pools;
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Unknown error";
			logger.error("Failed to query pools", {
				error: errorMessage,
				url: config.zigchain.apiUrl,
			});
			return [];
		}
	}

	async getPoolByToken(tokenDenom: string): Promise<PoolInfo | null> {
		const pools = await this.queryPools();

		// 1. Try loose matching (Pool ID contains Token Denom)
		const match = pools.find((p) => p.poolId.includes(tokenDenom));
		if (match) return match;

		// Debug logging to understand why we aren't finding it
		logger.warn("Pool search failed", {
			token: tokenDenom,
			totalPools: pools.length,
			samplePools: pools.slice(0, 3).map((p) => p.poolId),
		});

		// 2. FALLBACK: Assume the Token Denom IS the Pool ID (Bonding Curve / Single Asset Pool)
		// This allows the bot to attempt the buy even if we can't find an "LPToken"
		logger.info("Using Token Denom as Pool ID fallback", {
			tokenDenom,
		});
		return {
			poolId: tokenDenom,
			baseDenom: tokenDenom,
			quoteDenom: "uzig", // Assumption
			baseReserve: "0",
			quoteReserve: "0",
		};
	}

	subscribeToNewBlocks(
		callback: (height: number) => void
	): () => void {
		let cancelled = false;

		const poll = async () => {
			let lastHeight = 0;
			while (!cancelled) {
				try {
					if (this.rpcClient) {
						const height = await this.rpcClient.getHeight();
						if (height > lastHeight) {
							lastHeight = height;
							callback(height);
						}
					}
				} catch (err) {
					logger.error("Block polling error", { error: err });
				}
				await new Promise((resolve) => setTimeout(resolve, 1000));
			}
		};

		poll();

		return () => {
			cancelled = true;
		};
	}

	async getBlockEvents(height: number): Promise<unknown[]> {
		try {
			const response = await fetch(
				`${config.zigchain.apiUrl}/cosmos/tx/v1beta1/txs?events=tx.height=${height}`
			);

			if (!response.ok) return [];

			const data = (await response.json()) as {
				tx_responses?: unknown[];
			};
			return data.tx_responses || [];
		} catch (error) {
			logger.error("Failed to get block events", { error, height });
			return [];
		}
	}

	formatBalance(amount: string, denom: string): string {
		const value = parseFloat(amount) / 1_000_000;
		const symbol = denom === "uzig" ? "ZIG" : denom;
		return `${value.toFixed(6)} ${symbol}`;
	}

	calculateBuyAmount(balance: string, percentage: number): string {
		const balanceNum = BigInt(balance);
		const buyAmount = (balanceNum * BigInt(percentage)) / BigInt(100);
		return buyAmount.toString();
	}
}

export const zigchainService = new ZigChainService();
