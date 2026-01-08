import Database, { Database as DatabaseType } from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

const dbDir = path.dirname(config.database.path);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

export const db: DatabaseType = new Database(config.database.path);

db.pragma('journal_mode = WAL');

export function initDatabase(): void {
  logger.info('Initializing database...');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      telegram_id INTEGER PRIMARY KEY,
      username TEXT,
      active_wallet_id INTEGER,
      auto_snipe_enabled INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS wallets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      address TEXT NOT NULL,
      encrypted_private_key TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (telegram_id) REFERENCES users(telegram_id),
      UNIQUE(telegram_id, address)
    );

    CREATE TABLE IF NOT EXISTS snipe_settings (
      telegram_id INTEGER PRIMARY KEY,
      buy_amount_uzig TEXT DEFAULT '5000000000',
      slippage_tolerance REAL DEFAULT 5,
      auto_buy_new_tokens INTEGER DEFAULT 1,
      auto_buy_graduated INTEGER DEFAULT 1,
      min_liquidity TEXT DEFAULT '0',
      FOREIGN KEY (telegram_id) REFERENCES users(telegram_id)
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id INTEGER NOT NULL,
      wallet_address TEXT NOT NULL,
      tx_hash TEXT NOT NULL,
      token_denom TEXT NOT NULL,
      token_name TEXT,
      token_symbol TEXT,
      action TEXT NOT NULL,
      amount TEXT NOT NULL,
      amount_received TEXT,
      price_per_token TEXT,
      status TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (telegram_id) REFERENCES users(telegram_id)
    );

    CREATE TABLE IF NOT EXISTS tracked_tokens (
      denom TEXT PRIMARY KEY,
      name TEXT,
      symbol TEXT,
      creator TEXT NOT NULL,
      bonding_status TEXT DEFAULT 'active',
      graduated INTEGER DEFAULT 0,
      pool_id TEXT,
      first_seen_at TEXT DEFAULT CURRENT_TIMESTAMP,
      graduated_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_wallets_telegram_id ON wallets(telegram_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_telegram_id ON transactions(telegram_id);
    CREATE INDEX IF NOT EXISTS idx_tracked_tokens_status ON tracked_tokens(bonding_status);
  `);

  // Migration: Add new columns to transactions table if they don't exist
  try {
    const tableInfo = db.prepare('PRAGMA table_info(transactions)').all() as Array<{ name: string }>;
    const columnNames = tableInfo.map(col => col.name);

    if (!columnNames.includes('token_name')) {
      db.exec('ALTER TABLE transactions ADD COLUMN token_name TEXT');
      logger.info('Added token_name column to transactions table');
    }

    if (!columnNames.includes('token_symbol')) {
      db.exec('ALTER TABLE transactions ADD COLUMN token_symbol TEXT');
      logger.info('Added token_symbol column to transactions table');
    }

    if (!columnNames.includes('amount_received')) {
      db.exec('ALTER TABLE transactions ADD COLUMN amount_received TEXT');
      logger.info('Added amount_received column to transactions table');
    }

    if (!columnNames.includes('price_per_token')) {
      db.exec('ALTER TABLE transactions ADD COLUMN price_per_token TEXT');
      logger.info('Added price_per_token column to transactions table');
    }

    // Migration for snipe_settings
    const settingsTableInfo = db.prepare('PRAGMA table_info(snipe_settings)').all() as Array<{ name: string }>;
    const settingsColumnNames = settingsTableInfo.map(col => col.name);

    if (!settingsColumnNames.includes('buy_amount_uzig')) {
      db.exec("ALTER TABLE snipe_settings ADD COLUMN buy_amount_uzig TEXT DEFAULT '5000000000'");
      logger.info('Added buy_amount_uzig column to snipe_settings table');
    }
  } catch (error) {
    logger.error('Migration error', { error });
  }

  logger.info('Database initialized successfully');
}
