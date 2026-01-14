import {
	DirectSecp256k1HdWallet,
	DirectSecp256k1Wallet,
	Registry,
} from "@cosmjs/proto-signing";
import { Secp256k1HdWallet, Secp256k1Wallet } from "@cosmjs/amino";
import {
	SigningStargateClient,
	StargateClient,
	GasPrice,
	DeliverTxResponse,
	AminoTypes,
	defaultRegistryTypes,
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

	private async getSigner(mnemonicOrKey: string) {
		// Check if input is a mnemonic (contains spaces)
		if (mnemonicOrKey.includes(" ")) {
			return DirectSecp256k1HdWallet.fromMnemonic(mnemonicOrKey, {
				prefix: config.zigchain.prefix,
			});
		}

		// Otherwise assume it's a private key - use Direct wallet for Protobuf signing
		const privateKey = fromHex(
			mnemonicOrKey.startsWith("0x")
				? mnemonicOrKey.slice(2)
				: mnemonicOrKey
		);
		return DirectSecp256k1Wallet.fromKey(
			privateKey,
			config.zigchain.prefix
		);
	}

	async getSigningClient(
		mnemonic: string
	): Promise<SigningStargateClient> {
		// Use Amino wallet for safer JSON-based signing (bypassing proto field number guessing)
		const wallet = await this.getSigner(mnemonic);
		const gasPrice = GasPrice.fromString(config.zigchain.gasPrice);

		const customAminoTypes = new AminoTypes({
			"/cosmwasm.wasm.v1.MsgExecuteContract": {
				aminoType: "wasm/MsgExecuteContract",
				toAmino: ({ sender, contract, msg, funds }: any) => ({
					sender,
					contract,
					msg,
					funds,
				}),
				fromAmino: ({ sender, contract, msg, funds }: any) => ({
					sender,
					contract,
					msg,
					funds,
				}),
			},
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

		// Create registry with ZigChain DEX messages from the SDK
		const { zigchain } = await import("@zigchain/zigchainjs");
		const { MsgExecuteContract } = await import(
			"cosmjs-types/cosmwasm/wasm/v1/tx"
		);

		const registry = new Registry([
			...defaultRegistryTypes,
			["/cosmwasm.wasm.v1.MsgExecuteContract", MsgExecuteContract],
			[
				"/zigchain.dex.MsgSwapExactIn",
				zigchain.dex.MsgSwapExactIn as any,
			],
			[
				"/zigchain.dex.MsgSwapExactOut",
				zigchain.dex.MsgSwapExactOut as any,
			],
		]);

		return SigningStargateClient.connectWithSigner(
			config.zigchain.rpcUrl,
			wallet,
			{
				gasPrice,
				aminoTypes: customAminoTypes,
				registry,
			}
		);
	}

	async getPairContract(tokenAddress: string): Promise<string> {
		// For now, use the token address directly as many meme tokens have built-in swap
		// If that fails, we'll fall back to the router
		logger.info("[ZigChain] Using token address as swap contract", {
			tokenAddress,
		});

		return tokenAddress;
	}

	async swapViaContract(
		mnemonicOrKey: string,
		tokenOut: string,
		tokenIn: { denom: string; amount: string }
	): Promise<DeliverTxResponse> {
		const wallet = await this.getSigner(mnemonicOrKey);
		const [account] = await wallet.getAccounts();

		logger.info("[ZigChain] Wallet derived address", {
			address: account.address,
			pubkey: toHex(account.pubkey),
		});

		const client = await this.getSigningClient(mnemonicOrKey);

		// Try bonding curve first
		try {
			const contractAddress = await this.getPairContract(tokenOut);

			// CosmWasm message for meme tokens with bonding curve
			const msg = {
				typeUrl: "/cosmwasm.wasm.v1.MsgExecuteContract",
				value: {
					sender: account.address,
					contract: contractAddress,
					msg: Buffer.from(
						JSON.stringify({
							buy_token: {}, // Bonding curve tokens use buy_token
						})
					),
					funds: [tokenIn],
				},
			};

			const accountOnChain = await client.getAccount(account.address);
			logger.info("[ZigChain] Account info", {
				address: account.address,
				accountNumber: accountOnChain?.accountNumber,
				sequence: accountOnChain?.sequence,
			});

			logger.info(
				"[ZigChain] Broadcasting bonding curve buy transaction"
			);

			const result = await client.signAndBroadcast(
				account.address,
				[msg],
				"auto",
				"ZigChain Sniper Bot - Bonding Curve Buy"
			);

			logger.info("[ZigChain] Swap successful", {
				txHash: result.transactionHash,
				code: result.code,
				height: result.height,
			});

			if (result.code !== 0) {
				throw new Error(
					`Transaction failed with code ${result.code}: ${result.rawLog}`
				);
			}

			return result;
		} catch (error) {
			const errorMsg =
				error instanceof Error ? error.message : String(error);

			// If trading is paused or no contract, try DEX swap
			if (
				errorMsg.includes("Trading is paused") ||
				errorMsg.includes("no such contract")
			) {
				logger.info(
					"[ZigChain] Bonding curve failed, trying DEX swap",
					{
						reason: errorMsg.includes("Trading is paused")
							? "graduated"
							: "not a bonding curve token",
					}
				);

				// Query OroSwap factory for the pair contract
				const OROSWAP_FACTORY =
					"zig1xx3aupmgv3ce537c0yce8zzd3sz567syaltr2tdehu3y803yz6gsc6tz85";

				try {
					// We need to find the pair that contains our token address in its native denom
					// Graduated tokens become native tokens: coin.{contract_address}.{symbol}
					let pairContract: string | undefined;
					let targetDenom: string | undefined;
					let startAfter: any = undefined;
					const LIMIT = 30;

					// Search through pairs (pagination)
					for (let i = 0; i < 10; i++) {
						// Max 10 pages (~300 pairs) to prevent infinite loop
						const queryMsg: any = {
							pairs: { limit: LIMIT },
						};
						if (startAfter) {
							queryMsg.pairs.start_after = startAfter;
						}

						const response = await fetch(
							`${
								config.zigchain.apiUrl
							}/cosmwasm/wasm/v1/contract/${OROSWAP_FACTORY}/smart/${Buffer.from(
								JSON.stringify(queryMsg)
							).toString("base64")}`,
							{ signal: AbortSignal.timeout(10000) }
						);

						if (!response.ok) {
							break;
						}

						const data = (await response.json()) as any;
						const pairs = data.data.pairs;

						if (!pairs || pairs.length === 0) break;

						// Find pair containing our token address
						const target = pairs.find((p: any) => {
							return p.asset_infos.some(
								(a: any) =>
									a.native_token &&
									a.native_token.denom.includes(tokenOut)
							);
						});

						if (target) {
							pairContract = target.contract_addr;
							targetDenom = target.asset_infos.find((a: any) =>
								a.native_token.denom.includes(tokenOut)
							).native_token.denom;
							logger.info("[ZigChain] Found graduated token pair", {
								token: tokenOut,
								pairContract,
								nativeDenom: targetDenom,
							});
							break;
						}

						// Prepare next page
						startAfter = pairs[pairs.length - 1].asset_infos;
					}

					if (!pairContract || !targetDenom) {
						throw new Error(
							"Could not find DEX pair for graduated token"
						);
					}

					// Swap on the specific pair contract
					const dexMsg = {
						typeUrl: "/cosmwasm.wasm.v1.MsgExecuteContract",
						value: {
							sender: account.address,
							contract: pairContract,
							msg: Buffer.from(
								JSON.stringify({
									swap: {
										offer_asset: {
											info: {
												native_token: {
													denom: tokenIn.denom,
												},
											},
											amount: tokenIn.amount,
										},
										ask_asset_info: {
											native_token: {
												denom: targetDenom,
											},
										},
										max_spread: "0.5", // 50% max spread
									},
								})
							),
							funds: [tokenIn],
						},
					};

					logger.info("[ZigChain] Broadcasting DEX swap transaction");

					const result = await client.signAndBroadcast(
						account.address,
						[dexMsg],
						"auto",
						"ZigChain Sniper Bot - DEX Swap"
					);

					logger.info("[ZigChain] DEX swap successful", {
						txHash: result.transactionHash,
						code: result.code,
						height: result.height,
					});

					if (result.code !== 0) {
						throw new Error(
							`DEX swap failed with code ${result.code}: ${result.rawLog}`
						);
					}

					return result;
				} catch (dexError) {
					const dexErrorMsg =
						dexError instanceof Error
							? dexError.message
							: String(dexError);
					logger.error("[ZigChain] DEX swap also failed", {
						error: dexErrorMsg,
						tokenOut,
					});
					throw new Error(
						`Both bonding curve and DEX swap failed. Token may not be tradable. Bonding curve error: ${errorMsg}. DEX error: ${dexErrorMsg}`
					);
				}
			}

			// If it's a different error, throw it
			throw error;
		}
	}

	async swapExactIn(
		mnemonic: string,
		poolId: string,
		tokenIn: { denom: string; amount: string },
		minTokenOut: string
	): Promise<DeliverTxResponse> {
		const wallet = await this.getSigner(mnemonic);
		const [account] = await wallet.getAccounts();
		const client = await this.getSigningClient(mnemonic);

		const msg = {
			typeUrl: "/zigchain.dex.MsgSwapExactIn",
			value: {
				signer: account.address,
				poolId: poolId,
				incoming: tokenIn,
				outgoingMin: {
					denom: poolId,
					amount: minTokenOut,
				},
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

		// No pool found - throw error
		throw new Error(
			`No liquidity pool found for token ${tokenDenom}. This token may not have a pool yet on ZigChain DEX. Please verify the token has liquidity on https://zigscan.org`
		);
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
