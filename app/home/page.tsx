import { getSession } from "@/lib/auth";
import { MarketingHome } from "@/components/marketing-home";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await getSession();
  return <MarketingHome signedIn={Boolean(session)} />;
}
