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

    // ────────────────────────────────────────────────────────────────────────────
    //  batch_settle ─ settle many users in one transaction
    //
    //  • `users[i]`   = owner pubkey of the i-th user vault
    //  • `profits[i]` = net profit for that user
    //                   >0 → house pays player
    //                   <0 → player’s locked stake moves to house
    //                   0  → no lamport movement
    //
    //  All user vault PDAs must be passed in `remaining_accounts` in the
    //  *same order* as the `users` vector (writable, not signer).
    //
    //  compute-units  ~ 35k  + 2k × (#users)
    //  fee            sig (5k) + CU_price × CU
    // ────────────────────────────────────────────────────────────────────────────
    pub fn batch_settle(
        ctx: Context<BatchSettle>,
        users: Vec<Pubkey>,
        profits: Vec<i64>,      // same length as users
    ) -> Result<()> {
        require!(
            users.len() == profits.len(),
            VaultError::InvalidAmount      // reuse existing error enum
        );

        let house_info = ctx.accounts.house_vault.to_account_info();
        let remaining  = &ctx.remaining_accounts;

        // Each user vault must be provided as a remaining account
        require!(
            remaining.len() == users.len(),
            VaultError::InvalidAmount
        );

        for (i, user_pk) in users.iter().enumerate() {
            // Vault PDA must be [b"vault", user_pk]
            let (expected_pda, _bump) =
                Pubkey::find_program_address(&[b"vault", user_pk.as_ref()], ctx.program_id);

            let vault_info = remaining[i].to_account_info();
            require!(vault_info.key() == expected_pda, VaultError::Unauthorized);
            require!(vault_info.is_writable,           VaultError::Unauthorized);

            let delta = profits[i];

            // Loss => move lamports from player vault TO house
            if delta < 0 {
                let lamports = (-delta) as u64;
                **vault_info.try_borrow_mut_lamports()? -= lamports;
                **house_info.try_borrow_mut_lamports()? += lamports;
                msg!("User {:?} lost {} lamports", user_pk, lamports);

            // Win  => move lamports from house TO player vault
            } else if delta > 0 {
                let lamports = delta as u64;
                require!(
                    **house_info.lamports.borrow() >= lamports,
                    VaultError::HouseInsufficient
                );
                **house_info.try_borrow_mut_lamports()? -= lamports;
                **vault_info.try_borrow_mut_lamports()? += lamports;
                msg!("User {:?} won {} lamports", user_pk, lamports);
            } else {
                // delta == 0 -> nothing to move
                msg!("User {:?} net 0 lamports", user_pk);
            }
        }

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
pub struct BatchSettle<'info> {
    /// House vault PDA (writable, hot funds)
    #[account(mut)]
    pub house_vault: Account<'info, HouseVault>,

    /// CPI signer (casino authority = system wallet)
    /// CHECK: compared to constant
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
