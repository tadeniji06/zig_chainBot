import { db } from '../index.js';

export interface Wallet {
  id: number;
  telegram_id: number;
  name: string;
  address: string;
  encrypted_private_key: string;
  created_at: string;
}

export const walletRepository = {
  findById(id: number): Wallet | undefined {
    return db.prepare('SELECT * FROM wallets WHERE id = ?').get(id) as Wallet | undefined;
  },

  findByTelegramId(telegramId: number): Wallet[] {
    return db.prepare('SELECT * FROM wallets WHERE telegram_id = ? ORDER BY created_at DESC').all(telegramId) as Wallet[];
  },

  findByAddress(telegramId: number, address: string): Wallet | undefined {
    return db.prepare('SELECT * FROM wallets WHERE telegram_id = ? AND address = ?').get(telegramId, address) as Wallet | undefined;
  },

  create(telegramId: number, name: string, address: string, encryptedPrivateKey: string): Wallet {
    const result = db.prepare(`
      INSERT INTO wallets (telegram_id, name, address, encrypted_private_key) VALUES (?, ?, ?, ?)
    `).run(telegramId, name, address, encryptedPrivateKey);

    return this.findById(result.lastInsertRowid as number)!;
  },

  delete(id: number, telegramId: number): boolean {
    const result = db.prepare('DELETE FROM wallets WHERE id = ? AND telegram_id = ?').run(id, telegramId);
    return result.changes > 0;
  },

  rename(id: number, telegramId: number, newName: string): boolean {
    const result = db.prepare('UPDATE wallets SET name = ? WHERE id = ? AND telegram_id = ?').run(newName, id, telegramId);
    return result.changes > 0;
  },

  count(telegramId: number): number {
    const result = db.prepare('SELECT COUNT(*) as count FROM wallets WHERE telegram_id = ?').get(telegramId) as { count: number };
    return result.count;
  },
};
