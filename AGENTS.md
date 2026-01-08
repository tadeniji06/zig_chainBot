# ZigChain Sniper Bot

## Quick Start

```bash
# Install dependencies
npm install

# Copy environment file and configure
cp .env.example .env
# Edit .env with your TELEGRAM_BOT_TOKEN and ENCRYPTION_KEY

# Development mode
npm run dev

# Production build
npm run build
npm start
```

## Commands

- `npm install` - Install dependencies
- `npm run dev` - Run in development mode with hot reload
- `npm run build` - Compile TypeScript to JavaScript
- `npm start` - Run compiled production build
- `npm run typecheck` - Type-check without building

## Environment Variables Required

- `TELEGRAM_BOT_TOKEN` - Get from @BotFather on Telegram
- `ENCRYPTION_KEY` - Generate with: `openssl rand -hex 32`

## Architecture

The bot monitors ZigChain blockchain directly (since meme.fun has no public API):
1. Polls `/zigchain/factory/denoms` for new token creations
2. Polls `/zigchain/dex/pools` for graduation to OroSwap
3. Auto-snipes using 80% of active wallet balance (configurable)

## ZigChain Endpoints

- Mainnet RPC: https://public-zigchain-rpc.numia.xyz
- Mainnet API: https://public-zigchain-lcd.numia.xyz
- Testnet RPC: https://public-zigchain-testnet-rpc.numia.xyz
- Testnet API: https://public-zigchain-testnet-lcd.numia.xyz
