import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../prisma";
import { hashPassword } from "../security";
import { mockCompletePayment, markPaymentPaid } from "../payment";

describe("payment wallet", () => {
  let userId = "";
  beforeAll(async () => {
    const user = await prisma.user.create({ data: { email: `payment-${Date.now()}@test.local`, name: "支付测试", passwordHash: hashPassword("123456") } });
    userId = user.id;
  });

  it("Mock 支付入账并对重复回调幂等", async () => {
    const order = await prisma.paymentOrder.create({ data: { orderNo: `IFTEST${Date.now()}`, userId, provider: "mock", subject: "测试充值", amountMicros: 10_000_000, creditMicros: 10_000_000, expiresAt: new Date(Date.now() + 60_000) } });
    await mockCompletePayment(order.orderNo);
    await mockCompletePayment(order.orderNo);
    const user = await prisma.user.findUnique({ where: { id: userId } });
    const transactions = await prisma.walletTransaction.findMany({ where: { orderId: order.id } });
    expect(user?.balanceMicros).toBe(10_000_000);
    expect(transactions).toHaveLength(1);
  });

  it("拒绝金额不一致的支付回调", async () => {
    const order = await prisma.paymentOrder.create({ data: { orderNo: `IFTEST${Date.now()}B`, userId, provider: "mock", subject: "金额校验", amountMicros: 5_000_000, creditMicros: 5_000_000, expiresAt: new Date(Date.now() + 60_000) } });
    await expect(markPaymentPaid(order.orderNo, "trade-wrong", 4_000_000, {})).rejects.toThrow("支付金额与订单金额不一致");
  });
});
