import { LinearProgress, Skeleton, Stack } from "@mui/material";
import { InternalPageShell } from "@/components/internal-page-shell";

/** Mirrors the catalog rhythm while a streamed route is waiting for server data. */
export default function InternalRouteLoading() {
  return (
    <InternalPageShell>
      <Stack role="status" aria-label="正在加载页面" spacing={2.5} sx={{ pt: 3 }}>
        <LinearProgress sx={{ height: 3, borderRadius: 0 }} />
        <Stack spacing={1} sx={{ py: 2 }}>
          <Skeleton variant="text" width="min(260px, 64vw)" height={44} />
          <Skeleton variant="text" width="min(420px, 82vw)" height={22} />
        </Stack>
        <Skeleton variant="rounded" height={52} sx={{ borderRadius: "26px" }} />
        <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
          {[0, 1, 2].map((index) => (
            <Skeleton
              key={index}
              variant="rounded"
              height={208}
              sx={{ flex: 1, borderRadius: 2 }}
            />
          ))}
        </Stack>
      </Stack>
    </InternalPageShell>
  );
}
