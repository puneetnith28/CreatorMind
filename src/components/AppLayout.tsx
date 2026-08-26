import { ReactNode } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full relative">
        <div className="hero-orb h-72 w-72 bg-blue-300/30 left-[-6rem] top-[-4rem]" />
        <div className="hero-orb h-72 w-72 bg-purple-300/25 right-[-7rem] top-[5rem]" />
        <AppSidebar />
        <div className="flex-1 min-w-0 flex flex-col">
          <header className="sticky top-0 z-30 px-3 md:px-5 pt-3">
            <div className="glass-card h-14 flex items-center px-3 md:px-4">
              <SidebarTrigger className="mr-3 text-slate-700 hover:text-slate-900" />
              <span className="text-xs md:text-sm text-slate-500">Agent pipeline workspace</span>
              <span className="ml-auto inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700">
                <span className="pulse-dot bg-emerald-500" />
                agents online
              </span>
            </div>
          </header>
          <main className="flex-1 p-3 md:p-5 lg:p-6">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
