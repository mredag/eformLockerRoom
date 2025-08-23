-- Migration 008: Clean Default Users
-- Remove any default users to ensure clean setup process

-- Remove the default admin user that was created in migration 004
DELETE FROM staff_users WHERE username = 'admin' AND password_hash = '$argon2id$v=19$m=65536,t=3,p=1$YWRtaW4xMjM$8rKZZKjTGxGfaCDLKDT8Dw';

-- Reset auto-increment counter if no users remain
UPDATE sqlite_sequence SET seq = 0 WHERE name = 'staff_users' AND (SELECT COUNT(*) FROM staff_users) = 0;