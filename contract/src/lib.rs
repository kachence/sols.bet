use anchor_lang::prelude::*;
use anchor_lang::solana_program::{program::invoke, system_instruction};

declare_id!("3hYE1Bv7ZtUUJLMjzFjq13j2AKd63TzrdvduzUBRjbCg");

#[program]
pub mod smart_vault_v2 {
    use super::*;

    /// Initialize a new UserVault PDA for the user
    pub fn initialize_vault(ctx: Context<InitializeVault>) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        vault.owner = ctx.accounts.user.key();
        vault.bump = ctx.bumps.vault;
        vault.locked_amount = 0;
        vault.active_games = 0;
        vault.accum_wager = 0;
        vault.version = 2;
        Ok(())
    }

    /// Initialize the global HouseVault PDA
    pub fn initialize_house(ctx: Context<InitializeHouse>) -> Result<()> {
        let house_vault = &mut ctx.accounts.house_vault;
        house_vault.bump = ctx.bumps.house_vault;
        house_vault.multisig_authority = "BMprzPNF9FTni4mJWwCJnk91ZzhKdxGCx7BwPckMRzBt".parse().unwrap();
        house_vault.admin_authority = "4y1oXmheqD5VNScoNwLH17WQQExXSxBasH6TTwCb4iN5".parse().unwrap();
        house_vault.total_volume = 0;
        house_vault.version = 2;
        Ok(())
    }

    /// Initialize pause configuration
    pub fn initialize_pause_config(ctx: Context<InitializePauseConfig>) -> Result<()> {
        let config = &mut ctx.accounts.pause_config;
        config.multisig_authority = "BMprzPNF9FTni4mJWwCJnk91ZzhKdxGCx7BwPckMRzBt".parse().unwrap();
        config.admin_authority = "4y1oXmheqD5VNScoNwLH17WQQExXSxBasH6TTwCb4iN5".parse().unwrap();
        config.maintenance_pause = false;
        config.maintenance_start_time = 0;
        config.maintenance_duration_hours = 4;
        config.emergency_pause = false;
        config.bump = ctx.bumps.pause_config;
        Ok(())
    }

    /// Close pause configuration account and return rent to authority
    pub fn close_pause_config(ctx: Context<ClosePauseConfig>) -> Result<()> {
        // Only admin or multisig can close
        require!(
            ctx.accounts.authority.key() == ctx.accounts.pause_config.admin_authority ||
            ctx.accounts.authority.key() == ctx.accounts.pause_config.multisig_authority,
            VaultError::Unauthorized
        );
        
        // Close the account and return rent to authority
        ctx.accounts.pause_config.close(ctx.accounts.authority.to_account_info())?;
        Ok(())
    }

    /// Deposit SOL into the user's vault
    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        require!(amount > 0, VaultError::InvalidAmount);
        
        // Check for any pause (with auto-unpause for maintenance)
        let mut pause_config = ctx.accounts.pause_config.clone();
        if pause_config.maintenance_pause {
            let clock = Clock::get()?;
            let elapsed_seconds = clock.unix_timestamp - pause_config.maintenance_start_time;
            let elapsed_hours = (elapsed_seconds / 3600) as u8;
            if elapsed_hours >= pause_config.maintenance_duration_hours {
                pause_config.maintenance_pause = false;
                pause_config.maintenance_start_time = 0;
            }
        }
        require!(!pause_config.emergency_pause, VaultError::EmergencyPaused);
        require!(!pause_config.maintenance_pause, VaultError::MaintenancePaused);
        
        let user = &ctx.accounts.user;
        let vault_info = ctx.accounts.vault.to_account_info();

        invoke(
            &system_instruction::transfer(
                &user.key(),
                &vault_info.key(),
                amount,
            ),
            &[
                user.to_account_info().clone(),
                vault_info.clone(),
                ctx.accounts.system_program.to_account_info().clone(),
            ],
        )?;
        Ok(())
    }

    /// Withdraw SOL from the vault back to the user's wallet
    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        require!(amount > 0, VaultError::InvalidAmount);
        
        // Check for any pause (with auto-unpause for maintenance)
        let mut pause_config = ctx.accounts.pause_config.clone();
        if pause_config.maintenance_pause {
            let clock = Clock::get()?;
            let elapsed_seconds = clock.unix_timestamp - pause_config.maintenance_start_time;
            let elapsed_hours = (elapsed_seconds / 3600) as u8;
            if elapsed_hours >= pause_config.maintenance_duration_hours {
                pause_config.maintenance_pause = false;
                pause_config.maintenance_start_time = 0;
            }
        }
        require!(!pause_config.emergency_pause, VaultError::EmergencyPaused);
        require!(!pause_config.maintenance_pause, VaultError::MaintenancePaused);
        
        let vault = &mut ctx.accounts.vault;
        let user_info = ctx.accounts.owner.to_account_info();
        let vault_info = vault.to_account_info();

        require!(vault.active_games == 0, VaultError::GamesInProgress);
        require!(
            **vault_info.lamports.borrow() >= amount,
            VaultError::InsufficientFunds
        );

        **vault_info.try_borrow_mut_lamports()? -= amount;
        **user_info.try_borrow_mut_lamports()? += amount;
        Ok(())
    }

    /// Atomic bet and settle operation
    pub fn bet_and_settle(
        ctx: Context<BetAndSettle>,
        stake: u64,
        payout: u64,
        bet_id: String,
        game_id: u64,
        gem_data: Vec<u8>,
    ) -> Result<()> {
        // Require exactly 7 u8 values
        require!(gem_data.len() == 7, VaultError::InvalidAmount);

        // stake can be 0 if it was already deducted in a previous transaction
        
        // Check for any pause (with auto-unpause for maintenance)
        let mut pause_config = ctx.accounts.pause_config.clone();
        if pause_config.maintenance_pause {
            let clock = Clock::get()?;
            let elapsed_seconds = clock.unix_timestamp - pause_config.maintenance_start_time;
            let elapsed_hours = (elapsed_seconds / 3600) as u8;
            if elapsed_hours >= pause_config.maintenance_duration_hours {
                pause_config.maintenance_pause = false;
                pause_config.maintenance_start_time = 0;
            }
        }
        require!(!pause_config.emergency_pause, VaultError::EmergencyPaused);
        require!(!pause_config.maintenance_pause, VaultError::MaintenancePaused);
        
        // Authority check (assume admin for now; adjust if game server)
        let admin: Pubkey = "4y1oXmheqD5VNScoNwLH17WQQExXSxBasH6TTwCb4iN5".parse().unwrap();
        require!(ctx.accounts.authority.key() == admin, VaultError::Unauthorized);

        let vault = &mut ctx.accounts.vault;
        let house_vault = &mut ctx.accounts.house_vault;
        let vault_info = vault.to_account_info();
        let house_info = house_vault.to_account_info();

        // If stake > 0, ensure vault has enough funds
        if stake > 0 {
            require!(**vault_info.lamports.borrow() >= stake, VaultError::InsufficientFunds);
        }

        // Update house vault volume (only if there was an actual stake)
        if stake > 0 {
            house_vault.total_volume = house_vault.total_volume.checked_add(stake).ok_or(VaultError::Overflow)?;
        }

        // Calculate net change based on stake and payout
        if stake == 0 {
            // Stake was already deducted - this is a pure payout (win)
            if payout > 0 {
                // Player wins - house pays the full payout
                require!(**house_info.lamports.borrow() >= payout, VaultError::HouseInsufficient);
                **house_info.try_borrow_mut_lamports()? -= payout;
                **vault_info.try_borrow_mut_lamports()? += payout;
            }
        } else {
            // Normal bet and settle with stake
            if payout > stake {
                // Player wins - house pays the difference
                let house_payout = payout - stake;
                require!(**house_info.lamports.borrow() >= house_payout, VaultError::HouseInsufficient);
                
                // House pays winnings to vault
                **house_info.try_borrow_mut_lamports()? -= house_payout;
                **vault_info.try_borrow_mut_lamports()? += house_payout;
            } else if payout < stake {
                // Player loses - deduct loss from vault, add to house
                let loss = stake - payout;
                require!(**vault_info.lamports.borrow() >= loss, VaultError::InsufficientFunds);
                **vault_info.try_borrow_mut_lamports()? -= loss;
                **house_info.try_borrow_mut_lamports()? += loss;
            } else {
                // Draw - no net change
            }
        }

        msg!("Atomic bet and settle: betId={}, gameId={}, stake={}, payout={}, user={}, outcome={}, gameData={:?}", 
             bet_id, game_id, stake, payout, ctx.accounts.vault.owner,
             if payout > stake { "WIN" } else if payout < stake { "LOSS" } else { "DRAW" }, gem_data);
        Ok(())
    }

    /// Batch bet and settle multiple games in one transaction (admin only)
    pub fn batch_settle(
        ctx: Context<BatchSettle>,
        stakes: Vec<u64>,
        payouts: Vec<u64>,
        bet_ids: Vec<String>,
        game_ids: Vec<u64>,
        gem_datas: Vec<Vec<u8>>,
    ) -> Result<()> {
        require!(stakes.len() <= 10, VaultError::BatchTooLarge);
        require!(stakes.len() > 0, VaultError::InvalidAmount);
        require!(stakes.len() == payouts.len(), VaultError::InvalidAmount);
        require!(stakes.len() == bet_ids.len(), VaultError::InvalidAmount);
        require!(stakes.len() == game_ids.len(), VaultError::InvalidAmount);
        require!(stakes.len() == gem_datas.len(), VaultError::InvalidAmount);
        
        // Check each gem_data has exactly 7 u8 values
        for data in &gem_datas {
            require!(data.len() == 7, VaultError::InvalidAmount);
        }
        
        // Check for any pause (with auto-unpause for maintenance)
        let mut pause_config = ctx.accounts.pause_config.clone();
        if pause_config.maintenance_pause {
            let clock = Clock::get()?;
            let elapsed_seconds = clock.unix_timestamp - pause_config.maintenance_start_time;
            let elapsed_hours = (elapsed_seconds / 3600) as u8;
            if elapsed_hours >= pause_config.maintenance_duration_hours {
                pause_config.maintenance_pause = false;
                pause_config.maintenance_start_time = 0;
            }
        }
        require!(!pause_config.emergency_pause, VaultError::EmergencyPaused);
        require!(!pause_config.maintenance_pause, VaultError::MaintenancePaused);
        
        // Admin only access
        let admin: Pubkey = "4y1oXmheqD5VNScoNwLH17WQQExXSxBasH6TTwCb4iN5".parse().unwrap();
        require!(ctx.accounts.authority.key() == admin, VaultError::Unauthorized);
        
        // Validate remaining accounts match stakes
        require!(
            ctx.remaining_accounts.len() == stakes.len(),
            VaultError::InvalidAmount
        );

        let house_info = ctx.accounts.house_vault.to_account_info();
        let house_vault = &mut ctx.accounts.house_vault;

        // Process each bet and settle operation
        for (i, ((((stake, payout), bet_id), game_id), gem_data)) in stakes.iter()
            .zip(payouts.iter())
            .zip(bet_ids.iter())
            .zip(game_ids.iter())
            .zip(gem_datas.iter())
            .enumerate() {
            let vault_info = &ctx.remaining_accounts[i];
            
            // stake can be 0 if it was already deducted in a previous transaction
            
            // If stake > 0, ensure vault has enough funds
            if *stake > 0 {
                require!(**vault_info.lamports.borrow() >= *stake, VaultError::InsufficientFunds);
            }
        
            // Update house vault volume (only if there was an actual stake)
            if *stake > 0 {
                house_vault.total_volume = house_vault.total_volume.checked_add(*stake).ok_or(VaultError::Overflow)?;
            }
        
            // Calculate net change based on stake and payout
            if *stake == 0 {
                // Stake was already deducted - this is a pure payout (win)
                if *payout > 0 {
                    // Player wins - house pays the full payout
                    require!(**house_info.lamports.borrow() >= *payout, VaultError::HouseInsufficient);
                    **house_info.try_borrow_mut_lamports()? -= *payout;
                    **vault_info.try_borrow_mut_lamports()? += *payout;
                }
            } else {
                // Normal bet and settle with stake
                if *payout > *stake {
                    // Player wins - house pays the difference
                    let profit = *payout - *stake;
                    require!(**house_info.lamports.borrow() >= profit, VaultError::HouseInsufficient);
                    **house_info.try_borrow_mut_lamports()? -= profit;
                    **vault_info.try_borrow_mut_lamports()? += profit;
                } else if *payout < *stake {
                    // Player loses - deduct loss from vault, add to house
                    let loss = *stake - *payout;
                    require!(**vault_info.lamports.borrow() >= loss, VaultError::InsufficientFunds);
                    **vault_info.try_borrow_mut_lamports()? -= loss;
                    **house_info.try_borrow_mut_lamports()? += loss;
                } else {
                    // Draw - no net change
                }
            }

            msg!("Batch item {}: betId={}, gameId={}, stake={}, payout={}, outcome={}, gameData={:?}", 
                 i, bet_id, game_id, stake, payout,
                 if *payout > *stake { "WIN" } else if *payout < *stake { "LOSS" } else { "DRAW" }, gem_data);
        }

        msg!("Batch bet and settle completed: {} games, betIds={:?}, gameIds={:?}", stakes.len(), bet_ids, game_ids);
        Ok(())
    }

    /// Start maintenance pause (admin or multisig)
    pub fn start_maintenance_pause(ctx: Context<StartMaintenancePause>) -> Result<()> {
        let config = &mut ctx.accounts.pause_config;
        let multisig: Pubkey = "BMprzPNF9FTni4mJWwCJnk91ZzhKdxGCx7BwPckMRzBt".parse().unwrap();
        let admin: Pubkey = "4y1oXmheqD5VNScoNwLH17WQQExXSxBasH6TTwCb4iN5".parse().unwrap();
        
        require!(
            ctx.accounts.authority.key() == multisig || ctx.accounts.authority.key() == admin,
            VaultError::Unauthorized
        );

        config.maintenance_pause = true;
        config.maintenance_start_time = Clock::get()?.unix_timestamp;
        
        msg!("Maintenance pause started at {}", config.maintenance_start_time);
        Ok(())
    }

    /// Emergency pause (multisig only)
    pub fn emergency_pause(ctx: Context<EmergencyPause>) -> Result<()> {
        let config = &mut ctx.accounts.pause_config;
        let multisig: Pubkey = "BMprzPNF9FTni4mJWwCJnk91ZzhKdxGCx7BwPckMRzBt".parse().unwrap();
        
        require!(ctx.accounts.authority.key() == multisig, VaultError::Unauthorized);

        config.emergency_pause = true;
        config.maintenance_pause = false; // Override maintenance pause
        
        msg!("Emergency pause activated");
        Ok(())
    }

    /// Unpause (multisig only)
    pub fn unpause(ctx: Context<Unpause>) -> Result<()> {
        let config = &mut ctx.accounts.pause_config;
        let multisig: Pubkey = "BMprzPNF9FTni4mJWwCJnk91ZzhKdxGCx7BwPckMRzBt".parse().unwrap();
        
        require!(ctx.accounts.authority.key() == multisig, VaultError::Unauthorized);

        config.emergency_pause = false;
        config.maintenance_pause = false;
        config.maintenance_start_time = 0;
        
        msg!("All pauses deactivated");
        Ok(())
    }

    /// Get pause status for UI (readable method)
    pub fn get_pause_status(ctx: Context<GetPauseStatus>) -> Result<()> {
        let config = &ctx.accounts.pause_config;
        let clock = Clock::get()?;
        let current_time = clock.unix_timestamp;
        
        if config.emergency_pause {
            msg!("EMERGENCY_PAUSE:true");
            msg!("MAINTENANCE_PAUSE:false");
            msg!("RESUME_TIME:indefinite");
            msg!("MESSAGE:Emergency pause active - no operations allowed");
        } else if config.maintenance_pause {
            let elapsed_hours = (current_time - config.maintenance_start_time) / 3600;
            let remaining_hours = config.maintenance_duration_hours.saturating_sub(elapsed_hours as u8);
            
            if remaining_hours > 0 {
                msg!("EMERGENCY_PAUSE:false");
                msg!("MAINTENANCE_PAUSE:true");
                msg!("RESUME_TIME:{} hours", remaining_hours);
                msg!("MESSAGE:Maintenance in progress - will resume in {} hours", remaining_hours);
            } else {
                // Auto-resume maintenance pause
                msg!("EMERGENCY_PAUSE:false");
                msg!("MAINTENANCE_PAUSE:false");
                msg!("RESUME_TIME:now");
                msg!("MESSAGE:Maintenance complete - operations restored");
            }
        } else {
            msg!("EMERGENCY_PAUSE:false");
            msg!("MAINTENANCE_PAUSE:false");
            msg!("RESUME_TIME:now");
            msg!("MESSAGE:All operations active");
        }
        
        Ok(())
    }

    /// Change authorities (multisig only)
    pub fn change_authority(
        ctx: Context<ChangeAuthority>,
        new_multisig: Option<Pubkey>,
        new_admin: Option<Pubkey>,
    ) -> Result<()> {
        let house_vault = &mut ctx.accounts.house_vault;
        let multisig: Pubkey = "BMprzPNF9FTni4mJWwCJnk91ZzhKdxGCx7BwPckMRzBt".parse().unwrap();
        
        require!(ctx.accounts.authority.key() == multisig, VaultError::Unauthorized);

        if let Some(new_multisig_pubkey) = new_multisig {
            house_vault.multisig_authority = new_multisig_pubkey;
            msg!("Multisig authority updated to: {}", new_multisig_pubkey);
        }

        if let Some(new_admin_pubkey) = new_admin {
            house_vault.admin_authority = new_admin_pubkey;
            msg!("Admin authority updated to: {}", new_admin_pubkey);
        }

        Ok(())
    }
}

