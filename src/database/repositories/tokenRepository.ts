import { db } from '../index.js';

export interface TrackedToken {
  denom: string;
  name: string | null;
  symbol: string | null;
  creator: string;
  bonding_status: string;
  graduated: number;
  pool_id: string | null;
  first_seen_at: string;
  graduated_at: string | null;
}

export const tokenRepository = {
  findByDenom(denom: string): TrackedToken | undefined {
    return db.prepare('SELECT * FROM tracked_tokens WHERE denom = ?').get(denom) as TrackedToken | undefined;
  },

  create(denom: string, creator: string, name?: string, symbol?: string): TrackedToken {
    db.prepare(`
      INSERT OR IGNORE INTO tracked_tokens (denom, creator, name, symbol) VALUES (?, ?, ?, ?)
    `).run(denom, creator, name || null, symbol || null);

    return this.findByDenom(denom)!;
  },

  markGraduated(denom: string, poolId: string): void {
    db.prepare(`
      UPDATE tracked_tokens 
      SET graduated = 1, pool_id = ?, graduated_at = CURRENT_TIMESTAMP, bonding_status = 'graduated'
      WHERE denom = ?
    `).run(poolId, denom);
  },

  updateBondingStatus(denom: string, status: string): void {
    db.prepare('UPDATE tracked_tokens SET bonding_status = ? WHERE denom = ?').run(status, denom);
  },

  getActiveTokens(): TrackedToken[] {
    return db.prepare('SELECT * FROM tracked_tokens WHERE bonding_status = ?').all('active') as TrackedToken[];
  },

  getGraduatedTokens(): TrackedToken[] {
    return db.prepare('SELECT * FROM tracked_tokens WHERE graduated = 1').all() as TrackedToken[];
  },

  getRecentTokens(limit: number = 20): TrackedToken[] {
    return db.prepare('SELECT * FROM tracked_tokens ORDER BY first_seen_at DESC LIMIT ?').all(limit) as TrackedToken[];
  },

  getLastProcessedHeight(): number {
    const result = db.prepare(`
      SELECT MAX(CAST(substr(first_seen_at, 1, 10) AS INTEGER)) as height FROM tracked_tokens
    `).get() as { height: number | null };
    return result?.height || 0;
  },
};
