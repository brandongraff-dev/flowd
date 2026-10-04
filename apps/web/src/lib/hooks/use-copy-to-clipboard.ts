"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface CopyToClipboard {
  /** True for `resetMs` after a successful copy. */
  copied: boolean;
  /** True if the last attempt failed (clipboard blocked, insecure context). */
  failed: boolean;
  /** Copy `text`. Resolves to whether it worked. */
  copy: (text: string) => Promise<boolean>;
}

/** Copy text to the clipboard with a transient "copied" flag (default 1.8 s). Falls back to a hidden textarea. */
export function useCopyToClipboard(resetMs = 1800): CopyToClipboard {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = useCallback(
    async (text: string): Promise<boolean> => {
      let ok = false;
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(text);
          ok = true;
        } else {
          ok = legacyCopy(text);
        }
      } catch {
        ok = legacyCopy(text);
      }
      setCopied(ok);
      setFailed(!ok);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        setCopied(false);
        setFailed(false);
      }, resetMs);
      return ok;
    },
    [resetMs],
  );

  return { copied, failed, copy };
}

function legacyCopy(text: string): boolean {
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  } catch {
    return false;
  }
}
