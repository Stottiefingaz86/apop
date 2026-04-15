"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookPlus, LayoutGrid, Map, Plus } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { NewFeatureDialog } from "@/components/new-feature-dialog";

const mainNav = [
  { href: "/pipeline", label: "Pipeline", icon: LayoutGrid },
  { href: "/roadmap", label: "Roadmap", icon: Map },
] as const;

function navActive(pathname: string, href: string) {
  if (href === "/pipeline") {
    return pathname === "/pipeline" || pathname.startsWith("/features/");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function knowledgeNavActive(pathname: string) {
  return pathname === "/knowledge" || pathname.startsWith("/knowledge/");
}

export function ApopSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon" variant="sidebar" className="border-r border-sidebar-border">
      <SidebarHeader className="gap-2 border-b border-sidebar-border/70 p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              asChild
              tooltip="APOP home"
              className="h-auto min-h-11 !overflow-visible py-2 group-data-[collapsible=icon]:!size-10 group-data-[collapsible=icon]:!min-h-10 group-data-[collapsible=icon]:!p-1.5"
            >
              <Link
                href="/pipeline"
                className="flex w-full items-center justify-start gap-2 group-data-[collapsible=icon]:justify-center"
              >
                <img
                  src="/logo.svg"
                  alt="APOP"
                  width={79}
                  height={34}
                  className="h-7 w-auto max-w-[min(100%,7.5rem)] shrink-0 object-contain object-left dark:invert group-data-[collapsible=icon]:h-7 group-data-[collapsible=icon]:max-w-8"
                />
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNav.map(({ href, label, icon: Icon }) => (
                <SidebarMenuItem key={href}>
                  <SidebarMenuButton asChild isActive={navActive(pathname, href)} tooltip={label}>
                    <Link href={href}>
                      <Icon className="size-4" />
                      <span>{label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={knowledgeNavActive(pathname)}
                  tooltip="Add knowledge"
                >
                  <Link href="/knowledge#add-knowledge">
                    <BookPlus className="size-4" />
                    <span>Add knowledge</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <NewFeatureDialog
                  trigger={
                    <SidebarMenuButton tooltip="New feature">
                      <Plus className="size-4" />
                      <span>New feature</span>
                    </SidebarMenuButton>
                  }
                />
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border/70 p-2 pb-4">
        <p className="px-2 text-[11px] leading-snug text-sidebar-foreground/80 group-data-[collapsible=icon]:hidden">
          Ideas → agents → shipped artifacts.
        </p>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
