import { LayoutDashboard, CreditCard, Activity, LogOut, SlidersHorizontal, Brain } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/contexts/AuthContext";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";

const navItems = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Preferences", url: "/preferences", icon: SlidersHorizontal },
  { title: "Billing", url: "/billing", icon: CreditCard },
  { title: "Observability", url: "/observability", icon: Activity },
  { title: "Mind Memory", url: "/mind", icon: Brain },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { signOut } = useAuth();

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <div className="p-4 border-b border-sidebar-border/80">
          {!collapsed && (
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="pulse-dot bg-emerald-500">
                  <span className="pulse-dot bg-emerald-500/40 absolute inset-0 animate-ping" />
                </span>
                <h1 className="text-lg font-bold font-display text-sidebar-foreground tracking-tight">CreatorMind</h1>
              </div>
              <p className="text-xs text-slate-500">Multi-agent content autopilot</p>
            </div>
          )}
          {collapsed && (
            <span className="text-lg font-bold text-sidebar-foreground">C</span>
          )}
        </div>
        <SidebarGroup>
          <SidebarGroupLabel className="text-slate-500">Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      className="hover:bg-sidebar-accent/80 rounded-xl text-sidebar-foreground"
                      activeClassName="bg-blue-50 text-blue-700 font-semibold rounded-xl"
                    >
                      <item.icon className="mr-2 h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {!collapsed && (
          <div className="mx-3 mb-3 rounded-xl border border-slate-200 bg-white/90 p-3">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Flow</p>
            <p className="text-xs text-slate-700 mt-1">Onboard → Generate → Review → Learn</p>
          </div>
        )}
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={signOut} className="hover:bg-sidebar-accent/80 rounded-xl text-sidebar-foreground">
              <LogOut className="mr-2 h-4 w-4" />
              {!collapsed && <span>Sign Out</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
