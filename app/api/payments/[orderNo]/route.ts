import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toPaymentOrderView } from "@/lib/payment";

export async function GET(_request: Request, context: { params: { orderNo: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const order = await prisma.paymentOrder.findFirst({ where: { orderNo: context.params.orderNo, userId: session.userId } });
  if (!order) return NextResponse.json({ error: "支付订单不存在" }, { status: 404 });
  if (order.status === "pending" && order.expiresAt.getTime() <= Date.now()) {
    const closed = await prisma.paymentOrder.update({ where: { id: order.id }, data: { status: "closed" } });
    return NextResponse.json({ order: toPaymentOrderView(closed) });
  }
  return NextResponse.json({ order: toPaymentOrderView(order) });
}
