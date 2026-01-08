import { db } from '../index.js';

export interface User {
  telegram_id: number;
  username: string | null;
  active_wallet_id: number | null;
  auto_snipe_enabled: number;
  created_at: string;
  updated_at: string;
}

export interface SnipeSettings {
  telegram_id: number;
  buy_amount_uzig: string;
  slippage_tolerance: number;
  auto_buy_new_tokens: number;
  auto_buy_graduated: number;
  min_liquidity: string;
}

export const userRepository = {
  findById(telegramId: number): User | undefined {
    return db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegramId) as User | undefined;
  },

  create(telegramId: number, username?: string): User {
    db.prepare(`
      INSERT INTO users (telegram_id, username, auto_snipe_enabled) VALUES (?, ?, 1)
    `).run(telegramId, username || null);

    db.prepare(`
      INSERT INTO snipe_settings (telegram_id) VALUES (?)
    `).run(telegramId);

    return this.findById(telegramId)!;
  },

  findOrCreate(telegramId: number, username?: string): User {
    const existing = this.findById(telegramId);
    if (existing) return existing;
    return this.create(telegramId, username);
  },

  setActiveWallet(telegramId: number, walletId: number | null): void {
    db.prepare(`
      UPDATE users SET active_wallet_id = ?, updated_at = CURRENT_TIMESTAMP WHERE telegram_id = ?
    `).run(walletId, telegramId);
  },

  setAutoSnipe(telegramId: number, enabled: boolean): void {
    db.prepare(`
      UPDATE users SET auto_snipe_enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE telegram_id = ?
    `).run(enabled ? 1 : 0, telegramId);
  },

  getSnipeSettings(telegramId: number): SnipeSettings | undefined {
    return db.prepare('SELECT * FROM snipe_settings WHERE telegram_id = ?').get(telegramId) as SnipeSettings | undefined;
  },

  updateSnipeSettings(telegramId: number, settings: Partial<SnipeSettings>): void {
    const updates: string[] = [];
    const values: (string | number)[] = [];

    if (settings.buy_amount_uzig !== undefined) {
      updates.push('buy_amount_uzig = ?');
      values.push(settings.buy_amount_uzig);
    }
    if (settings.slippage_tolerance !== undefined) {
      updates.push('slippage_tolerance = ?');
      values.push(settings.slippage_tolerance);
    }
    if (settings.auto_buy_new_tokens !== undefined) {
      updates.push('auto_buy_new_tokens = ?');
      values.push(settings.auto_buy_new_tokens);
    }
    if (settings.auto_buy_graduated !== undefined) {
      updates.push('auto_buy_graduated = ?');
      values.push(settings.auto_buy_graduated);
    }
    if (settings.min_liquidity !== undefined) {
      updates.push('min_liquidity = ?');
      values.push(settings.min_liquidity);
    }

    if (updates.length > 0) {
      values.push(telegramId);
      db.prepare(`UPDATE snipe_settings SET ${updates.join(', ')} WHERE telegram_id = ?`).run(...values);
    }
  },

  getAllAutoSnipeUsers(): User[] {
    return db.prepare('SELECT * FROM users WHERE auto_snipe_enabled = 1 AND active_wallet_id IS NOT NULL').all() as User[];
  },
};
