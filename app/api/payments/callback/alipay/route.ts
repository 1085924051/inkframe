import { NextResponse } from "next/server";
import { verifyAndCompleteAlipay } from "@/lib/payment";

export async function POST(request: Request) {
  const raw = await request.text();
  try {
    const form: Record<string, string> = {};
    new URLSearchParams(raw).forEach((value, key) => { form[key] = value; });
    await verifyAndCompleteAlipay(form);
    return new NextResponse("success", { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  } catch (error) {
    console.error("[payment/alipay] callback failed", error);
    return new NextResponse("failure", { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
}
