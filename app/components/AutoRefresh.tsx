"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

type Props = {
  /** Interval in milliseconds. Defaults to 5000. */
  intervalMs?: number;
};

/**
 * Invisible component that calls router.refresh() on a fixed interval,
 * keeping the dashboard in sync with agent progress without a full page reload.
 */
export function AutoRefresh({ intervalMs = 5000 }: Props) {
  const router = useRouter();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      router.refresh();
    }, intervalMs);

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
      }
    };
  }, [router, intervalMs]);

  return null;
}
