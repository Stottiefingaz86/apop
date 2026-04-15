"use client";

import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { ApopSidebar } from "@/components/apop-sidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider defaultOpen>
      <ApopSidebar />
      <SidebarInset className="min-w-0">
        <header className="sticky top-0 z-30 flex h-11 shrink-0 items-center border-b border-border/60 bg-background/95 px-2 backdrop-blur-md supports-[backdrop-filter]:bg-background/85 md:h-12 md:px-3">
          <SidebarTrigger className="shrink-0" />
        </header>
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-5 py-6 md:px-8 md:py-8 lg:px-10">
            <div className="mx-auto max-w-[min(100%,1400px)]">{children}</div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
