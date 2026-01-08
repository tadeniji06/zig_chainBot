import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  telegram: {
    botToken: requireEnv('TELEGRAM_BOT_TOKEN'),
  },

  zigchain: {
    rpcUrl: process.env.ZIGCHAIN_RPC_URL || 'https://public-zigchain-rpc.numia.xyz',
    apiUrl: process.env.ZIGCHAIN_API_URL || 'https://public-zigchain-lcd.numia.xyz',
    chainId: process.env.CHAIN_ID || 'zigchain-1',
    prefix: process.env.BECH32_PREFIX || 'zig',
    gasPrice: process.env.GAS_PRICE || '0.0025uzig',
    denom: 'uzig',
  },

  security: {
    encryptionKey: requireEnv('ENCRYPTION_KEY'),
  },

  sniping: {
    buyPercentage: parseInt(process.env.BUY_PERCENTAGE || '80', 10),
    slippageTolerance: parseInt(process.env.SLIPPAGE_TOLERANCE || '5', 10),
    maxGasLimit: parseInt(process.env.MAX_GAS_LIMIT || '500000', 10),
  },

  polling: {
    newTokenInterval: parseInt(process.env.NEW_TOKEN_POLL_INTERVAL || '1000', 10),
    graduationInterval: parseInt(process.env.GRADUATION_POLL_INTERVAL || '2000', 10),
  },

  database: {
    path: process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'bot.db'),
  },
} as const;

export type Config = typeof config;
