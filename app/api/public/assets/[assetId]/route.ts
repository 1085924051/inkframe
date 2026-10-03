import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function parseDataUrl(value: string) {
  const match = value.match(/^data:([^;,]+);base64,([\s\S]+)$/);
  if (!match) return null;
  try {
    return { contentType: match[1], body: Buffer.from(match[2], "base64") };
  } catch {
    return null;
  }
}

export async function GET(_request: Request, context: { params: { assetId: string } }) {
  const asset = await prisma.asset.findUnique({ where: { id: context.params.assetId }, select: { url: true, kind: true, status: true } });
  if (!asset?.url || !["image", "reference"].includes(asset.kind) || asset.status === "failed") return NextResponse.json({ error: "Asset not found" }, { status: 404 });

  const parsed = parseDataUrl(asset.url);
  if (parsed) {
    return new NextResponse(parsed.body, {
      headers: {
        "Content-Type": parsed.contentType,
        "Cache-Control": "public, max-age=86400, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
  if (/^https?:\/\//i.test(asset.url)) return NextResponse.redirect(asset.url, 302);
  return NextResponse.json({ error: "Asset URL is not publicly readable" }, { status: 422 });
}
