import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { currentCycle } from "../lib/week";
import { today, snapshot } from "../lib/tasks";
const prisma = new PrismaClient();
const future = (days: number) => new Date(today().getTime() + days * 86400_000);

async function main() {
  if (await prisma.user.count()) {
    console.log("已有账号和数据，跳过演示数据初始化。请勿用 seed 重置工作数据。");
    return;
  }
  const passwordHash = await hash("okr12345", 10);
  await prisma.$transaction(async tx => {
    await tx.user.create({ data: { name: "陈总", email: "okr@okr.local", passwordHash, role: "BOSS" } });
    const li = await tx.user.create({ data: { name: "李明", email: "okr1@okr.local", passwordHash, role: "MANAGER" } });
    const wang = await tx.user.create({ data: { name: "王芳", email: "okr2@okr.local", passwordHash, role: "MANAGER" } });
    const zhao = await tx.user.create({ data: { name: "赵强", email: "okr3@okr.local", passwordHash, role: "MANAGER" } });
    const objective = await tx.objective.create({ data: { title: "改善核心产品运营效率", description: "演示目标：降低广告成本并验证产品转化改进。", cycle: currentCycle(), ownerId: li.id, keyResults: { create: { title: "ACOS 从 35% 降至 25%", baselineValue: 35, targetValue: 25, currentValue: 30, direction: "DECREASE", unit: "%" } } }, include: { keyResults: true } });
    const business = await tx.task.create({ data: { title: "验证核心产品主图方案", area: "BUSINESS", kind: "LONG_TERM", ownerId: li.id, scope: "美国站 · 厨房线", completionCriteria: "取得测试结果，确定采用哪版主图并记录依据。", status: "WAITING", latestProgress: "两版主图已就绪，测试运行中。", nextAction: "按约定日期收集结果", nextFollowUpAt: future(7), dueAt: future(14), lastConfirmedAt: new Date(), keyResultId: objective.keyResults[0].id, milestones: { create: [{ title: "准备两版主图", done: true }, { title: "取得测试结果", dueAt: future(12) }, { title: "确定最终方案", dueAt: future(14) }] } }, include: { owner: true } });
    const people = await tx.task.create({ data: { title: "新人独立接手产品线", area: "PEOPLE", kind: "LONG_TERM", ownerId: wang.id, completionCriteria: "通过独立操作验收，并完成任务交接。", status: "IN_PROGRESS", latestProgress: "已完成基础培训，准备独立操作验收。", nextAction: "与业务负责人确认验收标准", nextFollowUpAt: future(2), dueAt: future(10), lastConfirmedAt: new Date(), collaborators: { create: { userId: li.id, deliverable: "提供业务验收标准", dueAt: future(2) } } }, include: { owner: true } });
    const inventory = await tx.task.create({ data: { title: "确认旺季备货与出货排期", area: "INVENTORY", kind: "LONG_TERM", ownerId: zhao.id, priority: 2, scope: "英国站 · 收纳线", completionCriteria: "确认销量预测、补货数量及供应商出货排期。", status: "BLOCKED", health: "AT_RISK", latestProgress: "销售预测已交付，供应商尚未确认档期。", riskNote: "可能影响备货节点，需要主管协调采购确认备用方案。", nextAction: "与采购确认供应商档期", nextFollowUpAt: future(0), dueAt: future(20), lastConfirmedAt: new Date(), collaborators: { create: [{ userId: li.id, deliverable: "提供销售预测", done: true, note: "预测清单已交付。" }, { userId: wang.id, deliverable: "协调旺季人员与备岗", dueAt: future(5) }] } }, include: { owner: true } });
    for (const task of [business, people, inventory]) await tx.taskUpdate.create({ data: { taskId: task.id, authorId: task.ownerId, kind: "CREATED", body: "初始化演示事项。" + task.latestProgress, snapshot: snapshot(task) } });
  });
}
main().then(() => prisma.$disconnect()).catch(async error => { console.error(error); await prisma.$disconnect(); process.exit(1); });
