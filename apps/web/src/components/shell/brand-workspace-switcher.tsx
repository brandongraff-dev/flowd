"use client";

import { useRouter } from "next/navigation";
import { ChevronDown, Plus, Smartphone } from "lucide-react";
import { useMe } from "@/lib/data";
import { actions } from "@/lib/store";
import { AppIcon } from "@/components/brand/app-icon";
import { ArtAvatar } from "@/components/brand/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { notify } from "@/components/ui/toast";

/**
 * The workspace and app switcher: the first crumb of the top bar. It names the app the dashboard is looking at ("Lumi") and, in its menu, the
 * workspace around it. An agency sees its client brands as workspaces; every brand sees its apps. Switching is a real store action, so every
 * page re-reads for the new app.
 */
export function BrandWorkspaceSwitcher() {
  const me = useMe();
  const router = useRouter();
  const { brand, app, apps, workspaces } = me;

  if (!brand) {
    return (
      <div role="status" aria-label="Loading workspace" className="flex items-center gap-2">
        <Skeleton shape="circle" className="size-6 rounded-[28%]" />
        <Skeleton shape="text" className="h-4 w-16" />
      </div>
    );
  }

  const switchTo = async (input: { brand_id?: string; app_id?: string }, name: string): Promise<void> => {
    const result = await actions.switchWorkspace(input);
    if (result.ok) notify.message(`Now looking at ${name}`);
    else notify.error(result.error.message, { description: result.error.hint });
  };

  const name = app?.name ?? brand.name;
  const icon = app ? <AppIcon art={app.icon} name={app.name} size={24} decorative /> : <ArtAvatar art={brand.logo} name={brand.name} shape="square" size={24} decorative />;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Switch app or workspace. Now looking at ${name} in ${brand.name}.`}
          className="group flex h-9 max-w-[11rem] shrink-0 items-center gap-1.5 rounded-pill py-1 pr-2 pl-1 min-[480px]:gap-2 text-caption font-semibold text-fg transition-colors duration-(--fd-dur-fast) ease-standard hover:bg-surface-hover data-[state=open]:bg-surface-hover pointer-coarse:h-11"
        >
          {icon}
          <span className="hidden truncate min-[480px]:inline">{name}</span>
          <ChevronDown aria-hidden="true" className="size-3.5 shrink-0 text-fg-subtle transition-transform duration-(--fd-dur-fast) ease-standard group-data-[state=open]:rotate-180" strokeWidth={2} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-64">
        {workspaces.length > 1 ? (
          <>
            <DropdownMenuLabel>Workspace</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={brand.id} onValueChange={(id) => void switchTo({ brand_id: id }, workspaces.find((w) => w.id === id)?.name ?? "that workspace")}>
              {workspaces.map((workspace) => (
                <DropdownMenuRadioItem key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
          </>
        ) : null}
        <DropdownMenuLabel>{brand.name}</DropdownMenuLabel>
        {apps.length > 0 ? (
          <DropdownMenuRadioGroup value={app?.id ?? ""} onValueChange={(id) => void switchTo({ app_id: id }, apps.find((a) => a.id === id)?.name ?? "that app")}>
            {apps.map((a) => (
              <DropdownMenuRadioItem key={a.id} value={a.id}>
                {a.name}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        ) : (
          <DropdownMenuItem disabled>No apps yet</DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem icon={<Plus />} onSelect={() => router.push("/brand/onboarding")}>
          Connect another app
        </DropdownMenuItem>
        <DropdownMenuItem icon={<Smartphone />} onSelect={() => router.push("/brand/apps")}>
          Manage apps
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
