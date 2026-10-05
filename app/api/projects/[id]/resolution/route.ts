import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isSameOrigin } from "@/lib/rate-limit";
import { updateProjectResolution } from "@/lib/store";
import { getResolutionOption } from "@/lib/resolution";
import type { ResolutionPreset } from "@/lib/types";

export async function PATCH(request: Request, context: { params: { id: string } }) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { resolutionPreset?: string };
  const preset = getResolutionOption(body.resolutionPreset).id as ResolutionPreset;
  const project = await updateProjectResolution(context.params.id, preset, { userId: session.userId, isAdmin: session.role === "ADMIN" });
  return project ? NextResponse.json({ project }) : NextResponse.json({ error: "项目不存在或无权修改" }, { status: 404 });
}
