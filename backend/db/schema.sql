DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS charges CASCADE;
DROP TABLE IF EXISTS sessions CASCADE;
DROP TABLE IF EXISTS tariffs CASCADE;
DROP TABLE IF EXISTS wallets CASCADE;
DROP TABLE IF EXISTS stations CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS session_events CASCADE;

CREATE TABLE users(
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'GAMER' CHECK(role IN ('GAMER', 'ADMIN')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status in ('ACTIVE', 'BANNED', 'DEACTIVATED'))
);

CREATE TABLE wallets(
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    balance_millimes BIGINT DEFAULT 0 CHECK (balance_millimes >= 0),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE stations(
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hostname VARCHAR(50) NOT NULL, 
    ip_address VARCHAR(50) NOT NULL,
    mac_address VARCHAR(17) NOT NULL,
    status VARCHAR(20) DEFAULT 'OFFLINE',
    CONSTRAINT STATUS_C CHECK (status in ('OFFLINE', 'AVAILABLE', 'OCCUPIED', 'MAINTENANCE'))
);

CREATE TABLE tariffs(
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) NOT NULL,
    price_per_unit_millimes BIGINT NOT NULL,
    unit_seconds INT NOT NULL DEFAULT 3600, -- 1h 
    rounding_rule VARCHAR(20) DEFAULT 'EXACT',
    minimum_charge_millimes BIGINT DEFAULT 0,
    valid_from TIMESTAMP DEFAULT CURRENT_TIMESTAMP, 
    valid_to TIMESTAMP,
    CONSTRAINT ROUNDING_RULE_CONSTRAINT CHECK (rounding_rule in ('UP', 'NEAREST', 'EXACT'))
);

CREATE TABLE sessions(
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    station_id UUID NOT NULL REFERENCES stations(id) ON DELETE RESTRICT,
    customer_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    tariff_id UUID NOT NULL REFERENCES tariffs(id),
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK(status IN ('ACTIVE', 'PAUSED', 'PENDING', 'CLOSED', 'SETTLED', 'CANCELLED')),
    opened_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    closed_at TIMESTAMP,
    version INT NOT NULL DEFAULT 1
);
    
CREATE UNIQUE INDEX idx_one_active_session_per_station
ON sessions (station_id)
WHERE status IN ('PENDING' ,'ACTIVE', 'PAUSED');


CREATE TABLE session_events(
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL CHECK (type IN ('SESSION_STARTED', 'SESSION_PAUSED', 'SESSION_RESUMED', 'SESSION_ENDED')),
    at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, 
    actor VARCHAR(50) NOT NULL CHECK (actor IN ('SYSTEM', 'ADMIN', 'GAMER')),
    payload JSONB -- exemple: {'admin-id': 3, 'reason': 'customer went to grab food'}
);

CREATE TABLE charges(
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id  UUID NOT NULL REFERENCES sessions(id) ON DELETE RESTRICT, 
    tariffs_id UUID NOT NULL REFERENCES tariffs(id), 
    amount_millimes BIGINT NOT NULL, 
    computed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE payments(
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES users(id), -- GAMERS
    processed_by UUID NOT NULL REFERENCES users(id), -- ADMINS
    session_id UUID REFERENCES sessions(id),
    amount_millimes BIGINT NOT NULL,
    payment_method VARCHAR(20) NOT NULL DEFAULT 'CASH' CHECK(payment_method in ('CASH', 'CARD', 'ONLINE', 'VOUCHER', 'ADJUSTMENT')),
    reference_note VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
