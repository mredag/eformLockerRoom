-- Fix lockers stuck in Opening status
-- When a locker has an owner_key, it should be Owned, not Opening

UPDATE lockers 
SET status = 'Owned', 
    updated_at = datetime('now') 
WHERE status = 'Opening' 
  AND owner_key IS NOT NULL;

-- Show the updated lockers
SELECT id, status, owner_key, updated_at 
FROM lockers 
WHERE owner_key IS NOT NULL;