import { redirect } from "next/navigation";
import {
  getPublishedGroupRouteAlias,
  listPublishedGroupRouteAliases,
} from "@/lib/content";

export const dynamicParams = false;

export async function generateStaticParams() {
  const aliases = await listPublishedGroupRouteAliases();
  return aliases.map((alias) => ({
    caseSlug: alias.caseSlug,
    groupSlug: alias.groupSlug,
  }));
}

export default async function LegacyPublicGroupPage({
  params,
}: {
  params: Promise<{ caseSlug: string; groupSlug: string }>;
}) {
  const { caseSlug, groupSlug } = await params;
  const alias = await getPublishedGroupRouteAlias(caseSlug, groupSlug);

  if (!alias) {
    redirect("/");
  }

  redirect(`/g/${alias.publicSlug}`);
}
