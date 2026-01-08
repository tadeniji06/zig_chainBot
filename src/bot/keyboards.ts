import { InlineKeyboard } from 'grammy';

export const keyboards = {
  mainMenu: () => new InlineKeyboard()
    .text('💰 Wallets', 'wallets')
    .text('🎯 Snipe Settings', 'settings').row()
    .text('📊 Dashboard', 'dashboard')
    .text('📜 History', 'history').row()
    .text('💎 Holdings', 'holdings')
    .text('🚀 Quick Buy', 'quick_buy').row()
    .text('💎 Tokens', 'tokens')
    .text('ℹ️ Help', 'help'),

  walletMenu: () => new InlineKeyboard()
    .text('➕ Add Wallet', 'wallet_add')
    .text('📋 My Wallets', 'wallet_list').row()
    .text('🔑 Import Mnemonic', 'wallet_import_mnemonic')
    .text('🔐 Import Key', 'wallet_import_key').row()
    .text('🆕 Generate New', 'wallet_generate').row()
    .text('◀️ Back', 'main'),

  walletActions: (walletId: number, isActive: boolean) => {
    const kb = new InlineKeyboard()
      .text('💰 Balance', `wallet_balance_${walletId}`)
      .text('📤 Withdraw', `wallet_withdraw_${walletId}`).row();
    
    if (!isActive) {
      kb.text('✅ Set Active', `wallet_activate_${walletId}`).row();
    }
    
    return kb
      .text('✏️ Rename', `wallet_rename_${walletId}`)
      .text('🗑️ Delete', `wallet_delete_${walletId}`).row()
      .text('◀️ Back to Wallets', 'wallet_list');
  },

  settingsMenu: (settings: { 
    buyAmountZig: number; 
    slippage: number;
    autoNewTokens: boolean;
    autoGraduated: boolean;
  }) => new InlineKeyboard()
    .text(`💵 Buy: ${settings.buyAmountZig} ZIG`, 'set_buy_amount').row()
    .text(`📉 Slippage: ${settings.slippage}%`, 'set_slippage').row()
    .text(`${settings.autoNewTokens ? '✅' : '❌'} Auto-buy New Tokens`, 'toggle_auto_new').row()
    .text(`${settings.autoGraduated ? '✅' : '❌'} Auto-buy Graduated`, 'toggle_auto_graduated').row()
    .text('◀️ Back', 'main'),

  confirmDelete: (walletId: number) => new InlineKeyboard()
    .text('⚠️ Yes, Delete', `wallet_confirm_delete_${walletId}`)
    .text('❌ Cancel', 'wallet_list'),

  buyAmountOptions: () => new InlineKeyboard()
    .text('1000 ZIG', 'buy_amt_1000')
    .text('2000 ZIG', 'buy_amt_2000')
    .text('4000 ZIG', 'buy_amt_4000').row()
    .text('5000 ZIG', 'buy_amt_5000')
    .text('8000 ZIG', 'buy_amt_8000')
    .text('10000 ZIG', 'buy_amt_10000').row()
    .text('✏️ Custom', 'buy_amt_custom')
    .text('◀️ Back', 'settings'),

  slippageOptions: () => new InlineKeyboard()
    .text('0.5%', 'slip_0.5')
    .text('1%', 'slip_1')
    .text('2%', 'slip_2')
    .text('3%', 'slip_3').row()
    .text('5%', 'slip_5')
    .text('10%', 'slip_10')
    .text('15%', 'slip_15')
    .text('20%', 'slip_20').row()
    .text('25%', 'slip_25')
    .text('30%', 'slip_30')
    .text('50%', 'slip_50').row()
    .text('✏️ Custom', 'slip_custom')
    .text('◀️ Back', 'settings'),

  sellPercentageOptions: (tokenDenom: string) => new InlineKeyboard()
    .text('25%', `sell_pct_${encodeURIComponent(tokenDenom)}_25`)
    .text('50%', `sell_pct_${encodeURIComponent(tokenDenom)}_50`)
    .text('75%', `sell_pct_${encodeURIComponent(tokenDenom)}_75`)
    .text('100%', `sell_pct_${encodeURIComponent(tokenDenom)}_100`).row()
    .text('✏️ Custom', `sell_pct_${encodeURIComponent(tokenDenom)}_custom`)
    .text('◀️ Back', 'holdings'),

  holdingsActions: (holdings: any[]) => {
    const kb = new InlineKeyboard();
    holdings.slice(0, 10).forEach((h, i) => {
      const name = h.token_name || h.token_symbol || `Token ${i + 1}`;
      kb.text(`📉 ${name}`, `sell_token_${encodeURIComponent(h.token_denom)}`);
      if ((i + 1) % 2 === 0) kb.row();
    });
    return kb.text('◀️ Back', 'main');
  },

  tokenActions: (denom: string) => new InlineKeyboard()
    .text('🛒 Buy', `buy_token_${encodeURIComponent(denom)}`)
    .text('📊 Info', `token_info_${encodeURIComponent(denom)}`).row()
    .text('◀️ Back', 'tokens'),

  backToMain: () => new InlineKeyboard()
    .text('◀️ Back to Menu', 'main'),

  cancel: () => new InlineKeyboard()
    .text('❌ Cancel', 'cancel'),
};

