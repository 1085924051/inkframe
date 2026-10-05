import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { mockCompletePayment, toPaymentOrderView } from "@/lib/payment";

export async function POST(_request: Request, context: { params: { orderNo: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const order = await prisma.paymentOrder.findFirst({ where: { orderNo: context.params.orderNo, userId: session.userId } });
  if (!order || order.provider !== "mock") return NextResponse.json({ error: "仅支持 Mock 订单" }, { status: 400 });
  if (process.env.NODE_ENV === "production") return NextResponse.json({ error: "生产环境不允许 Mock 支付" }, { status: 403 });
  try {
    const paid = await mockCompletePayment(order.orderNo);
    return NextResponse.json({ order: toPaymentOrderView(paid) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Mock 支付失败" }, { status: 400 });
  }
}
