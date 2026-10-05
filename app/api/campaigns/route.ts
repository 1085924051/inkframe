import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const now = new Date();
  const campaigns = await prisma.campaign.findMany({
    where: {
      enabled: true,
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
      ],
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    take: 5,
    select: { id: true, name: true, title: true, subtitle: true, badge: true, discountPercent: true, bonusPercent: true, startsAt: true, endsAt: true, ctaLabel: true, ctaHref: true },
  });
  return NextResponse.json({ campaigns });
}
