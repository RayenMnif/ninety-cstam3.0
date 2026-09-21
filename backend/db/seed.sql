-- Nettoyage des données existantes (Réinitialisation propre)
TRUNCATE TABLE payments, charges, session_events, sessions, tariffs, stations, wallets, users CASCADE;

-- 1. Utilisateurs (Admin & Joueurs)
-- Password Hash correspond à 'Password123!' (Bcrypt cost 10)
INSERT INTO users (id, username, email, password_hash, role, status) VALUES
  ('11111111-1111-1111-1111-111111111111', 'admin_boss', 'admin@ninety.gg', '$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeg6Lruj3vjPGga31lW', 'ADMIN', 'ACTIVE'),
  ('22222222-2222-2222-2222-222222222222', 'pro_gamer_99', 'player1@ninety.gg', '$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeg6Lruj3vjPGga31lW', 'GAMER', 'ACTIVE'),
  ('33333333-3333-3333-3333-333333333333', 'casual_faker', 'player2@ninety.gg', '$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeg6Lruj3vjPGga31lW', 'GAMER', 'ACTIVE');

-- 2. Portefeuilles (Solde en millimes)
INSERT INTO wallets (user_id, balance_millimes) VALUES
  ('22222222-2222-2222-2222-222222222222', 25000), -- 25.000 TND
  ('33333333-3333-3333-3333-333333333333', 10000); -- 10.000 TND

-- 3. Grille Tarifaire
INSERT INTO tariffs (id, name, price_per_unit_millimes, unit_seconds, rounding_rule, minimum_charge_millimes) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Standard Zone (4 TND/h)', 4000, 3600, 'EXACT', 1000),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'VIP Gaming Zone (7 TND/h)', 7000, 3600, 'EXACT', 2000),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'Night Pass (15 TND / 5h)', 15000, 18000, 'EXACT', 15000);

-- 4. Stations physiques (PC de salle)
INSERT INTO stations (id, hostname, ip_address, mac_address, status) VALUES
  ('10000000-0000-0000-0000-000000000001', 'STATION-REG-01', '192.168.1.101', 'AA:BB:CC:DD:EE:01', 'AVAILABLE'),
  ('10000000-0000-0000-0000-000000000002', 'STATION-REG-02', '192.168.1.102', 'AA:BB:CC:DD:EE:02', 'AVAILABLE'),
  ('10000000-0000-0000-0000-000000000003', 'STATION-REG-03', '192.168.1.103', 'AA:BB:CC:DD:EE:03', 'OFFLINE'),
  ('20000000-0000-0000-0000-000000000001', 'STATION-VIP-01', '192.168.1.201', 'AA:BB:CC:DD:EE:11', 'AVAILABLE'),
  ('20000000-0000-0000-0000-000000000002', 'STATION-VIP-02', '192.168.1.202', 'AA:BB:CC:DD:EE:12', 'MAINTENANCE');
