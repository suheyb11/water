"use client";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const fmtDay = (d: string) => { const [, m, day] = d.split("-"); return `${Number(day)}/${Number(m)}`; };

export function TrendChart({ data, symbol = "$" }: { data: { date: string; sales: number; collections: number }[]; symbol?: string }) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
          <defs>
            <linearGradient id="gSales" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} /><stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} /></linearGradient>
            <linearGradient id="gCol" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--chart-2)" stopOpacity={0.3} /><stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0} /></linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="date" tickFormatter={fmtDay} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} minTickGap={16} />
          <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} width={48} tickFormatter={v => `${symbol}${v}`} />
          <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} labelFormatter={l => String(l)} formatter={(v, n) => [`${symbol}${Number(v).toFixed(2)}`, n === "sales" ? "Sales" : "Collections"]} />
          <Legend formatter={v => (v === "sales" ? "Sales" : "Collections")} wrapperStyle={{ fontSize: 12 }} />
          <Area type="monotone" dataKey="sales" stroke="var(--chart-1)" fill="url(#gSales)" strokeWidth={2} />
          <Area type="monotone" dataKey="collections" stroke="var(--chart-2)" fill="url(#gCol)" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function QuantityChart({ data, unit = "containers" }: { data: { date: string; quantity: number }[]; unit?: string }) {
  return (
    <div className="h-48 w-full">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="date" tickFormatter={fmtDay} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} minTickGap={16} />
          <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} width={36} />
          <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} formatter={v => [`${v} ${unit}`, "Sold"]} />
          <Bar dataKey="quantity" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
