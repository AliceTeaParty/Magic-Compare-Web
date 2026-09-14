"use client";

import { Alert, Button, Snackbar } from "@mui/material";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export interface RuntimeBuildIdentity {
  appVersion: string | null;
  commitHash: string | null;
}

/** Include commits so two deployments with the same release version remain distinguishable. */
export function buildIdentityKey(value: RuntimeBuildIdentity) {
  return value.appVersion || value.commitHash
    ? JSON.stringify([value.appVersion, value.commitHash])
    : null;
}

/** Ignore missing/HTML/error responses from older deployments instead of prompting on invalid data. */
export function parseRuntimeBuild(value: unknown): RuntimeBuildIdentity | null {
  if (!value || typeof value !== "object") return null;
  const entry = value as Record<string, unknown>;
  if (
    (typeof entry.appVersion !== "string" && entry.appVersion !== null) ||
    (typeof entry.commitHash !== "string" && entry.commitHash !== null)
  )
    return null;
  const build = {
    appVersion: entry.appVersion as string | null,
    commitHash: entry.commitHash as string | null,
  };
  return buildIdentityKey(build) ? build : null;
}

/** A fresh document resets viewer workers and queues; a nonce avoids reusing the cached document URL. */
export function buildRefreshUrl(currentUrl: string, nonce: string) {
  const url = new URL(currentUrl);
  url.searchParams.set("__mc_refresh", nonce);
  return url.href;
}

/** Check the deployed build on navigation, focus and visible intervals without interrupting edits/uploads. */
export function MagicBuildRuntimeGuard({
  appVersion = null,
  commitHash = null,
}: {
  appVersion?: string | null;
  commitHash?: string | null;
}) {
  const pathname = usePathname();
  const currentKey = buildIdentityKey({ appVersion, commitHash });
  const [availableKey, setAvailableKey] = useState<string | null>(null);

  useEffect(() => {
    if (!currentKey) return;
    const abort = new AbortController();
    let pending = false;
    let lastCheck = 0;
    /** Ignore unavailable update metadata; the currently loaded application remains usable offline. */
    async function checkBuild() {
      if (document.visibilityState !== "visible" || pending || Date.now() - lastCheck < 15_000)
        return;
      pending = true;
      lastCheck = Date.now();
      const request = new AbortController();
      const timeout = setTimeout(() => request.abort(), 5000);
      const onAbort = () => request.abort();
      abort.signal.addEventListener("abort", onAbort, { once: true });
      try {
        const response = await fetch(`/build.json?check=${Date.now()}`, {
          cache: "no-store",
          signal: request.signal,
        });
        if (!response.ok) return;
        const build = parseRuntimeBuild(await response.json());
        if (build && !abort.signal.aborted) setAvailableKey(buildIdentityKey(build));
      } catch {
        // Network failures and old deployments without metadata are not application failures.
      } finally {
        clearTimeout(timeout);
        abort.signal.removeEventListener("abort", onAbort);
        pending = false;
      }
    }
    void checkBuild();
    window.addEventListener("focus", checkBuild);
    document.addEventListener("visibilitychange", checkBuild);
    const timer = setInterval(checkBuild, 60_000);
    return () => {
      abort.abort();
      clearInterval(timer);
      window.removeEventListener("focus", checkBuild);
      document.removeEventListener("visibilitychange", checkBuild);
    };
  }, [currentKey, pathname]);

  return (
    <Snackbar
      open={Boolean(availableKey && availableKey !== currentKey)}
      anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
    >
      <Alert
        severity="info"
        action={
          <Button
            color="inherit"
            onClick={() =>
              window.location.assign(buildRefreshUrl(window.location.href, String(Date.now())))
            }
          >
            刷新版本
          </Button>
        }
      >
        新版本已就绪，完成当前操作后刷新。
      </Alert>
    </Snackbar>
  );
}
