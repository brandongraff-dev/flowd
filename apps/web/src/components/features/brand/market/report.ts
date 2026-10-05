"use client";

import { notify } from "@/components/ui/toast";
import type { ActionResult } from "@/lib/store";

export interface ToastCopy {
  title: string;
  description?: string;
}

type Success<T> = string | ToastCopy | ((data: T) => string | ToastCopy);

/**
 * Awaits a store action and tells the person what happened. A refusal shows the action's own plain-English message with its hint
 * (that is the contract of every action), a success shows one calm line. The result is returned either way, so a caller can still
 * branch on `error.code` (open "Add funds" on `insufficient_funds`). Nothing here throws.
 */
export async function settle<T>(run: Promise<ActionResult<T>>, success?: Success<T>): Promise<ActionResult<T>> {
  const result = await run;
  if (!result.ok) {
    notify.error(result.error.message, result.error.hint ? { description: result.error.hint } : undefined);
    return result;
  }
  if (success !== undefined) {
    const copy = typeof success === "function" ? success(result.data) : success;
    if (typeof copy === "string") notify.success(copy);
    else notify.success(copy.title, copy.description ? { description: copy.description } : undefined);
  }
  return result;
}
