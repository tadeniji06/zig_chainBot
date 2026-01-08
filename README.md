# ZigChain Sniper Bot 🎯

A Telegram bot for sniping tokens on ZigChain's meme.fun launchpad and OroSwap DEX.

## Features

- 🚀 **Auto-snipe new token launches** - Detects and buys tokens as soon as they're created
- 🎓 **Auto-buy graduated tokens** - Automatically buys when tokens graduate to OroSwap DEX
- 💼 **Multi-wallet support** - Manage multiple wallets, switch between them easily
- ⚡ **Lightning-fast execution** - Optimized for speed with configurable gas settings
- 🔐 **Secure wallet storage** - Private keys are AES-256-GCM encrypted
- 📊 **Real-time monitoring** - Polls ZigChain for new tokens and pool creations
- 🎨 **Modern Telegram UX** - Clean inline keyboards and intuitive navigation

## How It Works

1. **Token Detection**: The bot monitors ZigChain's Factory module for new token creations (`denom_created` events)
2. **Graduation Detection**: It also monitors the DEX module for new liquidity pools, indicating tokens have graduated from meme.fun
3. **Auto-Sniping**: When enabled, uses 80% (configurable) of your active wallet's balance to buy the token
4. **Notifications**: Sends real-time alerts for new tokens and successful snipes

## Prerequisites

- Node.js 18+
- npm or pnpm
- A Telegram Bot Token (from [@BotFather](https://t.me/BotFather))
- ZIG tokens for trading

## Installation

1. **Clone and install dependencies:**
   ```bash
   cd zig_chainbot
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and set:
   - `TELEGRAM_BOT_TOKEN` - Your bot token from BotFather
   - `ENCRYPTION_KEY` - Generate with `openssl rand -hex 32`

3. **Build and run:**
   ```bash
   npm run build
   npm start
   ```

   Or for development:
   ```bash
   npm run dev
   ```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `TELEGRAM_BOT_TOKEN` | Bot token from @BotFather | Required |
| `ZIGCHAIN_RPC_URL` | ZigChain RPC endpoint | `https://public-zigchain-rpc.numia.xyz` |
| `ZIGCHAIN_API_URL` | ZigChain REST API endpoint | `https://public-zigchain-lcd.numia.xyz` |
| `ENCRYPTION_KEY` | 32-byte hex key for wallet encryption | Required |
| `BUY_PERCENTAGE` | Default % of balance to use | `80` |
| `SLIPPAGE_TOLERANCE` | Max slippage % | `5` |
| `NEW_TOKEN_POLL_INTERVAL` | Token polling interval (ms) | `1000` |

## Bot Commands

- `/start` - Start the bot and show welcome message
- `/menu` - Open main menu
- `/wallets` - Manage wallets
- `/settings` - Configure snipe settings
- `/tokens` - View recently detected tokens
- `/help` - Show help information

## Architecture

```
src/
├── bot/                    # Telegram bot handlers
│   ├── handlers/           # Command and callback handlers
│   ├── keyboards.ts        # Inline keyboard definitions
│   ├── messages.ts         # Message templates
│   └── notifications.ts    # Alert system
├── config/                 # Configuration
├── database/               # SQLite database
│   └── repositories/       # Data access layer
├── services/
│   ├── zigchain.ts         # ZigChain blockchain interaction
│   ├── tokenMonitor.ts     # Token detection service
│   └── sniper.ts           # Auto-buy execution
└── utils/                  # Helpers (encryption, logging)
```

## Security

- Private keys are encrypted using AES-256-GCM
- Mnemonic phrases are only shown once, then hidden
- Messages containing sensitive data auto-delete after 60 seconds
- Never logs or exposes private keys

## Monitoring Strategy

Since meme.fun doesn't have a public API, the bot monitors the ZigChain blockchain directly:

1. **Factory Module Polling**: Queries `/zigchain/factory/denoms` for new token creations
2. **DEX Module Polling**: Queries `/zigchain/dex/pools` for new liquidity pools
3. **Event Correlation**: When a token denom appears in a new pool, it's marked as "graduated"

## Disclaimer

⚠️ **Use at your own risk.** This bot is for educational purposes. Cryptocurrency trading involves substantial risk. Never invest more than you can afford to lose.

## License

MIT
