-- CreateTable
CREATE TABLE "TaskCollaborator" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deliverable" TEXT NOT NULL,
    "dueAt" DATETIME,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TaskCollaborator_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "WeeklyTask" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TaskCollaborator_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TaskMilestone" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "dueAt" DATETIME,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaskMilestone_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "WeeklyTask" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TaskUpdate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "authorId" TEXT,
    "kind" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "snapshot" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaskUpdate_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "WeeklyTask" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TaskUpdate_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_KeyResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "currentValue" REAL NOT NULL DEFAULT 0,
    "targetValue" REAL NOT NULL,
    "baselineValue" REAL NOT NULL DEFAULT 0,
    "direction" TEXT NOT NULL DEFAULT 'INCREASE',
    "unit" TEXT NOT NULL DEFAULT '%',
    "objectiveId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "KeyResult_objectiveId_fkey" FOREIGN KEY ("objectiveId") REFERENCES "Objective" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_KeyResult" ("createdAt", "currentValue", "id", "objectiveId", "targetValue", "title", "unit", "updatedAt") SELECT "createdAt", "currentValue", "id", "objectiveId", "targetValue", "title", "unit", "updatedAt" FROM "KeyResult";
DROP TABLE "KeyResult";
ALTER TABLE "new_KeyResult" RENAME TO "KeyResult";
CREATE TABLE "new_WeeklyTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'TODO',
    "weekStart" DATETIME,
    "area" TEXT NOT NULL DEFAULT 'OTHER',
    "kind" TEXT NOT NULL DEFAULT 'SHORT_TERM',
    "priority" INTEGER NOT NULL DEFAULT 1,
    "scope" TEXT NOT NULL DEFAULT '',
    "completionCriteria" TEXT NOT NULL DEFAULT '',
    "latestProgress" TEXT NOT NULL DEFAULT '',
    "nextAction" TEXT NOT NULL DEFAULT '',
    "health" TEXT NOT NULL DEFAULT 'ON_TRACK',
    "riskNote" TEXT NOT NULL DEFAULT '',
    "dueAt" DATETIME,
    "nextFollowUpAt" DATETIME,
    "lastConfirmedAt" DATETIME,
    "completedAt" DATETIME,
    "archivedAt" DATETIME,
    "version" INTEGER NOT NULL DEFAULT 0,
    "ownerId" TEXT NOT NULL,
    "keyResultId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WeeklyTask_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "WeeklyTask_keyResultId_fkey" FOREIGN KEY ("keyResultId") REFERENCES "KeyResult" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_WeeklyTask" ("createdAt", "id", "keyResultId", "ownerId", "status", "title", "updatedAt", "weekStart") SELECT "createdAt", "id", "keyResultId", "ownerId", "status", "title", "updatedAt", "weekStart" FROM "WeeklyTask";
DROP TABLE "WeeklyTask";
ALTER TABLE "new_WeeklyTask" RENAME TO "WeeklyTask";
CREATE INDEX "WeeklyTask_archivedAt_status_idx" ON "WeeklyTask"("archivedAt", "status");
CREATE INDEX "WeeklyTask_ownerId_nextFollowUpAt_idx" ON "WeeklyTask"("ownerId", "nextFollowUpAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "TaskCollaborator_taskId_userId_key" ON "TaskCollaborator"("taskId", "userId");

-- CreateIndex
CREATE INDEX "TaskUpdate_taskId_createdAt_idx" ON "TaskUpdate"("taskId", "createdAt");

-- Preserve the old week and status without inventing progress confirmations.
UPDATE "WeeklyTask" SET "completedAt" = "updatedAt" WHERE "status" = 'DONE';
INSERT INTO "TaskUpdate" ("id", "taskId", "kind", "body", "snapshot")
SELECT 'migration-' || "id", "id", 'MIGRATED',
  '由原周任务迁入，保留原负责人和状态；完成任务的历史时间沿用原更新时间。',
  json_object('title', "title", 'status', "status", 'ownerId', "ownerId", 'legacyWeekStart', "weekStart")
FROM "WeeklyTask";
