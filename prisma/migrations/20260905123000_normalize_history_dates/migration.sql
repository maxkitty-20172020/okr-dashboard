-- SQLite sorts numeric Prisma timestamps before textual SQL defaults. Normalize
-- migrated history to epoch milliseconds so newest-first ordering stays correct.
UPDATE "TaskUpdate"
SET "createdAt" = CAST(strftime('%s', "createdAt") AS INTEGER) * 1000
WHERE typeof("createdAt") = 'text' AND strftime('%s', "createdAt") IS NOT NULL;
