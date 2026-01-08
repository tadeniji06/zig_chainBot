import { db } from '../index.js';

export interface Transaction {
  id: number;
  telegram_id: number;
  wallet_address: string;
  tx_hash: string;
  token_denom: string;
  token_name: string | null;
  token_symbol: string | null;
  action: 'buy' | 'sell';
  amount: string;
  amount_received: string | null;
  price_per_token: string | null;
  status: 'pending' | 'success' | 'failed';
  created_at: string;
}

export interface TokenHolding {
  token_denom: string;
  token_name: string | null;
  token_symbol: string | null;
  total_bought: string;
  total_sold: string;
  current_balance: string;
}

export const transactionRepository = {
  create(
    telegramId: number,
    walletAddress: string,
    txHash: string,
    tokenDenom: string,
    action: 'buy' | 'sell',
    amount: string,
    status: 'pending' | 'success' | 'failed',
    tokenName?: string,
    tokenSymbol?: string,
    amountReceived?: string,
    pricePerToken?: string
  ): Transaction {
    const result = db.prepare(`
      INSERT INTO transactions (
        telegram_id, wallet_address, tx_hash, token_denom, token_name, token_symbol,
        action, amount, amount_received, price_per_token, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      telegramId,
      walletAddress,
      txHash,
      tokenDenom,
      tokenName || null,
      tokenSymbol || null,
      action,
      amount,
      amountReceived || null,
      pricePerToken || null,
      status
    );

    return this.findById(result.lastInsertRowid as number)!;
  },

  findById(id: number): Transaction | undefined {
    return db.prepare('SELECT * FROM transactions WHERE id = ?').get(id) as Transaction | undefined;
  },

  findByTelegramId(telegramId: number, limit: number = 20): Transaction[] {
    return db.prepare(
      'SELECT * FROM transactions WHERE telegram_id = ? ORDER BY created_at DESC LIMIT ?'
    ).all(telegramId, limit) as Transaction[];
  },

  findByToken(telegramId: number, tokenDenom: string): Transaction[] {
    return db.prepare(
      'SELECT * FROM transactions WHERE telegram_id = ? AND token_denom = ? ORDER BY created_at DESC'
    ).all(telegramId, tokenDenom) as Transaction[];
  },

  getHoldings(telegramId: number): TokenHolding[] {
    const holdings = db.prepare(`
      SELECT 
        token_denom,
        token_name,
        token_symbol,
        SUM(CASE WHEN action = 'buy' AND status = 'success' THEN CAST(amount AS REAL) ELSE 0 END) as total_bought,
        SUM(CASE WHEN action = 'sell' AND status = 'success' THEN CAST(amount AS REAL) ELSE 0 END) as total_sold
      FROM transactions
      WHERE telegram_id = ?
      GROUP BY token_denom
      HAVING total_bought > total_sold
    `).all(telegramId) as any[];

    return holdings.map(h => ({
      token_denom: h.token_denom,
      token_name: h.token_name,
      token_symbol: h.token_symbol,
      total_bought: h.total_bought.toString(),
      total_sold: h.total_sold.toString(),
      current_balance: (h.total_bought - h.total_sold).toString(),
    }));
  },

  updateStatus(id: number, status: 'success' | 'failed'): boolean {
    const result = db.prepare('UPDATE transactions SET status = ? WHERE id = ?').run(status, id);
    return result.changes > 0;
  },
};
