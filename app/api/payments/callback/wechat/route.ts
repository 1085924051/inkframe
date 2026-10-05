import { NextResponse } from "next/server";
import { verifyAndCompleteWechat } from "@/lib/payment";

export async function POST(request: Request) {
  const raw = await request.text();
  try {
    await verifyAndCompleteWechat(request.headers, raw);
    return NextResponse.json({ code: "SUCCESS", message: "成功" });
  } catch (error) {
    console.error("[payment/wechat] callback failed", error);
    return NextResponse.json({ code: "FAIL", message: error instanceof Error ? error.message : "回调处理失败" }, { status: 400 });
  }
}
