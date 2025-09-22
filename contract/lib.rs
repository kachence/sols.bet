use anchor_lang::prelude::*;
use anchor_lang::solana_program::pubkey;
use anchor_lang::solana_program::{program::invoke, system_instruction};
declare_id!("9yWzBLvPQxyezB9LvRqGEZHG4aQMBKuXzGPNxQRqxDXj"); // replace with actual program ID on deployment

// Define your AUTHORITY_PUBKEY clearly:
pub const AUTHORITY_PUBKEY: Pubkey = pubkey!("CBKPbzTqdz4TMa1qoGCAokuSASGkAXtKZ9EWovwnSSfG");

#[account]
pub struct UserVault {
    pub owner: Pubkey,
    pub bump: u8,
    pub locked_amount: u64,
    pub active_games: u32,
}

#[account]
pub struct HouseVault {
    pub bump: u8, // PDA bump for the house vault
                  // (No other data needed; this account’s lamports represent the house’s balance)
}

#[program]
pub mod smart_vault {
    use super::*;

    /// Initialize a new UserVault PDA for the user.
    pub fn initialize_vault(ctx: Context<InitializeVault>) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        vault.owner = ctx.accounts.user.key();
        vault.bump = ctx.bumps.vault;
        vault.locked_amount = 0;
        vault.active_games = 0;
        Ok(())
    }

    /// Initialize the global HouseVault PDA (run once by the operator/admin).
    pub fn initialize_house(ctx: Context<InitializeHouse>) -> Result<()> {
        let house_vault = &mut ctx.accounts.house_vault;
        house_vault.bump = ctx.bumps.house_vault;
        Ok(())
    }

    /// Deposit SOL into the user's vault.
    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        require!(amount > 0, VaultError::InvalidAmount);
        let user = &ctx.accounts.user; // user wallet (signer)
        let vault_info = ctx.accounts.vault.to_account_info();

        // Transfer lamports from user to vault using system program CPI
        invoke(
            &system_instruction::transfer(
                &user.key(),       // from user
                &vault_info.key(), // to vault PDA
                amount,
            ),
            &[
                user.to_account_info().clone(),
                vault_info.clone(),
                ctx.accounts.system_program.to_account_info().clone(),
            ],
        )?;
        // (Anchor will ensure `user` signed, so the transfer is authorized)
        Ok(())
    }

    /// Withdraw SOL from the vault back to the user's wallet.
    /// Only allowed if no active games are in progress.
    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        require!(amount > 0, VaultError::InvalidAmount);
        let vault = &mut ctx.accounts.vault;
        let user_info = ctx.accounts.owner.to_account_info();
        let vault_info = vault.to_account_info();

        // Ensure the user can withdraw (no ongoing games locking funds)
        require!(vault.active_games == 0, VaultError::GamesInProgress);
        // Ensure vault has enough balance to withdraw the requested amount
        require!(
            **vault_info.lamports.borrow() >= amount,
            VaultError::InsufficientFunds
        );

        // Transfer lamports from vault PDA to user's wallet
        **vault_info.try_borrow_mut_lamports()? -= amount;
        **user_info.try_borrow_mut_lamports()? += amount;
        // (We manipulate lamports directly because vault is program-owned:contentReference[oaicite:5]{index=5})
        Ok(())
    }

    /// ------------------------------------------------------------------------
    /// 1.  Player places a bet
    ///     - `stake` is moved from the user's vault to the house vault
    ///     - that stake is also tracked in `locked_amount`
    /// ------------------------------------------------------------------------
    pub fn place_bet(ctx: Context<PlaceBet>, stake: u64) -> Result<()> {
        require!(stake > 0, VaultError::InvalidAmount);

        let vault = &mut ctx.accounts.vault;
        let vault_info = vault.to_account_info();
        let house_info = ctx.accounts.house_vault.to_account_info();

        // Only the authorised backend can call
        require!(
            ctx.accounts.authority.key() == AUTHORITY_PUBKEY,
            VaultError::Unauthorized
        );

        // Make sure the user has the SOL available
        let available = (**vault_info.lamports.borrow()).saturating_sub(vault.locked_amount);
        require!(available >= stake, VaultError::InsufficientFunds);

        // Lock funds and transfer to house vault
        vault.locked_amount = vault
            .locked_amount
            .checked_add(stake)
            .ok_or(VaultError::Overflow)?;
        vault.active_games += 1;

        **vault_info.try_borrow_mut_lamports()? -= stake;
        **house_info.try_borrow_mut_lamports()? += stake;

        msg!("Bet placed: {} lamports locked and sent to house", stake);
        Ok(())
    }

    /// Settle a completed game round.
    ///
    /// * `stake`  – lamports that were locked when the bet was placed  
    /// * `payout` – total lamports the player should receive (0 if they lost,
    ///              stake + profit if they won, stake if push/refund).
    pub fn settle_game(ctx: Context<SettleGame>, stake: u64, payout: u64) -> Result<()> {
        // --- Account & state checks -------------------------------------------------
        require!(stake > 0, VaultError::InvalidAmount);
        let vault       = &mut ctx.accounts.vault;
        let vault_info  = vault.to_account_info();
        let house_info  = ctx.accounts.house_vault.to_account_info();

        require!(ctx.accounts.authority.key() == AUTHORITY_PUBKEY, VaultError::Unauthorized);
        require!(vault.active_games > 0,                             VaultError::NoActiveGame);
        require!(vault.locked_amount >= stake,                       VaultError::SettlementMismatch);

        // --- Common processing  -----------------------------------------------------
        // 1.  Unlock the stake in bookkeeping (same line for every outcome)
        vault.locked_amount -= stake;
        vault.active_games  -= 1;

        // 2.  Funds movement
        //
        //      • If payout == 0 → player lost → stake already in house vault, nothing else to do.
        //      • If payout  > 0 → house must pay `payout` to player (includes stake).
        //
        if payout > 0 {
            require!(**house_info.lamports.borrow() >= payout, VaultError::HouseInsufficient);
            **house_info.try_borrow_mut_lamports()? -= payout;
            **vault_info.try_borrow_mut_lamports()? += payout;
            msg!("Player paid out {} lamports (stake {}, profit {})",
                payout, stake, payout.saturating_sub(stake));
        } else {
            // loss – stake remains in house_vault
            msg!("Player lost, house keeps stake {}", stake);
        }

        Ok(())
    }

    /// Pay additional winnings that were not part of the original stake.
    /// Does **not** touch `locked_amount` or `active_games`.
    pub fn credit_win(ctx: Context<CreditWin>, amount: u64) -> Result<()> {
        require!(amount > 0, VaultError::InvalidAmount);
        require!(ctx.accounts.authority.key() == AUTHORITY_PUBKEY, VaultError::Unauthorized);

        let house_info = ctx.accounts.house_vault.to_account_info();
        let vault_info = ctx.accounts.vault.to_account_info();

        require!(**house_info.lamports.borrow() >= amount, VaultError::HouseInsufficient);

        **house_info.try_borrow_mut_lamports()? -= amount;
        **vault_info.try_borrow_mut_lamports()? += amount;

        msg!("Bonus win credited: {} lamports", amount);
        Ok(())
    }

    /// Pay additional winnings that were not part of the original stake.
    /// Does **not** touch `locked_amount` or `active_games`.
    pub fn debit_loss(ctx: Context<DebitLoss>, amount: u64) -> Result<()> {
        require!(amount > 0, VaultError::InvalidAmount);
        require!(ctx.accounts.authority.key() == AUTHORITY_PUBKEY, VaultError::Unauthorized);

        let house_info = ctx.accounts.house_vault.to_account_info();
        let vault_info = ctx.accounts.vault.to_account_info();

        require!(**vault_info.lamports.borrow() >= amount, VaultError::InsufficientFunds);

        **vault_info.try_borrow_mut_lamports()? -= amount;
        **house_info.try_borrow_mut_lamports()? += amount;

        msg!("Loss debited: {} lamports", amount);
        Ok(())
    }
}

