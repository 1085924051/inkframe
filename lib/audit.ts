import { prisma } from "./prisma";
import type { SessionUser } from "./auth";

// 操作审计日志：记录「谁、何时、做了什么」
export type AuditAction = "settings.save" | "user.update" | "user.delete" | "user.create" | "project.create" | "project.delete";

export async function recordAudit(actor: SessionUser | null, action: AuditAction, targetType: string, targetId?: string, detail?: string) {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: actor?.userId ?? null,
        actorName: actor?.name ?? "system",
        action,
        targetType,
        targetId: targetId ?? null,
        detail: detail?.slice(0, 500) ?? null,
      },
    });
  } catch (error) {
    console.error("[audit] 审计记录失败（不影响主操作）：", error);
  }
}

export async function listAuditLogs(limit = 50) {
  const rows = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map((row) => ({
    id: row.id,
    actorId: row.actorId,
    actorName: row.actorName,
    action: row.action,
    targetType: row.targetType,
    targetId: row.targetId,
    detail: row.detail,
    createdAt: row.createdAt.toISOString(),
  }));
}