// Data structures
#[account]
pub struct UserVault {
    pub owner: Pubkey,           // Vault owner
    pub bump: u8,                // PDA bump
    pub locked_amount: u64,      // Amount locked in active games
    pub active_games: u32,       // Number of active games
    pub accum_wager: u64,        // Accumulated wager for gem rewards
    pub version: u8,             // Contract version (2)
}

#[account]
pub struct HouseVault {
    pub bump: u8,                // PDA bump
    pub multisig_authority: Pubkey, // Multisig authority
    pub admin_authority: Pubkey,    // Admin authority
    pub total_volume: u64,          // Total betting volume
    pub version: u8,             // Contract version (2)
}

#[account]
pub struct PauseConfig {
    pub multisig_authority: Pubkey,  // Multisig authority
    pub admin_authority: Pubkey,     // Admin authority  
    pub maintenance_pause: bool,     // Maintenance pause switch
    pub maintenance_start_time: i64, // When maintenance started
    pub maintenance_duration_hours: u8, // How long maintenance lasts
    pub emergency_pause: bool,       // Emergency stop
    pub bump: u8,
}

// Context structs
#[derive(Accounts)]
pub struct InitializeVault<'info> {
    #[account(init, seeds=[b"vault", user.key().as_ref()], bump, payer=user, space=8 + 32 + 1 + 8 + 4 + 8 + 1)]
    pub vault: Account<'info, UserVault>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct InitializeHouse<'info> {
    #[account(init, seeds=[b"house_vault"], bump, payer=admin, space=8 + 1 + 32 + 32 + 8 + 1)]
    pub house_vault: Account<'info, HouseVault>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct InitializePauseConfig<'info> {
    #[account(init, seeds=[b"pause_config"], bump, payer=authority, space=8 + 32 + 32 + 1 + 8 + 1 + 1 + 1)]
    pub pause_config: Account<'info, PauseConfig>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ClosePauseConfig<'info> {
    #[account(mut, seeds=[b"pause_config"], bump, close=authority)]
    pub pause_config: Account<'info, PauseConfig>,
    #[account(mut)]
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut, has_one = owner)]
    pub vault: Account<'info, UserVault>,
    #[account(signer)]
    pub owner: AccountInfo<'info>,
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(seeds=[b"pause_config"], bump)]
    pub pause_config: Account<'info, PauseConfig>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut, has_one = owner)]
    pub vault: Account<'info, UserVault>,
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(seeds=[b"pause_config"], bump)]
    pub pause_config: Account<'info, PauseConfig>,
}

