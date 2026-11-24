import {
  LayoutDashboard, Users, MapPin, Tags, ShoppingCart, FileText, Wallet, BookOpen, ScrollText, CalendarDays, Receipt,
  Boxes, Truck, BarChart3, UserCog, ShieldCheck, Settings, Package, Droplets, Landmark, Store, BellRing,
} from "lucide-react";
import type { PermissionCode } from "./constants";

export interface NavItem { title: string; href: string; icon: React.ComponentType<{ className?: string }>; perm: PermissionCode | PermissionCode[] }
export interface NavGroup { title: string; icon: React.ComponentType<{ className?: string }>; items: NavItem[] }

export const NAV: NavGroup[] = [
  { title: "Overview", icon: LayoutDashboard, items: [{ title: "Dashboard", href: "/", icon: LayoutDashboard, perm: "dashboard.view" }] },
  {
    title: "Sales", icon: Store, items: [
      { title: "New sale", href: "/sales/new", icon: ShoppingCart, perm: "sales.create" },
      { title: "Sales", href: "/sales", icon: Droplets, perm: ["invoices.view", "sales.create"] },
      { title: "Invoices", href: "/invoices", icon: FileText, perm: "invoices.view" },
      { title: "Payments", href: "/payments", icon: Wallet, perm: "payments.view" },
      { title: "Payment reminders", href: "/reminders", icon: BellRing, perm: "reminders.view" },
      { title: "Deliveries", href: "/deliveries", icon: Truck, perm: ["deliveries.view", "deliveries.update", "deliveries.manage"] },
    ],
  },
  {
    title: "Customers", icon: Users, items: [
      { title: "Customers", href: "/customers", icon: Users, perm: "customers.view" },
      { title: "Locations", href: "/locations", icon: MapPin, perm: ["locations.manage", "customers.view"] },
      { title: "Pricing", href: "/pricing", icon: Tags, perm: "pricing.view" },
    ],
  },
  {
    title: "Accounts", icon: Landmark, items: [
      { title: "Customer ledger", href: "/ledger", icon: BookOpen, perm: "ledger.view" },
      { title: "Customer statements", href: "/statements", icon: ScrollText, perm: "ledger.view" },
      { title: "Daily statements", href: "/daily", icon: CalendarDays, perm: "reports.view" },
      { title: "Financial reports", href: "/reports", icon: BarChart3, perm: "reports.view" },
      { title: "Expenses", href: "/expenses", icon: Receipt, perm: "expenses.view" },
    ],
  },
  {
    title: "Stock", icon: Boxes, items: [
      { title: "Products", href: "/products", icon: Package, perm: "products.view" },
      { title: "Inventory", href: "/inventory", icon: Boxes, perm: "inventory.view" },
    ],
  },
  {
    title: "Administration", icon: Settings, items: [
      { title: "Users & roles", href: "/users", icon: UserCog, perm: "users.manage" },
      { title: "Audit log", href: "/audit", icon: ShieldCheck, perm: "audit.view" },
      { title: "Settings", href: "/settings", icon: Settings, perm: "settings.manage" },
    ],
  },
];

export function visibleNav(perms: string[]): NavGroup[] {
  const has = (p: NavItem["perm"]) => (Array.isArray(p) ? p.some(x => perms.includes(x)) : perms.includes(p));
  return NAV.map(g => ({ ...g, items: g.items.filter(i => has(i.perm)) })).filter(g => g.items.length);
}

export function findTitle(pathname: string): { group?: string; title?: string } {
  let best: { group: string; title: string; len: number } | null = null;
  for (const g of NAV) for (const i of g.items) {
    const match = i.href === "/" ? pathname === "/" : pathname === i.href || pathname.startsWith(i.href + "/");
    if (match && (!best || i.href.length > best.len)) best = { group: g.title, title: i.title, len: i.href.length };
  }
  return best ? { group: best.group, title: best.title } : {};
}
