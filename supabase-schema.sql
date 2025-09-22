-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create users table
CREATE TABLE IF NOT EXISTS public.users (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    wallet_address TEXT UNIQUE NOT NULL,
    username TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    total_wagered BIGINT DEFAULT 0,
    total_won BIGINT DEFAULT 0,
    balance BIGINT DEFAULT 0,
    smart_vault TEXT,
    signed_in BOOLEAN DEFAULT FALSE,
    sign_in_expire TIMESTAMPTZ,
    garnet INTEGER DEFAULT 0,
    amethyst INTEGER DEFAULT 0,
    topaz INTEGER DEFAULT 0,
    sapphire INTEGER DEFAULT 0,
    emerald INTEGER DEFAULT 0,
    ruby INTEGER DEFAULT 0,
    diamond INTEGER DEFAULT 0,
    referral TEXT
);

-- Create game_sessions table
CREATE TABLE IF NOT EXISTS public.game_sessions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    game_type TEXT NOT NULL,
    wager_amount BIGINT NOT NULL,
    payout_amount BIGINT NOT NULL,
    multiplier DECIMAL(10,2) NOT NULL,
    result TEXT CHECK (result IN ('win', 'loss')) NOT NULL,
    game_data JSONB,
    transaction_hash TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_wallet_address ON public.users(wallet_address);
CREATE INDEX IF NOT EXISTS idx_game_sessions_user_id ON public.game_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_game_sessions_created_at ON public.game_sessions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_game_sessions_game_type ON public.game_sessions(game_type);
CREATE INDEX IF NOT EXISTS idx_game_sessions_result ON public.game_sessions(result);



