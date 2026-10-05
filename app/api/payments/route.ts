import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createPaymentOrder, paymentProvider, toPaymentOrderView } from "@/lib/payment";

function amountMicros(value: unknown) {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round(amount * 1_000_000) : 0;
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const [user, orders, transactions, provider] = await Promise.all([
    prisma.user.findUnique({ where: { id: session.userId }, select: { balanceMicros: true } }),
    prisma.paymentOrder.findMany({ where: { userId: session.userId }, orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.walletTransaction.findMany({ where: { userId: session.userId }, orderBy: { createdAt: "desc" }, take: 30 }),
    paymentProvider(),
  ]);
  return NextResponse.json({ balanceMicros: user?.balanceMicros || 0, provider, orders: orders.map(toPaymentOrderView), transactions });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { amount?: unknown; provider?: unknown; subject?: unknown };
  const amount = amountMicros(body.amount);
  if (amount < 1_000_000 || amount > 2_000_000_000) return NextResponse.json({ error: "充值金额需在 1 元到 2000 元之间" }, { status: 400 });
  const provider = body.provider === "alipay" || body.provider === "wechat" || body.provider === "mock" ? body.provider : undefined;
  try {
    const order = await createPaymentOrder({ userId: session.userId, provider, amountMicros: amount, subject: typeof body.subject === "string" ? body.subject : undefined });
    return NextResponse.json({ order }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "创建支付订单失败" }, { status: 400 });
  }
}
