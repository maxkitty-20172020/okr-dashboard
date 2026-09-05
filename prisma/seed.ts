import { PrismaClient, TaskStatus } from "@prisma/client";
import { hash } from "bcryptjs";
import { currentCycle, startOfWeek } from "../lib/week";

const prisma = new PrismaClient();

const DEFAULT_PASSWORD = "okr12345";

async function main() {
  const passwordHash = await hash(DEFAULT_PASSWORD, 10);
  const cycle = currentCycle();
  const weekStart = startOfWeek();

  await prisma.weeklyTask.deleteMany();
  await prisma.keyResult.deleteMany();
  await prisma.objective.deleteMany();
  await prisma.user.deleteMany();

  const boss = await prisma.user.create({
    data: {
      name: "陈总",
      email: "boss@okr.local",
      passwordHash,
      role: "BOSS",
    },
  });

  const li = await prisma.user.create({
    data: {
      name: "李明",
      email: "li@okr.local",
      passwordHash,
      role: "MANAGER",
    },
  });

  const wang = await prisma.user.create({
    data: {
      name: "王芳",
      email: "wang@okr.local",
      passwordHash,
      role: "MANAGER",
    },
  });

  const zhao = await prisma.user.create({
    data: {
      name: "赵强",
      email: "zhao@okr.local",
      passwordHash,
      role: "MANAGER",
    },
  });

  const quality = await prisma.objective.create({
    data: {
      title: "提升经营质量，把利润做厚",
      description: "围绕毛利和复购，把公司从规模优先转到质量优先。",
      cycle,
      ownerId: boss.id,
      keyResults: {
        create: [
          {
            title: "季度毛利率达到 35%",
            currentValue: 28,
            targetValue: 35,
            unit: "%",
          },
          {
            title: "核心产品复购率达到 40%",
            currentValue: 31,
            targetValue: 40,
            unit: "%",
          },
        ],
      },
    },
    include: { keyResults: true },
  });

  const org = await prisma.objective.create({
    data: {
      title: "让管理层每周对齐一次真实进度",
      description: "用同一块面板看目标、看任务，减少口头同步损耗。",
      cycle,
      ownerId: li.id,
      keyResults: {
        create: [
          {
            title: "管理层周会准时完成率 100%",
            currentValue: 75,
            targetValue: 100,
            unit: "%",
          },
        ],
      },
    },
    include: { keyResults: true },
  });

  const market = await prisma.objective.create({
    data: {
      title: "拿下可复制的标杆客户",
      description: "优先服务能沉淀方法论的客户，而不是只堆数量。",
      cycle,
      ownerId: wang.id,
      keyResults: {
        create: [
          {
            title: "新增标杆客户 8 家",
            currentValue: 3,
            targetValue: 8,
            unit: "家",
          },
        ],
      },
    },
    include: { keyResults: true },
  });

  const delivery = await prisma.objective.create({
    data: {
      title: "把交付节奏稳住",
      description: "减少延期，让一线承诺和管理层看到的进度一致。",
      cycle,
      ownerId: zhao.id,
      keyResults: {
        create: [
          {
            title: "准时交付率达到 95%",
            currentValue: 88,
            targetValue: 95,
            unit: "%",
          },
        ],
      },
    },
    include: { keyResults: true },
  });

  await prisma.weeklyTask.createMany({
    data: [
      {
        title: "复核本季度毛利口径，并在周会上对齐一次",
        status: TaskStatus.IN_PROGRESS,
        weekStart,
        ownerId: boss.id,
        keyResultId: quality.keyResults[0]?.id,
      },
      {
        title: "整理本周经营异常，列出 3 个需要管理层拍板的问题",
        status: TaskStatus.TODO,
        weekStart,
        ownerId: boss.id,
        keyResultId: quality.keyResults[1]?.id,
      },
      {
        title: "把四人本周任务全部录入面板，并检查缺项",
        status: TaskStatus.DONE,
        weekStart,
        ownerId: li.id,
        keyResultId: org.keyResults[0]?.id,
      },
      {
        title: "准备下周周会材料：目标进度 + 风险清单",
        status: TaskStatus.IN_PROGRESS,
        weekStart,
        ownerId: li.id,
        keyResultId: org.keyResults[0]?.id,
      },
      {
        title: "拜访 2 家潜在标杆客户，记录可复制条件",
        status: TaskStatus.IN_PROGRESS,
        weekStart,
        ownerId: wang.id,
        keyResultId: market.keyResults[0]?.id,
      },
      {
        title: "复盘上月延期订单，给出本周纠偏动作",
        status: TaskStatus.TODO,
        weekStart,
        ownerId: zhao.id,
        keyResultId: delivery.keyResults[0]?.id,
      },
    ],
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
