-- Clean up lockers stuck in Opening status
UPDATE lockers 
SET status = 'Free', 
    owner_key = NULL, 
    owner_type = NULL,
    updated_at = datetime('now')
WHERE status = 'Opening';

-- Show the result
SELECT status, COUNT(*) as count FROM lockers GROUP BY status;