DROP TABLE IF EXISTS payment CASCADE;
DROP TABLE IF EXISTS charges CASCADE;
DROP TABLE IF EXISTS sessions CASCADE;
DROP TABLE IF EXISTS tariffs CASCADE;
DROP TABLE IF EXISTS wallets CASCADE;
DROP TABLE IF EXISTS stations CASCADE;
DROP TABLE IF EXISTS users CASCADE;

CREATE TABLE users(
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) UNIQUE NOT NULL,
    role VARCHAR(20) DEFAULT 'gamer',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT C1 CHECK(role IN ('gamer', 'admin')),
    CONSTRAINT C2 PRIMARY KEY(email, password_hash)
)

CREATE TABLE wallets(
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    balance_milimes BIGINT DEFAULT 0 CHECK (balance_milimes >= 0),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)

CREATE TABLE stations(
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hostname VARCHAR(50) NOT NULL, 
    ip_address VARCHAR(50) NOT NULL,
    mac_address VARCHAR(17) NOT NULL,
    status VARCHAR(20) DEFAULT 'OFFLINE',
    CONSTRAINT STATUS_C CHECK (status in ("OFFLINE", "AVAILABLE", "OCCUPIED", "MAINTENANCE"))
)

CREATE TABLE tariffs(
    ID UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) NOT NULL,
    price_per_unit_millimes BIGINT NOT NULL,
    unit_seconds INT NOT NULL DEFAULT 3600, -- 1h 
    rounding_rule VARCHAR(20) DEFAULT 'UP',
    minimm_charge_millimes BIGINT DEFAULT 0,
    valid_from TIMESTAMP DEFAULT CURRENT_TIMESTAMP, 
    valid_to TIMESTAMP
)


