"use client";

import { useMemo, type Ref, type RefCallback } from "react";

/** Combine several refs (object or callback) into one callback ref. `undefined` and `null` entries are skipped. */
export function mergeRefs<T>(...refs: Array<Ref<T> | undefined>): RefCallback<T> {
  return (node) => {
    for (const ref of refs) {
      if (typeof ref === "function") ref(node);
      else if (ref) (ref as { current: T | null }).current = node;
    }
  };
}

/** Memoised `mergeRefs` for exactly two refs (the common case: an internal ref plus the forwarded `ref` prop). */
export function useMergedRef<T>(a: Ref<T> | undefined, b: Ref<T> | undefined): RefCallback<T> {
  return useMemo(() => mergeRefs(a, b), [a, b]);
}
