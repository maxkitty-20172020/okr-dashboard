-- CreateTable
CREATE TABLE "Period" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "startAt" DATETIME NOT NULL,
    "endAt" DATETIME NOT NULL,
    "parentId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Period_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Period" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WorkPackage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "parentId" TEXT,
    "taskId" TEXT,
    "keyResultId" TEXT,
    "periodId" TEXT,
    "dueAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'TODO',
    "doneAt" DATETIME,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WorkPackage_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "WorkPackage" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "WorkPackage_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "WeeklyTask" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "WorkPackage_keyResultId_fkey" FOREIGN KEY ("keyResultId") REFERENCES "KeyResult" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "WorkPackage_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "Period" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Deliverable" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workPackageId" TEXT,
    "taskId" TEXT,
    "title" TEXT NOT NULL,
    "ownerUserId" TEXT,
    "dueAt" DATETIME,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Deliverable_workPackageId_fkey" FOREIGN KEY ("workPackageId") REFERENCES "WorkPackage" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Deliverable_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "WeeklyTask" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Deliverable_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RaciAssignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "subjectType" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    CONSTRAINT "RaciAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CheckIn" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "periodId" TEXT NOT NULL,
    "scopeType" TEXT NOT NULL,
    "scopeId" TEXT,
    "authorId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "metricNote" TEXT,
    "blocker" TEXT,
    "nextStep" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CheckIn_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "Period" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CheckIn_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
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
    "periodId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "KeyResult_objectiveId_fkey" FOREIGN KEY ("objectiveId") REFERENCES "Objective" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "KeyResult_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "Period" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_KeyResult" ("baselineValue", "createdAt", "currentValue", "direction", "id", "objectiveId", "targetValue", "title", "unit", "updatedAt") SELECT "baselineValue", "createdAt", "currentValue", "direction", "id", "objectiveId", "targetValue", "title", "unit", "updatedAt" FROM "KeyResult";
DROP TABLE "KeyResult";
ALTER TABLE "new_KeyResult" RENAME TO "KeyResult";
CREATE TABLE "new_Objective" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "cycle" TEXT NOT NULL,
    "periodId" TEXT,
    "ownerId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Objective_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "Period" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Objective_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Objective" ("createdAt", "cycle", "description", "id", "ownerId", "title", "updatedAt") SELECT "createdAt", "cycle", "description", "id", "ownerId", "title", "updatedAt" FROM "Objective";
DROP TABLE "Objective";
ALTER TABLE "new_Objective" RENAME TO "Objective";
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
    "schedulePeriodId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WeeklyTask_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "WeeklyTask_keyResultId_fkey" FOREIGN KEY ("keyResultId") REFERENCES "KeyResult" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "WeeklyTask_schedulePeriodId_fkey" FOREIGN KEY ("schedulePeriodId") REFERENCES "Period" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_WeeklyTask" ("archivedAt", "area", "completedAt", "completionCriteria", "createdAt", "dueAt", "health", "id", "keyResultId", "kind", "lastConfirmedAt", "latestProgress", "nextAction", "nextFollowUpAt", "ownerId", "priority", "riskNote", "scope", "status", "title", "updatedAt", "version", "weekStart") SELECT "archivedAt", "area", "completedAt", "completionCriteria", "createdAt", "dueAt", "health", "id", "keyResultId", "kind", "lastConfirmedAt", "latestProgress", "nextAction", "nextFollowUpAt", "ownerId", "priority", "riskNote", "scope", "status", "title", "updatedAt", "version", "weekStart" FROM "WeeklyTask";
DROP TABLE "WeeklyTask";
ALTER TABLE "new_WeeklyTask" RENAME TO "WeeklyTask";
CREATE INDEX "WeeklyTask_archivedAt_status_idx" ON "WeeklyTask"("archivedAt", "status");
CREATE INDEX "WeeklyTask_ownerId_nextFollowUpAt_idx" ON "WeeklyTask"("ownerId", "nextFollowUpAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Period_kind_label_key" ON "Period"("kind", "label");

-- CreateIndex
CREATE INDEX "RaciAssignment_subjectType_subjectId_idx" ON "RaciAssignment"("subjectType", "subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "RaciAssignment_subjectType_subjectId_role_userId_key" ON "RaciAssignment"("subjectType", "subjectId", "role", "userId");

-- CreateIndex
CREATE INDEX "CheckIn_periodId_scopeType_scopeId_idx" ON "CheckIn"("periodId", "scopeType", "scopeId");

-- Backfill quarter periods from existing Objective.cycle strings (YYYY-Qn). cycle itself is kept.
INSERT INTO "Period" ("id", "kind", "label", "startAt", "endAt", "createdAt")
SELECT
  'period-q-' || "cycle",
  'QUARTER',
  "cycle",
  CAST(strftime('%s', printf('%s-%02d-01', substr("cycle", 1, 4), (CAST(substr("cycle", 7, 1) AS INTEGER) - 1) * 3 + 1)) AS INTEGER) * 1000,
  CAST(strftime('%s',
    CASE CAST(substr("cycle", 7, 1) AS INTEGER)
      WHEN 4 THEN printf('%d-01-01', CAST(substr("cycle", 1, 4) AS INTEGER) + 1)
      ELSE printf('%s-%02d-01', substr("cycle", 1, 4), CAST(substr("cycle", 7, 1) AS INTEGER) * 3 + 1)
    END
  ) AS INTEGER) * 1000,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000
FROM (SELECT DISTINCT "cycle" FROM "Objective")
WHERE "cycle" GLOB '[0-9][0-9][0-9][0-9]-Q[1-4]';

UPDATE "Objective"
SET "periodId" = (
  SELECT "id" FROM "Period"
  WHERE "Period"."kind" = 'QUARTER' AND "Period"."label" = "Objective"."cycle"
)
WHERE "periodId" IS NULL
AND EXISTS (
  SELECT 1 FROM "Period"
  WHERE "Period"."kind" = 'QUARTER' AND "Period"."label" = "Objective"."cycle"
);

-- v1 RACI defaults: owner is both R and A; active collaborators are C unless they are the owner.
INSERT INTO "RaciAssignment" ("id", "subjectType", "subjectId", "role", "userId")
SELECT 'raci-r-' || "id", 'TASK', "id", 'R', "ownerId" FROM "WeeklyTask";

INSERT INTO "RaciAssignment" ("id", "subjectType", "subjectId", "role", "userId")
SELECT 'raci-a-' || "id", 'TASK', "id", 'A', "ownerId" FROM "WeeklyTask";

INSERT INTO "RaciAssignment" ("id", "subjectType", "subjectId", "role", "userId")
SELECT 'raci-c-' || "TaskCollaborator"."id", 'TASK', "TaskCollaborator"."taskId", 'C', "TaskCollaborator"."userId"
FROM "TaskCollaborator"
INNER JOIN "WeeklyTask" ON "WeeklyTask"."id" = "TaskCollaborator"."taskId"
WHERE "TaskCollaborator"."active" = 1
AND "TaskCollaborator"."userId" != "WeeklyTask"."ownerId";

-- Optional copy of collaborator deliverable text into Deliverable. TaskCollaborator rows are kept.
INSERT INTO "Deliverable" ("id", "taskId", "title", "ownerUserId", "dueAt", "done", "note", "active", "updatedAt")
SELECT 'deliverable-' || "id", "taskId", "deliverable", "userId", "dueAt", "done", "note", "active", "updatedAt"
FROM "TaskCollaborator";
