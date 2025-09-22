use anchor_lang::prelude::*;
use anchor_lang::solana_program::pubkey;
use anchor_lang::solana_program::{program::invoke, system_instruction};
use solana_program::keccak;

declare_id!("9yWzBLvPQxyezB9LvRqGEZHG4aQMBKuXzGPNxQRqxDXj"); // replace with actual program ID on deployment

// Define your AUTHORITY_PUBKEY clearly:
pub const AUTHORITY_PUBKEY: Pubkey = pubkey!("CBKPbzTqdz4TMa1qoGCAokuSASGkAXtKZ9EWovwnSSfG");

#[account]
pub struct UserVault {
    pub owner: Pubkey,
    pub bump: u8,
    pub locked_amount: u64,
    pub active_games: u32,
    pub accum_wager: u64,  // Accumulated effective wager (lamports scale)
}

#[account]
pub struct HouseVault {
    pub bump: u8, // PDA bump for the house vault
                  // (No other data needed; this account’s lamports represent the house’s balance)
}

// NEW: 7 Gem types (rarity order: common to legendary)
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Debug)]
pub enum GemType {
    Garnet,     // Common
    Amethyst,
    Topaz,
    Sapphire,
    Emerald,
    Ruby,
    Diamond,    // Legendary
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
        vault.accum_wager = 0;
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
        
        msg!("Deposit completed: {} lamports", amount);
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
        
