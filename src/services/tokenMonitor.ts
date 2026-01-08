import { EventEmitter } from 'events';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { zigchainService, TokenInfo, PoolInfo } from './zigchain.js';
import { tokenRepository } from '../database/repositories/tokenRepository.js';

export interface NewTokenEvent {
  token: TokenInfo;
  timestamp: Date;
}

export interface GraduationEvent {
  token: TokenInfo;
  pool: PoolInfo;
  timestamp: Date;
}

export class TokenMonitorService extends EventEmitter {
  private isRunning = false;
  private tokenPollInterval: NodeJS.Timeout | null = null;
  private poolPollInterval: NodeJS.Timeout | null = null;
  private knownTokens: Set<string> = new Set();
  private knownPools: Set<string> = new Set();

  async start(): Promise<void> {
    if (this.isRunning) return;

    logger.info('Starting token monitor service...');
    this.isRunning = true;

    await this.initializeKnownState();

    this.tokenPollInterval = setInterval(
      () => this.pollForNewTokens(),
      config.polling.newTokenInterval
    );

    this.poolPollInterval = setInterval(
      () => this.pollForGraduations(),
      config.polling.graduationInterval
    );

    logger.info('Token monitor service started');
  }

  stop(): void {
    if (!this.isRunning) return;

    logger.info('Stopping token monitor service...');
    this.isRunning = false;

    if (this.tokenPollInterval) {
      clearInterval(this.tokenPollInterval);
      this.tokenPollInterval = null;
    }

    if (this.poolPollInterval) {
      clearInterval(this.poolPollInterval);
      this.poolPollInterval = null;
    }

    logger.info('Token monitor service stopped');
  }

  private async initializeKnownState(): Promise<void> {
    try {
      const existingTokens = await zigchainService.queryNewTokens();
      for (const token of existingTokens) {
        this.knownTokens.add(token.denom);
      }

      const existingPools = await zigchainService.queryPools();
      for (const pool of existingPools) {
        this.knownPools.add(pool.poolId);
        if (pool.baseDenom.startsWith('coin.')) {
          this.knownPools.add(`token:${pool.baseDenom}`);
        }
        if (pool.quoteDenom.startsWith('coin.')) {
          this.knownPools.add(`token:${pool.quoteDenom}`);
        }
      }

      logger.info(`Initialized with ${this.knownTokens.size} tokens and ${existingPools.length} pools`);
    } catch (error) {
      logger.error('Failed to initialize known state', { error });
    }
  }

  private async pollForNewTokens(): Promise<void> {
    try {
      const tokens = await zigchainService.queryNewTokens();

      for (const token of tokens) {
        if (!this.knownTokens.has(token.denom)) {
          this.knownTokens.add(token.denom);
          
          tokenRepository.create(token.denom, token.creator, token.name, token.symbol);

          logger.info('New token detected!', { 
            denom: token.denom, 
            name: token.name,
            symbol: token.symbol,
            creator: token.creator 
          });

          const event: NewTokenEvent = {
            token,
            timestamp: new Date(),
          };

          this.emit('newToken', event);
        }
      }
    } catch (error) {
      logger.error('Error polling for new tokens', { error });
    }
  }

  private async pollForGraduations(): Promise<void> {
    try {
      const pools = await zigchainService.queryPools();

      for (const pool of pools) {
        const baseTokenKey = `token:${pool.baseDenom}`;
        const quoteTokenKey = `token:${pool.quoteDenom}`;

        let graduatedDenom: string | null = null;

        if (pool.baseDenom.startsWith('coin.') && !this.knownPools.has(baseTokenKey)) {
          this.knownPools.add(baseTokenKey);
          graduatedDenom = pool.baseDenom;
        } else if (pool.quoteDenom.startsWith('coin.') && !this.knownPools.has(quoteTokenKey)) {
          this.knownPools.add(quoteTokenKey);
          graduatedDenom = pool.quoteDenom;
        }

        if (graduatedDenom) {
          tokenRepository.markGraduated(graduatedDenom, pool.poolId);

          const tokenRecord = tokenRepository.findByDenom(graduatedDenom);
          const tokenInfo: TokenInfo = {
            denom: graduatedDenom,
            creator: tokenRecord?.creator || '',
            name: tokenRecord?.name || undefined,
            symbol: tokenRecord?.symbol || undefined,
            mintingCap: '0',
          };

          logger.info('Token graduation detected!', {
            denom: graduatedDenom,
            poolId: pool.poolId,
          });

          const event: GraduationEvent = {
            token: tokenInfo,
            pool,
            timestamp: new Date(),
          };

          this.emit('graduation', event);
        }
      }
    } catch (error) {
      logger.error('Error polling for graduations', { error });
    }
  }

  getStats(): { knownTokens: number; knownPools: number; isRunning: boolean } {
    return {
      knownTokens: this.knownTokens.size,
      knownPools: this.knownPools.size,
      isRunning: this.isRunning,
    };
  }
}

export const tokenMonitor = new TokenMonitorService();
