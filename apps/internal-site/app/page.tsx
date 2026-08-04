import { CaseCatalog } from "@/components/case-catalog";
import { InternalCatalogHeader } from "@/components/internal-catalog-header";
import { InternalPageShell } from "@/components/internal-page-shell";
import { listCases } from "@/lib/server/repositories/content-repository";

export const dynamic = "force-dynamic";

export default async function InternalHomePage() {
  const cases: Awaited<ReturnType<typeof listCases>> = await listCases().catch(() => []);

  return (
    <InternalPageShell>
      <InternalCatalogHeader />
      <CaseCatalog items={cases} />
    </InternalPageShell>
  );
}
