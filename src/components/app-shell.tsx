"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { ChevronDown, ChevronRight, KeyRound, LogOut, Menu, Monitor, Moon, PanelLeftClose, PanelLeftOpen, Search, ShoppingCart, Sun, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/brand";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/overlays";
import { findTitle, visibleNav } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { signOutAction } from "@/app/actions/auth";
import { ReminderBell } from "@/components/reminder-center";

export interface Me { userId: number; username: string; fullName: string; roles: string[]; permissions: string[]; companyName: string; currencySymbol: string }

const MeContext = React.createContext<Me | null>(null);
export function useMe() {
  const me = React.useContext(MeContext);
  if (!me) throw new Error("useMe outside AppShell");
  return { ...me, can: (p: string) => me.permissions.includes(p) };
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(s => s[0]?.toUpperCase()).join("") || "?";
}

function Sidebar({ me, collapsed, onNavigate }: { me: Me; collapsed: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const groups = visibleNav(me.permissions);
  const best = groups.flatMap(g => g.items.map(i => i.href)).filter(h => h !== "/" && (pathname === h || pathname.startsWith(h + "/"))).sort((a, b) => b.length - a.length)[0];
  const active = (href: string) => (href === "/" ? pathname === "/" : href === best);
  const [open, setOpen] = React.useState<Record<string, boolean>>({});
  React.useEffect(() => { try { setOpen(JSON.parse(localStorage.getItem("wp.navgroups") || "{}")); } catch { /* private mode */ } }, []);
  const toggleGroup = (title: string, value: boolean) => setOpen(o => {
    const n = { ...o, [title]: value };
    try { localStorage.setItem("wp.navgroups", JSON.stringify(n)); } catch { /* ignore */ }
    return n;
  });
  const router = useRouter();
  const [q, setQ] = React.useState("");
  const searchRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    if (collapsed) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); searchRef.current?.focus(); searchRef.current?.select(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [collapsed]);
  const needle = q.trim().toLowerCase();
  const shown = needle
    ? groups.map(g => ({ ...g, items: g.items.filter(i => i.title.toLowerCase().includes(needle) || g.title.toLowerCase().includes(needle)) })).filter(g => g.items.length)
    : groups;
  const go = (href: string) => { setQ(""); onNavigate?.(); router.push(href); };

  return (
    <div className="flex h-full flex-col border-r border-nav-border bg-nav text-nav-foreground">
      <div className={cn("flex items-center gap-3 px-4 pb-3 pt-4", collapsed && "justify-center px-0")}>
        <BrandMark className="size-9" />
        {!collapsed && <div className="min-w-0 leading-tight"><p className="truncate text-[15px] font-semibold tracking-tight text-nav-strong">{me.companyName}</p><p className="text-[11px] text-nav-muted">Water Portal</p></div>}
      </div>
      {!collapsed && (
        <div className="px-3 pb-2">
          <label className="flex items-center gap-2 rounded-lg bg-nav-tile px-2.5 py-1.5 text-nav-muted ring-brand-deep/30 focus-within:bg-nav focus-within:ring-2">
            <Search className="size-4 shrink-0" />
            <input ref={searchRef} value={q} onChange={e => setQ(e.target.value)} placeholder="Search pages…" aria-label="Search pages"
              onKeyDown={e => { if (e.key === "Enter" && shown[0]?.items[0]) go(shown[0].items[0].href); if (e.key === "Escape") setQ(""); }}
              className="min-w-0 flex-1 bg-transparent text-[13px] text-nav-strong outline-none placeholder:text-nav-muted" />
            {q
              ? <button type="button" onClick={() => setQ("")} aria-label="Clear search" className="rounded p-0.5 hover:text-nav-strong"><X className="size-3.5" /></button>
              : <kbd className="rounded border border-nav-border bg-nav px-1 font-sans text-[10px]">Ctrl K</kbd>}
          </label>
        </div>
      )}
      <nav className={cn("no-scrollbar flex-1 space-y-0.5 overflow-y-auto pb-3 pt-1", collapsed ? "px-2" : "px-3")} aria-label="Main">
        {needle && !shown.length && <p className="px-2 py-6 text-center text-xs text-nav-muted">No page matches “{q.trim()}”.</p>}
        {shown.map(g => {
          const hasActive = g.items.some(i => active(i.href));
          const isOpen = collapsed || !!needle || (open[g.title] ?? true);
          const single = g.items.length === 1 && g.title === "Overview";
          if (single && !collapsed) {
            const i = g.items[0]; const on = active(i.href);
            return (
              <Link key={g.title} href={i.href} onClick={() => onNavigate?.()} aria-current={on ? "page" : undefined}
                className={cn("mb-1 flex items-center gap-3 rounded-lg px-1.5 py-1.5 text-sm font-medium transition-colors", on ? "bg-nav-active text-nav-strong" : "hover:bg-nav-hover hover:text-nav-strong")}>
                <span className={cn("grid size-7 place-items-center rounded-lg", on ? "bg-brand-deep text-brand" : "bg-nav-tile")}><i.icon className="size-4" /></span>{i.title}
              </Link>
            );
          }
          return (
            <div key={g.title}>
              {!collapsed && (
                <button type="button" onClick={() => toggleGroup(g.title, !isOpen)} aria-expanded={isOpen}
                  className={cn("group flex w-full items-center gap-3 rounded-lg px-1.5 py-1.5 text-sm font-medium transition-colors hover:bg-nav-hover",
                    hasActive ? "text-nav-strong" : "text-nav-foreground hover:text-nav-strong")}>
                  <span className={cn("grid size-7 shrink-0 place-items-center rounded-lg transition-colors",
                    hasActive ? "bg-brand-deep text-brand" : "bg-nav-tile text-nav-foreground group-hover:text-nav-strong")}>
                    <g.icon className="size-4" />
                  </span>
                  <span className="flex-1 text-left">{g.title}</span>
                  <ChevronDown className={cn("size-3.5 text-nav-muted transition-transform", !isOpen && "-rotate-90")} />
                </button>
              )}
              {isOpen && (
                <ul className={cn("space-y-0.5", !collapsed && "mb-1.5 ml-[1.2rem] mt-0.5 border-l border-nav-border pl-2.5")}>
                  {g.items.map(i => {
                    const on = active(i.href);
                    return (
                      <li key={i.href}>
                        <Link href={i.href} onClick={() => { setQ(""); onNavigate?.(); }} title={collapsed ? i.title : undefined} aria-current={on ? "page" : undefined}
                          className={cn("flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13.5px] transition-colors",
                            collapsed && "justify-center px-0 py-2.5",
                            on ? "bg-nav-active font-semibold text-nav-strong" : "text-nav-foreground hover:bg-nav-hover hover:text-nav-strong")}>
                          <i.icon className={cn("size-4 shrink-0", on && "text-nav-active-icon")} />{!collapsed && i.title}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </nav>
      <div className={cn("m-3 flex items-center gap-2.5 rounded-xl bg-nav-tile p-2.5", collapsed && "m-2 justify-center p-1.5")} title={collapsed ? me.fullName : undefined}>
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-deep text-[11px] font-semibold text-white">{initials(me.fullName)}</span>
        {!collapsed && <span className="min-w-0 leading-tight">
          <span className="block truncate text-[12.5px] font-semibold text-nav-strong">{me.fullName}</span>
          <span className="block truncate text-[11px] text-nav-muted">{me.roles.join(", ") || me.username}</span>
        </span>}
      </div>
    </div>
  );
}

function ThemeMenu() {
  const { setTheme } = useTheme();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Theme"><Sun className="dark:hidden" /><Moon className="hidden dark:block" /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-36">
        <DropdownMenuItem onSelect={() => setTheme("light")}><Sun />Light</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setTheme("dark")}><Moon />Dark</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setTheme("system")}><Monitor />System</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppShell({ me, children }: { me: Me; children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const crumb = findTitle(pathname);
  React.useEffect(() => { try { setCollapsed(localStorage.getItem("wp.sidebar") === "1"); } catch { /* private mode */ } }, []);
  const toggle = () => setCollapsed(c => { try { localStorage.setItem("wp.sidebar", c ? "0" : "1"); } catch { /* ignore */ } return !c; });
  const canSell = me.permissions.includes("sales.create");

  return (
    <MeContext.Provider value={me}>
      <div className="flex min-h-screen">
        <aside className={cn("sticky top-0 hidden h-screen shrink-0 transition-[width] md:block print:hidden", collapsed ? "w-16" : "w-64")}>
          <Sidebar me={me} collapsed={collapsed} />
        </aside>
        {mobileOpen && (
          <div className="fixed inset-0 z-40 md:hidden print:hidden">
            <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
            <div className="absolute inset-y-0 left-0 w-72 shadow-xl"><Sidebar me={me} collapsed={false} onNavigate={() => setMobileOpen(false)} /></div>
          </div>
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/85 px-3 backdrop-blur md:px-5 print:hidden">
            <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMobileOpen(true)} aria-label="Menu"><Menu /></Button>
            <Button variant="ghost" size="icon" className="hidden md:inline-flex" onClick={toggle} aria-label="Collapse sidebar">
              {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
            </Button>
            <nav className="flex min-w-0 items-center gap-1 text-sm text-muted-foreground" aria-label="Breadcrumb">
              {crumb.group && crumb.group !== "Overview" && <><span className="truncate">{crumb.group}</span><ChevronRight className="size-3.5" /></>}
              <span className="truncate font-medium text-foreground">{crumb.title ?? "Portal"}</span>
            </nav>
            <div className="ml-auto flex items-center gap-1">
              {canSell && pathname !== "/sales/new" && (
                <Button size="sm" asChild className="hidden sm:inline-flex"><Link href="/sales/new"><ShoppingCart />New sale</Link></Button>
              )}
              {me.permissions.includes("reminders.view") && <ReminderBell symbol={me.currencySymbol} canManage={me.permissions.includes("reminders.manage")} />}
              <ThemeMenu />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-2 rounded-full p-0.5 pr-2 hover:bg-accent" aria-label="Account">
                    <span className="grid size-8 place-items-center rounded-full bg-primary/15 text-xs font-semibold text-primary">{initials(me.fullName)}</span>
                    <span className="hidden text-sm font-medium sm:inline">{me.fullName}</span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-60">
                  <DropdownMenuLabel>
                    <p className="text-sm font-medium text-foreground">{me.fullName}</p>
                    <p className="font-normal">{me.username} · {me.roles.join(", ") || "no role"}</p>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => router.push("/change-password")}><KeyRound />Change password</DropdownMenuItem>
                  <DropdownMenuItem destructive onSelect={async () => { await signOutAction(); router.replace("/login"); }}><LogOut />Sign out</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>
          <main className="w-full flex-1 px-4 py-6 md:px-6 print:p-0">{children}</main>
        </div>
      </div>
    </MeContext.Provider>
  );
}
