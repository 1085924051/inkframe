import { NextResponse } from "next/server";
import { getSharedStyle } from "@/lib/store";

export async function GET(_request: Request, context: { params: { token: string } }) {
  const shared = await getSharedStyle(context.params.token);
  if (!shared) return NextResponse.json({ error: "Share link not found" }, { status: 404 });
  return NextResponse.json(shared);
}