#[derive(Accounts)]
pub struct BetAndSettle<'info> {
    #[account(mut)]
    pub vault: Account<'info, UserVault>,
    #[account(mut)]
    pub house_vault: Account<'info, HouseVault>,
    pub authority: Signer<'info>,
    #[account(seeds=[b"pause_config"], bump)]
    pub pause_config: Account<'info, PauseConfig>,
}

#[derive(Accounts)]
pub struct BatchSettle<'info> {
    #[account(mut)]
    pub house_vault: Account<'info, HouseVault>,
    pub authority: Signer<'info>,
    #[account(seeds=[b"pause_config"], bump)]
    pub pause_config: Account<'info, PauseConfig>,
    // User vaults will be passed as remaining_accounts
}

#[derive(Accounts)]
pub struct StartMaintenancePause<'info> {
    #[account(mut, seeds=[b"pause_config"], bump)]
    pub pause_config: Account<'info, PauseConfig>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct EmergencyPause<'info> {
    #[account(mut, seeds=[b"pause_config"], bump)]
    pub pause_config: Account<'info, PauseConfig>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct Unpause<'info> {
    #[account(mut, seeds=[b"pause_config"], bump)]
    pub pause_config: Account<'info, PauseConfig>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct GetPauseStatus<'info> {
    #[account(seeds=[b"pause_config"], bump)]
    pub pause_config: Account<'info, PauseConfig>,
}

#[derive(Accounts)]
pub struct ChangeAuthority<'info> {
    #[account(mut, seeds=[b"house_vault"], bump)]
    pub house_vault: Account<'info, HouseVault>,
    pub authority: Signer<'info>,
}

// Error definitions
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
    #[msg("Batch size too large")]
    BatchTooLarge,
    #[msg("Maintenance pause is active")]
    MaintenancePaused,
    #[msg("Emergency pause is active")]
    EmergencyPaused,
}