import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (session.role !== "ADMIN") return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });

  const [users, activeUsers, projects, jobs, scenes, shots, usage] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { status: "active" } }),
    prisma.project.count(),
    prisma.videoJob.count(),
    prisma.scene.count(),
    prisma.shot.count(),
    prisma.usageRecord.aggregate({ _sum: { costCents: true, costMicros: true } }),
  ]);
  const jobStatus = await prisma.videoJob.groupBy({ by: ["status"], _count: true });
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const projects7d = await prisma.project.count({ where: { createdAt: { gte: weekAgo } } });

  return NextResponse.json({
    stats: {
      users, activeUsers, projects, projects7d, scenes, shots, jobs,
      jobStatus: Object.fromEntries(jobStatus.map((row) => [row.status, row._count])),
      costCents: usage._sum.costCents || 0,
      costMicros: usage._sum.costMicros || 0,
    },
  });
}
