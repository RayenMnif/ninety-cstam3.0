CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    station_id VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
        CONSTRAINT sessions_status_check CHECK (status IN ('ACTIVE', 'COMPLETED', 'CANCELLED')),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_tick_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ
);

-- Upgrade the legacy sessions table created by schema.sql without discarding its data or route fields.
ALTER TABLE sessions
    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS last_tick_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'sessions' AND column_name = 'customer_id'
    ) THEN
        EXECUTE 'UPDATE sessions SET user_id = customer_id WHERE user_id IS NULL';
        EXECUTE 'UPDATE sessions SET started_at = opened_at WHERE opened_at IS NOT NULL';
        EXECUTE 'UPDATE sessions SET ended_at = closed_at WHERE closed_at IS NOT NULL';

        ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_status_check;
        ALTER TABLE sessions ADD CONSTRAINT sessions_status_check
            CHECK (status IN ('ACTIVE', 'COMPLETED', 'CANCELLED', 'PAUSED', 'PENDING', 'CLOSED', 'SETTLED'));
    END IF;
END
$$;

ALTER TABLE sessions ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE sessions ALTER COLUMN status SET DEFAULT 'ACTIVE';

CREATE INDEX IF NOT EXISTS idx_sessions_status_station_id ON sessions (status, station_id);