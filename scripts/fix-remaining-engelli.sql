UPDATE lockers SET status = 'Blocked' WHERE status = 'Engelli';
SELECT id, status FROM lockers WHERE id IN (2, 3, 4);