// Contexts for instructions:

#[derive(Accounts)]
pub struct InitializeVault<'info> {
    #[account(init, seeds=[b"vault", user.key().as_ref()], bump, payer=user, space=8 + 32 + 1 + 8 + 4)]
    pub vault: Account<'info, UserVault>,
    #[account(mut)]
    pub user: Signer<'info>, // user paying for account creation
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct InitializeHouse<'info> {
    #[account(init, seeds=[b"house_vault"], bump, payer=admin, space=8 + 1)]
    pub house_vault: Account<'info, HouseVault>,
    #[account(mut)]
    pub admin: Signer<'info>, // casino operator initializing the house account
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut, has_one = owner)]
    pub vault: Account<'info, UserVault>,
    #[account(signer)]
    pub owner: AccountInfo<'info>, // user's wallet (must match vault.owner)
    #[account(mut)]
    pub user: Signer<'info>, // same as owner, for Anchor context
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut, has_one = owner)]
    pub vault: Account<'info, UserVault>,
    #[account(mut)]
    pub owner: Signer<'info>, // user withdrawing (must be vault owner)
                              // no system_program needed for direct lamport transfer
}

#[derive(Accounts)]
pub struct PlaceBet<'info> {
    #[account(mut)]
    pub vault: Account<'info, UserVault>, // player’s PDA
    #[account(mut)]
    pub house_vault: Account<'info, HouseVault>, // house PDA
    /// CHECK: authority is compared to constant, so no data is read
    #[account(signer, address = AUTHORITY_PUBKEY)]
    pub authority: AccountInfo<'info>, // casino server
}

