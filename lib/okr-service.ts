import { type Prisma, type PrismaClient } from "@prisma/client";
import { resolveQuarterPeriod } from "./period";
import { type Member } from "./tasks";

export const okrErrorMessages = {
  "read-only": "老板账号仅可查看，不能修改数据。请确认当前账号仍有填报权限。",
  owner: "请选择存在的填报成员作为目标负责人，老板不能负责目标填报。",
  title: "请填写标题，且不超过 160 字。修改未保存。",
  description: "描述不能超过 2000 字。修改未保存。",
  unit: "单位不能超过 20 字。修改未保存。",
  cycle: "周期格式无效，请选择有效年份和季度。修改未保存。",
  direction: "指标方向只能选择提升或降低。修改未保存。",
  number: "请填写有效的起点值、当前值和目标值。修改未保存。",
  range: "目标值需符合方向：提升时要高于起点（例：销量从 100 增至 150），降低时要低于起点（例：成本从 35% 降至 25%）。修改未保存。",
  "objective-linked": "目标或其下关键结果存在关联事项或周期汇报，不能删除。请保留历史记录。",
  "kr-linked": "关键结果存在关联事项或周期汇报，不能删除。请保留历史记录。",
  missing: "目标或关键结果已不存在，请刷新页面后重试。",
} as const;
export class OkrError extends Error {
  constructor(public readonly code: keyof typeof okrErrorMessages) { super(okrErrorMessages[code]); }
}
export type ObjectiveInput = { title: string; description?: string; cycle: string; ownerId: string };
export type KeyResultInput = { title: string; unit?: string; direction: string; baselineValue: string | number; currentValue: string | number; targetValue: string | number };
type Client = Prisma.TransactionClient;

async function writer(tx: Client, actor: Pick<Member, "id">) {
  const user = await tx.user.findUnique({ where: { id: actor.id }, select: { role: true } });
  if (!user || user.role === "BOSS") throw new OkrError("read-only");
}
function title(value: string) {
  const result = value.trim();
  if (!result || result.length > 160) throw new OkrError("title");
  return result;
}
async function objectiveData(tx: Client, input: ObjectiveInput) {
  const result = { title: title(input.title), description: (input.description ?? "").trim(), cycle: input.cycle.trim(), ownerId: input.ownerId.trim() };
  if (result.description.length > 2000) throw new OkrError("description");
  if (!/^\d{4}-Q[1-4]$/.test(result.cycle)) throw new OkrError("cycle");
  const owner = await tx.user.findUnique({ where: { id: result.ownerId }, select: { role: true } });
  if (!owner || owner.role === "BOSS") throw new OkrError("owner");
  const period = await resolveQuarterPeriod(tx, result.cycle);
  return { ...result, periodId: period.id };
}
function finite(value: string | number) {
  if (typeof value === "string" && !value.trim()) throw new OkrError("number");
  const result = Number(value);
  if (!Number.isFinite(result)) throw new OkrError("number");
  return result;
}
function keyResultData(input: KeyResultInput) {
  const result = { title: title(input.title), unit: input.unit?.trim() || "%", direction: input.direction,
    baselineValue: finite(input.baselineValue), targetValue: finite(input.targetValue), currentValue: finite(input.currentValue) };
  if (result.unit.length > 20) throw new OkrError("unit");
  if (result.direction !== "INCREASE" && result.direction !== "DECREASE") throw new OkrError("direction");
  if (result.direction === "INCREASE" ? result.targetValue <= result.baselineValue : result.targetValue >= result.baselineValue) throw new OkrError("range");
  return result;
}
async function objectiveExists(tx: Client, id: string) {
  if (!await tx.objective.findUnique({ where: { id }, select: { id: true } })) throw new OkrError("missing");
}
async function keyResultExists(tx: Client, id: string) {
  if (!await tx.keyResult.findUnique({ where: { id }, select: { id: true } })) throw new OkrError("missing");
}

export async function createObjective(db: PrismaClient, actor: Member, input: ObjectiveInput) {
  return db.$transaction(async tx => {
    await writer(tx, actor);
    return tx.objective.create({ data: await objectiveData(tx, input) });
  });
}
export async function updateObjective(db: PrismaClient, actor: Member, id: string, input: ObjectiveInput) {
  return db.$transaction(async tx => {
    await writer(tx, actor);
    await objectiveExists(tx, id);
    return tx.objective.update({ where: { id }, data: await objectiveData(tx, input) });
  });
}
export async function deleteObjective(db: PrismaClient, actor: Member, id: string) {
  return db.$transaction(async tx => {
    await writer(tx, actor);
    await objectiveExists(tx, id);
    const krIds = (await tx.keyResult.findMany({ where: { objectiveId: id }, select: { id: true } })).map(kr => kr.id);
    const [taskCount, checkInCount] = await Promise.all([
      tx.task.count({ where: { keyResultId: { in: krIds } } }),
      tx.checkIn.count({ where: { OR: [{ scopeType: "OBJECTIVE", scopeId: id }, { scopeType: "KEY_RESULT", scopeId: { in: krIds } }] } }),
    ]);
    if (taskCount || checkInCount) throw new OkrError("objective-linked");
    return tx.objective.delete({ where: { id } });
  });
}
export async function createKeyResult(db: PrismaClient, actor: Member, objectiveId: string, input: KeyResultInput) {
  return db.$transaction(async tx => {
    await writer(tx, actor);
    await objectiveExists(tx, objectiveId);
    return tx.keyResult.create({ data: { objectiveId, ...keyResultData(input) } });
  });
}
export async function updateKeyResult(db: PrismaClient, actor: Member, id: string, input: KeyResultInput) {
  return db.$transaction(async tx => {
    await writer(tx, actor);
    await keyResultExists(tx, id);
    return tx.keyResult.update({ where: { id }, data: keyResultData(input) });
  });
}
export async function deleteKeyResult(db: PrismaClient, actor: Member, id: string) {
  return db.$transaction(async tx => {
    await writer(tx, actor);
    await keyResultExists(tx, id);
    const [taskCount, checkInCount] = await Promise.all([
      tx.task.count({ where: { keyResultId: id } }),
      tx.checkIn.count({ where: { scopeType: "KEY_RESULT", scopeId: id } }),
    ]);
    if (taskCount || checkInCount) throw new OkrError("kr-linked");
    return tx.keyResult.delete({ where: { id } });
  });
}