        msg!("Withdraw completed: {} lamports", amount);
        Ok(())
    }

    /// Atomic bet + settle in one go
    ///
    /// * `stake`   – lamports staked
    /// * `payout` – lamports to give back (0 ➜ player lost)
    /// * `multiplier` – rank boost (100=1x, 200=2x)
    pub fn bet_and_settle(
        ctx: Context<BetAndSettle>,
        stake: u64,
        payout: u64,
        multiplier: u16,  // NEW: 100-300
    ) -> Result<()> {
        require!(stake > 0, VaultError::InvalidAmount);
        require!(multiplier >= 50 && multiplier <= 300, VaultError::InvalidMultiplier);
        let vault       = &mut ctx.accounts.vault;
        let vault_info  = vault.to_account_info();
        let house_info  = ctx.accounts.house_vault.to_account_info();

        // authority check
        require!(
            ctx.accounts.authority.key() == AUTHORITY_PUBKEY,
            VaultError::Unauthorized
        );

        // 1. make sure player has stake free
        let available = (**vault_info.lamports.borrow()).saturating_sub(vault.locked_amount);
        require!(available >= stake, VaultError::InsufficientFunds);

        // 2. lock stake and move to house
        vault.locked_amount = vault
            .locked_amount
            .checked_add(stake)
            .ok_or(VaultError::Overflow)?;
        **vault_info.try_borrow_mut_lamports()? -= stake;
        **house_info.try_borrow_mut_lamports()? += stake;

        // 3. immediately settle the round
        vault.locked_amount -= stake;      // unlock
        // payout == stake + profit OR stake (refund) OR 0 (loss)
        if payout > 0 {
            require!(**house_info.lamports.borrow() >= payout, VaultError::HouseInsufficient);
            **house_info.try_borrow_mut_lamports()? -= payout;
            **vault_info.try_borrow_mut_lamports()? += payout;
        }
        // no else – stake already with house

        // active_games net-zero change (never >1)
        msg!("Round settled in one tx: stake {}, payout {}", stake, payout);

        // NEW: Gem awarding logic
        let effective_wager = stake;  // Use full stake for gem calculation
        vault.accum_wager += effective_wager;

        let threshold = 100_000_000u64;  // 0.1 SOL lamports
        let mut awarded_gems: Vec<GemType> = Vec::new();

        // Create bindings to avoid temporary value issues
        let instruction_account = ctx.accounts.instruction_sysvar.to_account_info();
        let instruction_data = instruction_account.data.borrow();
        let slot_bytes = ctx.accounts.clock.slot.to_le_bytes();
        let wager_bytes = effective_wager.to_le_bytes();
        
        let base_seed_data = [
            &instruction_data[..32],
            &slot_bytes[..],
            &wager_bytes[..],
        ];
        let base_hash = keccak::hashv(&base_seed_data);

        let mut roll_count = 0u32;
        while vault.accum_wager >= threshold {
            vault.accum_wager -= threshold;

            // Create bindings for roll seed data
            let base_hash_bytes = base_hash.to_bytes();
            let roll_count_bytes = roll_count.to_le_bytes();
            let roll_seed_data = [&base_hash_bytes[..], &roll_count_bytes[..]];
            let roll_hash = keccak::hashv(&roll_seed_data);
            let roll_hash_bytes = roll_hash.to_bytes();
            let roll = u64::from_le_bytes(roll_hash_bytes[0..8].try_into().unwrap()) % 1000;  // 0-999 for finer %

            // Base nothing: 700/1000 = 70%
            // Awards 300/1000 = 30% base, scaled by multiplier (e.g., 1.2x → 360/1000 awards)
            let base_award_prob = 300u64;  // Out of 1000
            let effective_award_prob = base_award_prob * (multiplier as u64) / 100;
            let nothing_prob = 1000 - effective_award_prob.min(1000);  // Cap at 100%

            if roll < nothing_prob { 
                roll_count += 1;
                continue; 
            }

            // Within award window (effective_award_prob): Distribute decreasingly
            // Garnet ~15% base → 150/1000, Amethyst 8%→80, Topaz 4%→40, Sapphire 2%→20, Emerald 0.7%→7, Ruby 0.2%→2, Diamond 0.1%→1
            let sub_probs = [150, 230, 270, 290, 297, 299, 300];  // Cumulative within 300 base
            let award_roll = (roll - nothing_prob) * 300 / effective_award_prob;  // Scale to base 300 for distrib

            let gem = if award_roll < sub_probs[0] { GemType::Garnet }
                else if award_roll < sub_probs[1] { GemType::Amethyst }
                else if award_roll < sub_probs[2] { GemType::Topaz }
                else if award_roll < sub_probs[3] { GemType::Sapphire }
                else if award_roll < sub_probs[4] { GemType::Emerald }
                else if award_roll < sub_probs[5] { GemType::Ruby }
                else { GemType::Diamond };

            awarded_gems.push(gem);
            msg!("Gem {:?} queued on roll {}", gem, roll_count);

            roll_count += 1;
            if roll_count > 100 { break; }
        }

        if !awarded_gems.is_empty() {
            emit!(GemsAwarded {
                user: vault.owner,
                gems: awarded_gems,
                effective_wager_per_roll: threshold,
                num_rolls: roll_count,
                multiplier_applied: multiplier,
            });
            msg!("{} gems awarded in batch with {}x multiplier", roll_count, multiplier as f32 / 100.0);
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
    #[account(init, seeds=[b"vault", user.key().as_ref()], bump, payer=user, space=8 + 32 + 1 + 8 + 4 + 8)]
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
pub struct BetAndSettle<'info> {
    #[account(mut, seeds=[b"vault", vault.owner.key().as_ref()], bump = vault.bump)]
    pub vault: Account<'info, UserVault>,
    #[account(mut, seeds=[b"house_vault"], bump = house_vault.bump)]
    pub house_vault: Account<'info, HouseVault>,
    /// CHECK: hard-coded backend signer
    #[account(signer, address = AUTHORITY_PUBKEY)]
    pub authority: AccountInfo<'info>,
    /// CHECK: Solana sysvar for randomness
    #[account(address = anchor_lang::solana_program::sysvar::instructions::id())]
    pub instruction_sysvar: AccountInfo<'info>,
    pub clock: Sysvar<'info, Clock>,
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

// Event
#[event]
pub struct GemsAwarded {
    pub user: Pubkey,
    pub gems: Vec<GemType>,
    pub effective_wager_per_roll: u64,
    pub num_rolls: u32,
    pub multiplier_applied: u16,  // For verification
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
    #[msg("Invalid multiplier specified (must be 50-300)")]
    InvalidMultiplier,
}