#[derive(Accounts)]
pub struct SettleGame<'info> {
    #[account(mut)]
    pub vault: Account<'info, UserVault>,
    #[account(mut)]
    pub house_vault: Account<'info, HouseVault>,
    /// CHECK: same authority check
    #[account(signer, address = AUTHORITY_PUBKEY)]
    pub authority: AccountInfo<'info>,
}

/// Accounts for `credit_win`
#[derive(Accounts)]
pub struct CreditWin<'info> {
    #[account(mut)]
    pub vault: Account<'info, UserVault>,       // player vault PDA
    #[account(mut)]
    pub house_vault: Account<'info, HouseVault>,// house PDA
    /// CHECK: only the hard-coded authority may sign
    #[account(signer, address = AUTHORITY_PUBKEY)]
    pub authority: AccountInfo<'info>,
}

/// Accounts for `debit_loss`
#[derive(Accounts)]
pub struct DebitLoss<'info> {
    #[account(mut)]
    pub vault: Account<'info, UserVault>,       // player vault PDA
    #[account(mut)]
    pub house_vault: Account<'info, HouseVault>,// house PDA
    /// CHECK: only the hard-coded authority may sign
    #[account(signer, address = AUTHORITY_PUBKEY)]
    pub authority: AccountInfo<'info>,
}

#[error_code]
pub enum VaultError {
    #[msg("Invalid amount specified")]
    InvalidAmount,
    #[msg("Withdrawal not allowed: games in progress")]
    GamesInProgress,
    #[msg("Insufficient funds for this operation")]
    InsufficientFunds,
    #[msg("No active game to settle")]
    NoActiveGame,
    #[msg("Mismatched locked amount for settlement")]
    SettlementMismatch,
    #[msg("Unauthorized caller")]
    Unauthorized,
    #[msg("House vault has insufficient funds")]
    HouseInsufficient,
    #[msg("Arithmetic overflow")]
    Overflow,
}