-- Create a function to get recent live wins (for the LiveWins component)
CREATE OR REPLACE FUNCTION get_recent_live_wins(limit_count INTEGER DEFAULT 20)
RETURNS TABLE (
    wallet_address TEXT,
    username TEXT,
    game_type TEXT,
    payout_amount BIGINT,
    multiplier DECIMAL(10,2),
    created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        u.wallet_address,
        u.username,
        gs.game_type,
        gs.payout_amount,
        gs.multiplier,
        gs.created_at
    FROM public.game_sessions gs
    JOIN public.users u ON u.id = gs.user_id
    WHERE gs.result = 'win' 
        AND gs.payout_amount > gs.wager_amount * 1.5 -- Only show wins with 1.5x+ multiplier
    ORDER BY gs.created_at DESC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- Row Level Security (RLS) Policies
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_sessions ENABLE ROW LEVEL SECURITY;

-- Users can only see their own user data
CREATE POLICY "Users can view own data" ON public.users
    FOR SELECT USING (auth.uid()::text = id::text);

CREATE POLICY "Users can update own data" ON public.users
    FOR UPDATE USING (auth.uid()::text = id::text);

-- Game sessions are viewable by the user who created them
CREATE POLICY "Users can view own game sessions" ON public.game_sessions
    FOR SELECT USING (
        user_id IN (SELECT id FROM public.users WHERE auth.uid()::text = id::text)
    );

CREATE POLICY "Users can insert own game sessions" ON public.game_sessions
    FOR INSERT WITH CHECK (
        user_id IN (SELECT id FROM public.users WHERE auth.uid()::text = id::text)
    );



-- Create comprehensive transactions table for all betting activity
CREATE TABLE IF NOT EXISTS public.transactions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    transaction_id TEXT UNIQUE NOT NULL,
    player_id TEXT NOT NULL, -- wallet address
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL, -- internal user reference
    type TEXT CHECK (type IN ('bet', 'win', 'refund', 'deposit', 'withdrawal', 'cancelbet', 'cancelwin', 'cancel')) NOT NULL,
    amount BIGINT NOT NULL, -- amount in lamports
    amount_usd BIGINT DEFAULT NULL, -- amount in USD
    currency TEXT DEFAULT 'SOL',
    game_id TEXT,
    game_round TEXT,
    game_provider TEXT, -- 'internal' for native games, provider name for external
    status TEXT CHECK (status IN ('pending', 'completed', 'failed', 'cancelled')) DEFAULT 'completed',
    balance_before BIGINT,
    balance_after BIGINT,
    house_edge DECIMAL(5,4), -- for analytics
    multiplier DECIMAL(10,4), -- for wins
    metadata JSONB, -- additional game-specific data
    blockchain_hash TEXT, -- for on-chain transactions (legacy)
    txid TEXT, -- blockchain transaction ID/hash
    gems_awarded JSONB, -- gems awarded for this transaction
    internal_session_id TEXT, -- internal session tracking
    hashed_result TEXT, -- game result hash
    is_jackpot_win BOOLEAN DEFAULT FALSE, -- jackpot win flag
    ip_address INET, -- for fraud detection
    user_agent TEXT, -- for analytics
    processed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Keep game_transactions for backward compatibility (can be removed later)
CREATE TABLE IF NOT EXISTS public.game_transactions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    transaction_id TEXT UNIQUE NOT NULL,
    player_id TEXT NOT NULL, -- wallet address from games provider
    wallet_address TEXT, -- explicit wallet address field
    type TEXT CHECK (type IN ('bet', 'win', 'refund', 'cancelbet', 'cancelwin', 'cancel')) NOT NULL,
    amount BIGINT NOT NULL,
    currency TEXT DEFAULT 'SOL',
    game_id TEXT,
    game_round TEXT,
    metadata JSONB,
    old_balance BIGINT,
    new_balance BIGINT,
    processed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add wallet_address column if it doesn't exist
ALTER TABLE public.game_transactions ADD COLUMN IF NOT EXISTS wallet_address TEXT;

-- Add balance column to users table for external games
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS balance BIGINT DEFAULT 0;

-- Add new columns to transactions table for blockchain integration
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS txid TEXT;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS gems_awarded JSONB;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS internal_session_id TEXT;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS hashed_result TEXT;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS is_jackpot_win BOOLEAN DEFAULT FALSE;

-- Create indexes for transactions table
CREATE INDEX IF NOT EXISTS idx_transactions_transaction_id ON public.transactions(transaction_id);
CREATE INDEX IF NOT EXISTS idx_transactions_player_id ON public.transactions(player_id);
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON public.transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON public.transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_game_id ON public.transactions(game_id);
CREATE INDEX IF NOT EXISTS idx_transactions_game_provider ON public.transactions(game_provider);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON public.transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON public.transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_amount ON public.transactions(amount DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_txid ON public.transactions(txid);
CREATE INDEX IF NOT EXISTS idx_transactions_game_round ON public.transactions(game_round);

-- Create indexes for game_transactions (backward compatibility)
CREATE INDEX IF NOT EXISTS idx_game_transactions_transaction_id ON public.game_transactions(transaction_id);
CREATE INDEX IF NOT EXISTS idx_game_transactions_player_id ON public.game_transactions(player_id);
CREATE INDEX IF NOT EXISTS idx_game_transactions_type ON public.game_transactions(type);
CREATE INDEX IF NOT EXISTS idx_game_transactions_created_at ON public.game_transactions(created_at DESC);

-- Function to process balance adjustments atomically
CREATE OR REPLACE FUNCTION process_balance_adjustment(
    p_player_id TEXT,
    p_transaction_id TEXT,
    p_type TEXT,
    p_amount BIGINT,
    p_currency TEXT DEFAULT 'SOL',
    p_game_id TEXT DEFAULT NULL,
    p_game_round TEXT DEFAULT NULL,
    p_metadata TEXT DEFAULT NULL,
    p_old_balance BIGINT DEFAULT NULL,
    p_new_balance BIGINT DEFAULT NULL,
    p_game_provider TEXT DEFAULT 'external',
    p_multiplier DECIMAL(10,4) DEFAULT NULL,
    p_house_edge DECIMAL(5,4) DEFAULT NULL,
    p_ip_address INET DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL
)
RETURNS void AS $$
DECLARE
    v_metadata JSONB;
    v_user_id UUID;
BEGIN
    -- Parse metadata if provided
    IF p_metadata IS NOT NULL THEN
        v_metadata := p_metadata::JSONB;
    END IF;

    -- Get user_id for the player
    SELECT id INTO v_user_id 
    FROM public.users 
    WHERE wallet_address = p_player_id;

    -- Insert into main transactions table
    INSERT INTO public.transactions (
        transaction_id,
        player_id,
        user_id,
        type,
        amount,
        amount_usd,
        currency,
        game_id,
        game_round,
        game_provider,
        balance_before,
        balance_after,
        house_edge,
        multiplier,
        metadata,
        ip_address,
        user_agent
    ) VALUES (
        p_transaction_id,
        p_player_id,
        v_user_id,
        p_type,
        p_amount,
        p_amount_usd,
        p_currency,
        p_game_id,
        p_game_round,
        p_game_provider,
        p_old_balance,
        p_new_balance,
        p_house_edge,
        p_multiplier,
        v_metadata,
        p_ip_address,
        p_user_agent
    );

    -- Insert into game_transactions for backward compatibility
    INSERT INTO public.game_transactions (
        transaction_id,
        player_id,
        wallet_address,
        type,
        amount,
        currency,
        game_id,
        game_round,
        metadata,
        old_balance,
        new_balance
    ) VALUES (
        p_transaction_id,
        p_player_id,
        p_player_id, -- wallet_address is same as player_id for external games
        p_type,
        p_amount,
        p_currency,
        p_game_id,
        p_game_round,
        v_metadata,
        p_old_balance,
        p_new_balance
    );

    -- Update user balance
    UPDATE public.users 
    SET 
        balance = p_new_balance,
        updated_at = NOW()
    WHERE wallet_address = p_player_id;

    -- If no user exists, create one
    IF NOT FOUND THEN
        INSERT INTO public.users (wallet_address, balance)
        VALUES (p_player_id, p_new_balance)
        ON CONFLICT (wallet_address) 
        DO UPDATE SET 
            balance = p_new_balance,
            updated_at = NOW();
    END IF;
END;
$$ LANGUAGE plpgsql;

-- RLS for transactions table
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- Users can view their own transactions
CREATE POLICY "Users can view own transactions" ON public.transactions
    FOR SELECT USING (
        user_id IN (SELECT id FROM public.users WHERE auth.uid()::text = id::text)
        OR player_id = (SELECT wallet_address FROM public.users WHERE auth.uid()::text = id::text)
    );

-- Service role can manage all transactions
CREATE POLICY "Service role can manage all transactions" ON public.transactions
    FOR ALL TO service_role USING (true);

-- RLS for game_transactions (admin/API access only)
ALTER TABLE public.game_transactions ENABLE ROW LEVEL SECURITY;

-- Only allow service role to access game_transactions
CREATE POLICY "Service role can manage game transactions" ON public.game_transactions
    FOR ALL TO service_role USING (true);

-- Function to get transaction analytics
CREATE OR REPLACE FUNCTION get_transaction_analytics(
    p_player_id TEXT DEFAULT NULL,
    p_game_id TEXT DEFAULT NULL,
    p_start_date TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    p_end_date TIMESTAMP WITH TIME ZONE DEFAULT NULL
)
RETURNS TABLE (
    total_bets BIGINT,
    total_wins BIGINT,
    total_wagered BIGINT,
    total_payout BIGINT,
    house_edge_avg DECIMAL(5,4),
    rtp DECIMAL(5,4),
    biggest_win BIGINT,
    transaction_count INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*) FILTER (WHERE type = 'bet'),
        COUNT(*) FILTER (WHERE type = 'win'),
        COALESCE(SUM(amount) FILTER (WHERE type = 'bet'), 0),
        COALESCE(SUM(amount) FILTER (WHERE type = 'win'), 0),
        AVG(house_edge) FILTER (WHERE house_edge IS NOT NULL),
        CASE 
            WHEN SUM(amount) FILTER (WHERE type = 'bet') > 0 THEN
                CAST(SUM(amount) FILTER (WHERE type = 'win') AS DECIMAL) / 
                SUM(amount) FILTER (WHERE type = 'bet')
            ELSE 0 
        END,
        MAX(amount) FILTER (WHERE type = 'win'),
        COUNT(*)::INTEGER
    FROM public.transactions
    WHERE 
        (p_player_id IS NULL OR player_id = p_player_id)
        AND (p_game_id IS NULL OR game_id = p_game_id)
        AND (p_start_date IS NULL OR created_at >= p_start_date)
        AND (p_end_date IS NULL OR created_at <= p_end_date)
        AND status = 'completed';
END;
$$ LANGUAGE plpgsql;

-- Function to get recent big wins for display
CREATE OR REPLACE FUNCTION get_recent_big_wins(
    limit_count INTEGER DEFAULT 20,
    min_multiplier DECIMAL DEFAULT 5.0
)
RETURNS TABLE (
    player_id TEXT,
    username TEXT,
    game_id TEXT,
    amount BIGINT,
    multiplier DECIMAL(10,4),
    created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        t.player_id,
        u.username,
        t.game_id,
        t.amount,
        t.multiplier,
        t.created_at
    FROM public.transactions t
    LEFT JOIN public.users u ON u.id = t.user_id
    WHERE 
        t.type = 'win' 
        AND t.multiplier >= min_multiplier
        AND t.status = 'completed'
    ORDER BY t.created_at DESC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- Function to get transaction history for a player
CREATE OR REPLACE FUNCTION get_player_transaction_history(
    p_player_id TEXT,
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
    transaction_id TEXT,
    type TEXT,
    amount BIGINT,
    game_id TEXT,
    game_provider TEXT,
    multiplier DECIMAL(10,4),
    balance_before BIGINT,
    balance_after BIGINT,
    status TEXT,
    created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        t.transaction_id,
        t.type,
        t.amount,
        t.game_id,
        t.game_provider,
        t.multiplier,
        t.balance_before,
        t.balance_after,
        t.status,
        t.created_at
    FROM public.transactions t
    WHERE t.player_id = p_player_id
    ORDER BY t.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON public.transactions TO authenticated;
GRANT ALL ON public.users TO authenticated;
GRANT ALL ON public.game_sessions TO authenticated;

-- Missing RPC Functions for Balance Management

-- Function to get user balance by username (login)
-- Drop any existing versions to avoid conflicts

CREATE OR REPLACE FUNCTION get_user_balance(
    p_login TEXT
)
RETURNS TABLE (
    found BOOLEAN,
    balance_lamports BIGINT,
    balance BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        (u.id IS NOT NULL) as found,
        COALESCE(u.balance, 0) as balance_lamports,
        COALESCE(u.balance, 0) as balance
    FROM public.users u
    WHERE u.username = p_login 
       OR u.wallet_address = p_login 
       OR (LENGTH(p_login) = 20 AND u.wallet_address LIKE (p_login || '%'))
       OR (LENGTH(p_login) > 20 AND u.username = LEFT(p_login, 20))
    LIMIT 1;
    
    -- If no results found, return a row with found = false
    IF NOT FOUND THEN
        RETURN QUERY SELECT false::BOOLEAN, 0::BIGINT, 0::BIGINT;
    END IF;
END;
$$ LANGUAGE plpgsql; 

-- Function to check for duplicate transactions
CREATE OR REPLACE FUNCTION check_duplicate_transaction(
    p_transaction_id TEXT
)
RETURNS TABLE (
    found BOOLEAN,
    balance BIGINT
) AS $$
DECLARE
    v_transaction_exists BOOLEAN := FALSE;
    v_user_balance BIGINT := 0;
BEGIN
    -- Check if transaction already exists
    SELECT true INTO v_transaction_exists
    FROM public.transactions
    WHERE transaction_id = p_transaction_id
    LIMIT 1;
    
    IF v_transaction_exists THEN
        -- Get the user's current balance from the transaction
        SELECT t.balance_after INTO v_user_balance
        FROM public.transactions t
        WHERE t.transaction_id = p_transaction_id
        LIMIT 1;
        
        RETURN QUERY SELECT true::BOOLEAN, COALESCE(v_user_balance, 0)::BIGINT;
    ELSE
        RETURN QUERY SELECT false::BOOLEAN, 0::BIGINT;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to atomically update user balance
CREATE OR REPLACE FUNCTION update_user_balance(
    p_username TEXT,
    p_amount_lamports BIGINT,
    p_operation TEXT, -- 'bet', 'win', 'cancel', 'deposit', 'withdraw'
    p_transaction_id TEXT,
    p_amount_usd BIGINT DEFAULT NULL,
    p_game_id TEXT DEFAULT NULL,
    p_game_round TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT NULL,
    p_gems_awarded JSONB DEFAULT NULL, -- NEW: gem awards for this transaction
    p_status TEXT DEFAULT 'completed' -- NEW: transaction status ('completed', 'failed', etc.)
)
RETURNS TABLE (
    success BOOLEAN,
    balance BIGINT,
    error TEXT
) AS $$
DECLARE
    v_user_id UUID;
    v_current_balance BIGINT := 0;
    v_new_balance BIGINT := 0;
    v_adjustment BIGINT := 0;
    v_user_found BOOLEAN := FALSE;
    v_wallet_address TEXT;
    v_existing_transaction_id TEXT;
    v_existing_balance BIGINT;
    v_multiplier DECIMAL(10,4) := NULL;
BEGIN
    -- Validate inputs to prevent NaN/NULL issues
    IF p_username IS NULL OR p_username = '' THEN
        RETURN QUERY SELECT false::BOOLEAN, 0::BIGINT, 'invalid_username'::TEXT;
        RETURN;
    END IF;
    
    IF p_transaction_id IS NULL OR p_transaction_id = '' THEN
        RETURN QUERY SELECT false::BOOLEAN, 0::BIGINT, 'invalid_transaction_id'::TEXT;
        RETURN;
    END IF;
    
    IF p_amount_lamports IS NULL THEN
        RETURN QUERY SELECT false::BOOLEAN, 0::BIGINT, 'invalid_amount_null'::TEXT;
        RETURN;
    END IF;
    
    IF p_operation IS NULL OR p_operation NOT IN ('bet', 'win', 'cancel', 'deposit', 'withdraw', 'withdrawal', 'cancelbet', 'cancelwin') THEN
        RETURN QUERY SELECT false::BOOLEAN, 0::BIGINT, 'invalid_operation'::TEXT;
        RETURN;
    END IF;
    -- FIRST: Check if this transaction already exists (idempotency)
    SELECT transaction_id, balance_after
    INTO v_existing_transaction_id, v_existing_balance
    FROM public.transactions
    WHERE transaction_id = p_transaction_id
    LIMIT 1;
    
    -- If transaction exists, return existing balance (idempotent)
    IF v_existing_transaction_id IS NOT NULL THEN
        RETURN QUERY SELECT true::BOOLEAN, v_existing_balance, NULL::TEXT;
        RETURN;
    END IF;

    -- Handle both truncated (20 chars) and full wallet addresses
    -- Try to find user by exact username match, wallet_address match, or wallet_address prefix match
    SELECT u.id, COALESCE(u.balance, 0), u.wallet_address
    INTO v_user_id, v_current_balance, v_wallet_address
    FROM public.users u
    WHERE u.username = p_username 
       OR u.wallet_address = p_username 
       OR (LENGTH(p_username) = 20 AND u.wallet_address LIKE (p_username || '%'))
       OR (LENGTH(p_username) > 20 AND u.username = LEFT(p_username, 20));
    
    v_user_found := (v_user_id IS NOT NULL);
    
    -- If user doesn't exist, create them
    IF NOT v_user_found THEN
        -- Determine if p_username is truncated (20 chars) or full address
        IF LENGTH(p_username) = 20 THEN
            -- Username is truncated, use it for both username and wallet_address
            -- (This handles the case where frontend sends 20-char truncated addresses)
            INSERT INTO public.users (username, wallet_address, balance)
            VALUES (p_username, p_username, 0)
            ON CONFLICT (wallet_address) DO UPDATE SET
                username = EXCLUDED.username,
                balance = COALESCE(users.balance, 0)
            RETURNING id, balance, wallet_address INTO v_user_id, v_current_balance, v_wallet_address;
        ELSE
            -- Username is full wallet address, create with truncated username
            INSERT INTO public.users (username, wallet_address, balance)
            VALUES (LEFT(p_username, 20), p_username, 0)
            ON CONFLICT (wallet_address) DO UPDATE SET
                username = EXCLUDED.username,
                balance = COALESCE(users.balance, 0)
            RETURNING id, balance, wallet_address INTO v_user_id, v_current_balance, v_wallet_address;
        END IF;
        
        -- If still no user (shouldn't happen), return error
        IF v_user_id IS NULL THEN
            RETURN QUERY SELECT false::BOOLEAN, 0::BIGINT, 'user_creation_failed'::TEXT;
            RETURN;
        END IF;
    END IF;
    
    -- Calculate adjustment based on operation
    -- Special handling for failed transactions (status = 'failed')
    -- For failed operations, we don't adjust the balance but still record the transaction
    IF p_status = 'failed' THEN
        v_adjustment := ABS(p_amount_lamports); -- Record the full amount they should have won
        v_new_balance := v_current_balance; -- Keep balance unchanged
    ELSIF p_operation = 'bet' THEN
        -- For bets, amount should be negative (subtract from balance)
        v_adjustment := -ABS(p_amount_lamports);
        v_new_balance := v_current_balance + v_adjustment;
        
        -- Check for insufficient funds
        IF v_new_balance < 0 THEN
            RETURN QUERY SELECT false::BOOLEAN, v_current_balance, 'insufficient_funds'::TEXT;
            RETURN;
        END IF;
    ELSIF p_operation = 'win' THEN
        -- For wins, amount should be positive (add to balance)
        v_adjustment := ABS(p_amount_lamports);
        v_new_balance := v_current_balance + v_adjustment;
    ELSIF p_operation = 'deposit' THEN
        -- For deposits, amount should be positive (add to balance)
        v_adjustment := ABS(p_amount_lamports);
        v_new_balance := v_current_balance + v_adjustment;
    ELSIF p_operation = 'withdraw' OR p_operation = 'withdrawal' THEN
        -- For withdrawals, amount should be negative (subtract from balance)
        -- Note: withdrawal API already validates sufficient funds
        v_adjustment := -ABS(p_amount_lamports);
        v_new_balance := v_current_balance + v_adjustment;
        
        -- Check for insufficient funds for withdrawal operations
        IF v_new_balance < 0 THEN
            RETURN QUERY SELECT false::BOOLEAN, v_current_balance, 'insufficient_funds'::TEXT;
            RETURN;
        END IF;
    ELSIF p_operation = 'cancelbet' THEN
        -- Cancel a bet: refund the bet amount (positive adjustment)
        v_adjustment := ABS(p_amount_lamports);
        v_new_balance := v_current_balance + v_adjustment;
    ELSIF p_operation = 'cancelwin' THEN
        -- Cancel a win: remove the win amount (negative adjustment)
        v_adjustment := -ABS(p_amount_lamports);
        v_new_balance := v_current_balance + v_adjustment;
        
        -- Check for insufficient funds
        IF v_new_balance < 0 THEN
            RETURN QUERY SELECT false::BOOLEAN, v_current_balance, 'insufficient_funds'::TEXT;
            RETURN;
        END IF;
    ELSIF p_operation = 'cancel' THEN
        -- For generic cancellations, reverse the original operation
        v_adjustment := p_amount_lamports;
        v_new_balance := v_current_balance + v_adjustment;
    ELSE
        RETURN QUERY SELECT false::BOOLEAN, v_current_balance, 'invalid_operation'::TEXT;
        RETURN;
    END IF;
    
    -- Calculate multiplier for win operations
    IF p_operation = 'win' AND p_metadata IS NOT NULL THEN
        DECLARE
            v_stake_lamports BIGINT;
            v_payout_lamports BIGINT;
        BEGIN
            -- Extract stake and payout from metadata
            v_stake_lamports := (p_metadata ->> 'stake_lamports')::BIGINT;
            v_payout_lamports := (p_metadata ->> 'payout_lamports')::BIGINT;
            
            -- Calculate multiplier if both values exist and stake > 0
            IF v_stake_lamports IS NOT NULL AND v_payout_lamports IS NOT NULL AND v_stake_lamports > 0 THEN
                v_multiplier := ROUND((v_payout_lamports::DECIMAL / v_stake_lamports::DECIMAL), 4);
            END IF;
        EXCEPTION WHEN OTHERS THEN
            -- If any error in multiplier calculation, just continue without it
            v_multiplier := NULL;
        END;
    END IF;
    
    -- Update user balance, total_wagered, total_won, and gems
    UPDATE public.users
    SET 
        balance = v_new_balance, 
        total_wagered = CASE 
            WHEN p_operation = 'bet' AND p_status != 'failed' THEN COALESCE(total_wagered, 0) + ABS(p_amount_lamports)
            ELSE total_wagered 
        END,
        total_won = CASE 
            WHEN p_operation = 'win' AND p_status != 'failed' THEN COALESCE(total_won, 0) + ABS(p_amount_lamports)
            ELSE total_won 
        END,
        updated_at = NOW()
    WHERE id = v_user_id;
    
    -- If gems were awarded, update gem counts
    IF p_gems_awarded IS NOT NULL THEN
        -- Update each gem type from the JSONB object
        IF p_gems_awarded ? 'garnet' THEN
            UPDATE public.users SET garnet = COALESCE(garnet, 0) + (p_gems_awarded->>'garnet')::INTEGER WHERE id = v_user_id;
        END IF;
        IF p_gems_awarded ? 'amethyst' THEN
            UPDATE public.users SET amethyst = COALESCE(amethyst, 0) + (p_gems_awarded->>'amethyst')::INTEGER WHERE id = v_user_id;
        END IF;
        IF p_gems_awarded ? 'topaz' THEN
            UPDATE public.users SET topaz = COALESCE(topaz, 0) + (p_gems_awarded->>'topaz')::INTEGER WHERE id = v_user_id;
        END IF;
        IF p_gems_awarded ? 'sapphire' THEN
            UPDATE public.users SET sapphire = COALESCE(sapphire, 0) + (p_gems_awarded->>'sapphire')::INTEGER WHERE id = v_user_id;
        END IF;
        IF p_gems_awarded ? 'emerald' THEN
            UPDATE public.users SET emerald = COALESCE(emerald, 0) + (p_gems_awarded->>'emerald')::INTEGER WHERE id = v_user_id;
        END IF;
        IF p_gems_awarded ? 'ruby' THEN
            UPDATE public.users SET ruby = COALESCE(ruby, 0) + (p_gems_awarded->>'ruby')::INTEGER WHERE id = v_user_id;
        END IF;
        IF p_gems_awarded ? 'diamond' THEN
            UPDATE public.users SET diamond = COALESCE(diamond, 0) + (p_gems_awarded->>'diamond')::INTEGER WHERE id = v_user_id;
        END IF;
    END IF;
    
    -- Insert transaction record (no conflict handling needed since we checked above)
    INSERT INTO public.transactions (
        transaction_id,
        player_id,
        user_id,
        type,
        amount,
        amount_usd,
        currency,
        game_id,
        game_round,
        game_provider,
        balance_before,
        balance_after,
        multiplier,
        metadata,
        gems_awarded,
        internal_session_id,
        hashed_result,
        is_jackpot_win,
        status,
        txid
    ) VALUES (
        p_transaction_id,
        v_wallet_address,
        v_user_id,
        CASE 
            WHEN p_operation = 'withdraw' THEN 'withdrawal'
            ELSE p_operation 
        END,
        v_adjustment,
        p_amount_usd,
        'SOL',
        COALESCE(p_game_id, 'unknown'),
        COALESCE(p_game_round, p_transaction_id),
        'vault',
        v_current_balance,
        v_new_balance,
        v_multiplier,
        COALESCE(p_metadata, '{}'::JSONB) || jsonb_build_object('original_operation', p_operation),
        p_gems_awarded,
        p_metadata ->> 'internal_session_id',
        p_metadata ->> 'hashed_result',
        (p_metadata ->> 'is_jackpot_win')::BOOLEAN,
        p_status,
        p_metadata ->> 'vault_transaction_hash'
    );
    
    RETURN QUERY SELECT true::BOOLEAN, v_new_balance, NULL::TEXT;
END;
$$ LANGUAGE plpgsql;

-- Add function to update individual gem counts for referral bonuses
-- This function safely updates a specific gem type for a user

CREATE OR REPLACE FUNCTION update_user_gems(
    p_username TEXT,
    p_gem_type TEXT,
    p_amount INTEGER
)
RETURNS BOOLEAN AS $$
DECLARE
    v_user_id UUID;
    v_sql TEXT;
BEGIN
    -- Validate gem type
    IF p_gem_type NOT IN ('garnet', 'amethyst', 'topaz', 'sapphire', 'emerald', 'ruby', 'diamond') THEN
        RAISE EXCEPTION 'Invalid gem type: %', p_gem_type;
    END IF;

    -- Validate amount
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'Amount must be positive: %', p_amount;
    END IF;

    -- Get user ID
    SELECT id INTO v_user_id
    FROM public.users
    WHERE username = p_username;

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'User not found: %', p_username;
    END IF;

    -- Build dynamic SQL to update the specific gem column
    v_sql := format('UPDATE public.users SET %I = COALESCE(%I, 0) + $1, updated_at = NOW() WHERE id = $2', 
                    p_gem_type, p_gem_type);

    -- Execute the update
    EXECUTE v_sql USING p_amount, v_user_id;

    RETURN TRUE;

EXCEPTION WHEN OTHERS THEN
    -- Log error and return false instead of failing
    RAISE WARNING 'Failed to update gems for user %: %', p_username, SQLERRM;
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- Create the price_history table
CREATE TABLE IF NOT EXISTS public.price_history (
    id BIGSERIAL PRIMARY KEY,
    price DECIMAL(10,4) NOT NULL CHECK (price > 0),
    source VARCHAR(20) NOT NULL CHECK (source IN ('pyth', 'chainlink', 'coingecko')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_price_history_created_at ON public.price_history (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_price_history_source ON public.price_history (source);
CREATE INDEX IF NOT EXISTS idx_price_history_source_created ON public.price_history (source, created_at DESC);

-- Add RLS (Row Level Security) policies if needed
ALTER TABLE public.price_history ENABLE ROW LEVEL SECURITY;

-- Allow the service role to perform all operations
CREATE POLICY "Service role can manage price_history" ON public.price_history
    FOR ALL 
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Allow authenticated users to read price history (for debugging/monitoring)
CREATE POLICY "Authenticated users can read price_history" ON public.price_history
    FOR SELECT
    TO authenticated
    USING (true);

-- Add a comment to the table
COMMENT ON TABLE public.price_history IS 'Historical SOL/USD price data from various oracles for fallback pricing';
COMMENT ON COLUMN public.price_history.price IS 'SOL/USD price with 4 decimal precision';
COMMENT ON COLUMN public.price_history.source IS 'Oracle source: pyth, chainlink, or coingecko';
COMMENT ON COLUMN public.price_history.created_at IS 'Timestamp when the price was recorded';

-- Create a function to get the latest price (for convenience)
CREATE OR REPLACE FUNCTION public.get_latest_sol_price()
RETURNS DECIMAL(10,4)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    latest_price DECIMAL(10,4);
BEGIN
    SELECT price INTO latest_price
    FROM public.price_history
    ORDER BY created_at DESC
    LIMIT 1;
    
    RETURN COALESCE(latest_price, 0);
END;
$$;

-- Grant execute permission on the function
GRANT EXECUTE ON FUNCTION public.get_latest_sol_price() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_latest_sol_price() TO anon;

-- Add a cleanup function to prevent unlimited growth (keep last 1000 records)
CREATE OR REPLACE FUNCTION public.cleanup_old_price_history()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    DELETE FROM public.price_history
    WHERE id NOT IN (
        SELECT id FROM public.price_history
        ORDER BY created_at DESC
        LIMIT 1000
    );
END;
$$;

-- Create a scheduled cleanup (if pg_cron is available)
-- Note: This requires the pg_cron extension to be enabled
-- SELECT cron.schedule('cleanup-price-history', '0 2 * * *', 'SELECT public.cleanup_old_price_history()');

COMMENT ON FUNCTION public.get_latest_sol_price() IS 'Returns the most recent SOL/USD price from price_history';
COMMENT ON FUNCTION public.cleanup_old_price_history() IS 'Removes old price records, keeping only the most recent 1000 entries'; 

-- Enable Realtime for users table
ALTER TABLE public.users REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.users;

-- Create game_stakes table for reliable stake tracking
CREATE TABLE IF NOT EXISTS public.game_stakes (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    username TEXT NOT NULL,
    player_id TEXT NOT NULL, -- same as username, for consistency
    gpid TEXT NOT NULL,
    stake_lamports BIGINT NOT NULL,
    game_id TEXT,
    transaction_id TEXT NOT NULL, -- each bet gets its own transaction_id
    currency TEXT DEFAULT 'SOL',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    consumed_at TIMESTAMP WITH TIME ZONE DEFAULT NULL, -- when stake was used for settlement
    status TEXT CHECK (status IN ('active', 'consumed', 'expired', 'cancelled')) DEFAULT 'active'
    
    -- NO unique constraint on (username, gpid) to allow multiple bets per round
);

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_game_stakes_username_gpid ON public.game_stakes(username, gpid);
CREATE INDEX IF NOT EXISTS idx_game_stakes_player_id_gpid ON public.game_stakes(player_id, gpid);
CREATE INDEX IF NOT EXISTS idx_game_stakes_status ON public.game_stakes(status);
CREATE INDEX IF NOT EXISTS idx_game_stakes_created_at ON public.game_stakes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_game_stakes_transaction_id ON public.game_stakes(transaction_id);

-- Function to save a stake (allows multiple stakes per gpid for accumulated bets)
CREATE OR REPLACE FUNCTION save_game_stake(
    p_username TEXT,
    p_player_id TEXT,
    p_gpid TEXT,
    p_stake_lamports BIGINT,
    p_game_id TEXT DEFAULT NULL,
    p_transaction_id TEXT DEFAULT NULL,
    p_currency TEXT DEFAULT 'SOL'
)
RETURNS BOOLEAN AS $$
BEGIN
    -- Validate inputs
    IF p_stake_lamports <= 0 THEN
        RAISE EXCEPTION 'stake_lamports must be positive';
    END IF;
    
    IF p_username IS NULL OR p_gpid IS NULL THEN
        RAISE EXCEPTION 'username and gpid are required';
    END IF;
    
    -- Insert new stake record (allows multiple per gpid)
    INSERT INTO public.game_stakes (
        username,
        player_id,
        gpid,
        stake_lamports,
        game_id,
        transaction_id,
        currency,
        status
    ) VALUES (
        p_username,
        COALESCE(p_player_id, p_username),
        p_gpid,
        p_stake_lamports,
        p_game_id,
        p_transaction_id,
        p_currency,
        'active'
    );
    
    RETURN TRUE;
EXCEPTION
    WHEN OTHERS THEN
        -- Log error but don't fail the transaction
        RAISE WARNING 'Failed to save game stake: %', SQLERRM;
        RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- Function to retrieve and consume a stake
CREATE OR REPLACE FUNCTION consume_game_stake(
    p_username TEXT,
    p_gpid TEXT
)
RETURNS TABLE (
    found BOOLEAN,
    stake_lamports BIGINT,
    game_id TEXT,
    transaction_id TEXT
) AS $$
DECLARE
    total_stake BIGINT;
BEGIN
    SELECT SUM(stake_lamports) INTO total_stake
    FROM public.game_stakes
    WHERE username = p_username 
      AND gpid = p_gpid 
      AND status = 'active';
    
    IF total_stake > 0 THEN
        -- Mark all as consumed
        UPDATE public.game_stakes
        SET status = 'consumed', consumed_at = NOW()
        WHERE username = p_username 
          AND gpid = p_gpid 
          AND status = 'active';
        
        -- Return sum; for game_id/transaction_id, return NULL (or aggregate if needed)
        RETURN QUERY SELECT 
            true::BOOLEAN,
            COALESCE(total_stake, 0)::BIGINT,
            NULL::TEXT,  -- Could use ARRAY_AGG(game_id) if multiple needed
            NULL::TEXT;  -- Could use ARRAY_AGG(transaction_id) if multiple needed
    ELSE
        -- No stake found
        RETURN QUERY SELECT 
            false::BOOLEAN,
            0::BIGINT,
            NULL::TEXT,
            NULL::TEXT;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to cleanup expired stakes (older than 2 hours)
CREATE OR REPLACE FUNCTION cleanup_expired_stakes()
RETURNS INTEGER AS $$
DECLARE
    v_deleted_count INTEGER;
BEGIN
    UPDATE public.game_stakes
    SET status = 'expired'
    WHERE status = 'active'
      AND created_at < NOW() - INTERVAL '2 hours';
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RETURN v_deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to get stake statistics
CREATE OR REPLACE FUNCTION get_stake_stats()
RETURNS TABLE (
    active_stakes INTEGER,
    consumed_stakes INTEGER,
    expired_stakes INTEGER,
    total_stakes INTEGER,
    oldest_active TIMESTAMP WITH TIME ZONE,
    newest_active TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*) FILTER (WHERE status = 'active')::INTEGER,
        COUNT(*) FILTER (WHERE status = 'consumed')::INTEGER,
        COUNT(*) FILTER (WHERE status = 'expired')::INTEGER,
        COUNT(*)::INTEGER,
        MIN(created_at) FILTER (WHERE status = 'active'),
        MAX(created_at) FILTER (WHERE status = 'active')
    FROM public.game_stakes;
END;
$$ LANGUAGE plpgsql;

-- Function to cancel stakes for a game round
CREATE OR REPLACE FUNCTION cancel_game_stake(
    p_username TEXT,
    p_gpid TEXT
)
RETURNS TABLE (
    cancelled_count INTEGER,
    total_stake_lamports BIGINT
) AS $$
DECLARE
    v_cancelled_count INTEGER := 0;
    v_total_stake BIGINT := 0;
BEGIN
    -- Get total stake before cancelling
    SELECT COUNT(*), COALESCE(SUM(stake_lamports), 0)
    INTO v_cancelled_count, v_total_stake
    FROM public.game_stakes
    WHERE username = p_username 
      AND gpid = p_gpid 
      AND status = 'active';
    
    -- Cancel all active stakes for this game round
    UPDATE public.game_stakes
    SET status = 'cancelled', consumed_at = NOW()
    WHERE username = p_username 
      AND gpid = p_gpid 
      AND status = 'active';
    
    RETURN QUERY SELECT v_cancelled_count, v_total_stake;
END;
$$ LANGUAGE plpgsql;

-- Enable RLS
ALTER TABLE public.game_stakes ENABLE ROW LEVEL SECURITY;

-- Allow service role to manage all stakes
CREATE POLICY "Service role can manage stakes" ON public.game_stakes
    FOR ALL TO service_role USING (true);

-- Users can view their own stakes
CREATE POLICY "Users can view own stakes" ON public.game_stakes
    FOR SELECT USING (
        username IN (SELECT wallet_address FROM public.users WHERE auth.uid()::text = id::text)
    );

-- Grant permissions
GRANT ALL ON public.game_stakes TO service_role;
GRANT SELECT ON public.game_stakes TO authenticated;

-- Verify the table was created
SELECT 'game_stakes table created successfully' as status;

-- ============================================================================
-- BLOCKCHAIN TRANSACTION QUEUE SYSTEM
-- ============================================================================

-- Table for pending blockchain transactions queue
CREATE TABLE IF NOT EXISTS public.blockchain_transaction_queue (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    bet_id TEXT NOT NULL, -- maps to transaction_id from transactions table
    username TEXT NOT NULL,
    user_vault_pda TEXT NOT NULL,
    stake_lamports BIGINT NOT NULL,
    payout_lamports BIGINT NOT NULL,
    game_id BIGINT NOT NULL,
    game_round TEXT NOT NULL,
    gem_data INTEGER[] NOT NULL, -- [garnet, amethyst, topaz, sapphire, emerald, ruby, diamond]
    priority INTEGER DEFAULT 0, -- for ordering (currently unused but available)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    status TEXT CHECK (status IN ('pending', 'processing', 'failed')) DEFAULT 'pending',
    retry_count INTEGER DEFAULT 0,
    last_error TEXT,
    last_retry_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB
);

-- Create indexes for efficient queue processing
CREATE INDEX IF NOT EXISTS idx_blockchain_queue_status_created ON public.blockchain_transaction_queue(status, created_at);
CREATE INDEX IF NOT EXISTS idx_blockchain_queue_bet_id ON public.blockchain_transaction_queue(bet_id);
CREATE INDEX IF NOT EXISTS idx_blockchain_queue_username ON public.blockchain_transaction_queue(username);
CREATE INDEX IF NOT EXISTS idx_blockchain_queue_retry ON public.blockchain_transaction_queue(status, last_retry_at) WHERE status = 'failed';

-- Table for successful blockchain transactions 
CREATE TABLE IF NOT EXISTS public.blockchain_transactions_success (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    bet_id TEXT NOT NULL,
    blockchain_hash TEXT NOT NULL,
    username TEXT NOT NULL,
    stake_lamports BIGINT NOT NULL,
    payout_lamports BIGINT NOT NULL,
    game_id BIGINT NOT NULL,
    game_round TEXT NOT NULL,
    gem_data INTEGER[] NOT NULL,
    transaction_type TEXT CHECK (transaction_type IN ('single', 'batch')) NOT NULL,
    batch_id UUID, -- for tracking which transactions were processed together
    batch_size INTEGER DEFAULT 1, -- how many transactions were in this batch
    bet_timestamp TIMESTAMP WITH TIME ZONE NOT NULL, -- when bet was placed
    blockchain_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(), -- when blockchain tx completed
    processing_time_ms INTEGER, -- how long the blockchain transaction took
    metadata JSONB
);

-- Create indexes for the success table
CREATE INDEX IF NOT EXISTS idx_blockchain_success_bet_id ON public.blockchain_transactions_success(bet_id);
CREATE INDEX IF NOT EXISTS idx_blockchain_success_username ON public.blockchain_transactions_success(username);
CREATE INDEX IF NOT EXISTS idx_blockchain_success_blockchain_hash ON public.blockchain_transactions_success(blockchain_hash);
CREATE INDEX IF NOT EXISTS idx_blockchain_success_batch_id ON public.blockchain_transactions_success(batch_id) WHERE batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_blockchain_success_timestamp ON public.blockchain_transactions_success(blockchain_timestamp DESC);

-- Function to add transaction to blockchain queue
CREATE OR REPLACE FUNCTION add_to_blockchain_queue(
    p_bet_id TEXT,
    p_username TEXT,
    p_user_vault_pda TEXT,
    p_stake_lamports BIGINT,
    p_payout_lamports BIGINT,
    p_game_id BIGINT,
    p_game_round TEXT,
    p_gem_data INTEGER[],
    p_metadata JSONB DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_queue_id UUID;
BEGIN
    -- Validate gem_data has exactly 7 elements
    IF array_length(p_gem_data, 1) != 7 THEN
        RAISE EXCEPTION 'gem_data must contain exactly 7 elements';
    END IF;

    -- Insert into queue
    INSERT INTO public.blockchain_transaction_queue (
        bet_id,
        username,
        user_vault_pda,
        stake_lamports,
        payout_lamports,
        game_id,
        game_round,
        gem_data,
        metadata
    ) VALUES (
        p_bet_id,
        p_username,
        p_user_vault_pda,
        p_stake_lamports,
        p_payout_lamports,
        p_game_id,
        p_game_round,
        p_gem_data,
        p_metadata
    ) RETURNING id INTO v_queue_id;

    RETURN v_queue_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get pending transactions for processing
CREATE OR REPLACE FUNCTION get_pending_blockchain_transactions(
    p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
    id UUID,
    bet_id TEXT,
    username TEXT,
    user_vault_pda TEXT,
    stake_lamports BIGINT,
    payout_lamports BIGINT,
    game_id BIGINT,
    game_round TEXT,
    gem_data INTEGER[],
    created_at TIMESTAMP WITH TIME ZONE,
    retry_count INTEGER,
    metadata JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        q.id,
        q.bet_id,
        q.username,
        q.user_vault_pda,
        q.stake_lamports,
        q.payout_lamports,
        q.game_id,
        q.game_round,
        q.gem_data,
        q.created_at,
        q.retry_count,
        q.metadata
    FROM public.blockchain_transaction_queue q
    WHERE q.status = 'pending' 
       OR (q.status = 'failed' AND (q.last_retry_at IS NULL OR q.last_retry_at < NOW() - INTERVAL '60 seconds'))
    ORDER BY q.created_at ASC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Function to mark transactions as processing
CREATE OR REPLACE FUNCTION mark_transactions_processing(
    p_transaction_ids UUID[]
)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE public.blockchain_transaction_queue
    SET status = 'processing'
    WHERE id = ANY(p_transaction_ids);
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

    -- Function to record successful blockchain transaction
    CREATE OR REPLACE FUNCTION record_blockchain_success(
        p_bet_ids TEXT[],
        p_blockchain_hash TEXT,
        p_transaction_type TEXT,
        p_batch_id UUID DEFAULT NULL,
        p_processing_time_ms INTEGER DEFAULT NULL
    )
    RETURNS BOOLEAN AS $$
    DECLARE
        v_queue_record RECORD;
        v_bet_timestamp TIMESTAMP WITH TIME ZONE;
    BEGIN
        -- Move each transaction from queue to success table
        FOR v_queue_record IN 
            SELECT * FROM public.blockchain_transaction_queue 
            WHERE bet_id = ANY(p_bet_ids) AND status = 'processing'
        LOOP
            -- Get the original bet timestamp from transactions table
            SELECT created_at INTO v_bet_timestamp
            FROM public.transactions
            WHERE transaction_id = v_queue_record.bet_id
            LIMIT 1;

            -- Insert into success table
            INSERT INTO public.blockchain_transactions_success (
                bet_id,
                blockchain_hash,
                username,
                stake_lamports,
                payout_lamports,
                game_id,
                game_round,
                gem_data,
                transaction_type,
                batch_id,
                batch_size,
                bet_timestamp,
                processing_time_ms,
                metadata
            ) VALUES (
                v_queue_record.bet_id,
                p_blockchain_hash,
                v_queue_record.username,
                v_queue_record.stake_lamports,
                v_queue_record.payout_lamports,
                v_queue_record.game_id,
                v_queue_record.game_round,
                v_queue_record.gem_data,
                p_transaction_type,
                p_batch_id,
                array_length(p_bet_ids, 1),
                COALESCE(v_bet_timestamp, v_queue_record.created_at),
                p_processing_time_ms,
                v_queue_record.metadata
            );
        END LOOP;

        -- Update the original transactions table with the blockchain hash
        UPDATE public.transactions 
        SET txid = p_blockchain_hash
        WHERE transaction_id = ANY(p_bet_ids) OR game_round = ANY(
            SELECT DISTINCT game_round FROM public.blockchain_transaction_queue 
            WHERE bet_id = ANY(p_bet_ids)
        );

        -- Remove from queue
        DELETE FROM public.blockchain_transaction_queue
        WHERE bet_id = ANY(p_bet_ids) AND status = 'processing';

        RETURN TRUE;
    END;
    $$ LANGUAGE plpgsql;

-- Function to mark transaction as failed (for retry later)
CREATE OR REPLACE FUNCTION mark_blockchain_transaction_failed(
    p_bet_ids TEXT[],
    p_error_message TEXT
)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE public.blockchain_transaction_queue
    SET 
        status = 'failed',
        retry_count = retry_count + 1,
        last_error = p_error_message,
        last_retry_at = NOW()
    WHERE bet_id = ANY(p_bet_ids) AND status = 'processing';
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Function to get queue statistics
CREATE OR REPLACE FUNCTION get_blockchain_queue_stats()
RETURNS TABLE (
    pending_count BIGINT,
    processing_count BIGINT,
    failed_count BIGINT,
    oldest_pending TIMESTAMP WITH TIME ZONE,
    total_success_today BIGINT,
    avg_processing_time_ms NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        (SELECT COUNT(*) FROM public.blockchain_transaction_queue WHERE status = 'pending'),
        (SELECT COUNT(*) FROM public.blockchain_transaction_queue WHERE status = 'processing'),
        (SELECT COUNT(*) FROM public.blockchain_transaction_queue WHERE status = 'failed'),
        (SELECT MIN(created_at) FROM public.blockchain_transaction_queue WHERE status = 'pending'),
        (SELECT COUNT(*) FROM public.blockchain_transactions_success WHERE DATE(blockchain_timestamp) = CURRENT_DATE),
        (SELECT AVG(processing_time_ms) FROM public.blockchain_transactions_success WHERE DATE(blockchain_timestamp) = CURRENT_DATE AND processing_time_ms IS NOT NULL);
END;
$$ LANGUAGE plpgsql;

-- Enable Row Level Security
ALTER TABLE public.blockchain_transaction_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blockchain_transactions_success ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for blockchain_transaction_queue
CREATE POLICY "Service role can manage blockchain queue" ON public.blockchain_transaction_queue
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Authenticated users can read blockchain queue" ON public.blockchain_transaction_queue
    FOR SELECT USING (auth.role() = 'authenticated');

-- Create RLS policies for blockchain_transactions_success  
CREATE POLICY "Service role can manage blockchain success" ON public.blockchain_transactions_success
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Authenticated users can read blockchain success" ON public.blockchain_transactions_success
    FOR SELECT USING (auth.role() = 'authenticated');

-- Grant permissions for the new tables and functions
GRANT ALL ON public.blockchain_transaction_queue TO service_role;
GRANT ALL ON public.blockchain_transactions_success TO service_role;
GRANT SELECT ON public.blockchain_transaction_queue TO authenticated;
GRANT SELECT ON public.blockchain_transactions_success TO authenticated;

GRANT EXECUTE ON FUNCTION add_to_blockchain_queue TO service_role;
GRANT EXECUTE ON FUNCTION get_pending_blockchain_transactions TO service_role;
GRANT EXECUTE ON FUNCTION mark_transactions_processing TO service_role;
GRANT EXECUTE ON FUNCTION record_blockchain_success TO service_role;
GRANT EXECUTE ON FUNCTION mark_blockchain_transaction_failed TO service_role;
GRANT EXECUTE ON FUNCTION get_blockchain_queue_stats TO service_role;

-- Create comments for documentation
COMMENT ON TABLE public.blockchain_transaction_queue IS 'Queue for pending blockchain transactions waiting to be processed';
COMMENT ON TABLE public.blockchain_transactions_success IS 'Historical record of successful blockchain transactions, partitioned by date';
COMMENT ON COLUMN public.blockchain_transaction_queue.gem_data IS 'Array of 7 integers representing gem awards: [garnet, amethyst, topaz, sapphire, emerald, ruby, diamond]';
COMMENT ON COLUMN public.blockchain_transaction_queue.status IS 'Transaction status: pending (waiting), processing (being executed), failed (retry after 60s)';
COMMENT ON FUNCTION add_to_blockchain_queue IS 'Add a new transaction to the blockchain processing queue';
COMMENT ON FUNCTION get_pending_blockchain_transactions IS 'Get transactions ready for blockchain processing (pending or failed past retry window)';
COMMENT ON FUNCTION record_blockchain_success IS 'Move successful transactions from queue to success history table';

SELECT 'blockchain queue system tables created successfully' as status; 