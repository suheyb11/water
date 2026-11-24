// GET /api/pdf/invoice/:id · /api/pdf/receipt/:id · /api/pdf/statement/:customerId?from&to · /api/pdf/daily?from&to
import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { loadActor, SESSION_COOKIE } from "@/server/auth/session";
import { dailyPdf, invoicePdf, receiptPdf, statementPdf } from "@/server/pdf/build";
import { isIsoDate, todayIso } from "@/lib/dates";
import type { PermissionCode } from "@/lib/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NEED: Record<string, PermissionCode> = { invoice: "invoices.view", receipt: "payments.view", statement: "ledger.view", daily: "reports.view" };

export async function GET(req: NextRequest, ctx: { params: Promise<{ kind: string; id?: string[] }> }) {
  const { kind, id } = await ctx.params;
  const actor = await loadActor((await cookies()).get(SESSION_COOKIE)?.value);
  if (!actor) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const need = NEED[kind];
  if (!need) return NextResponse.json({ error: "Unknown document" }, { status: 404 });
  if (!actor.permissions.has(need)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const num = id?.[0] ? Number(id[0]) : NaN;
  const sp = req.nextUrl.searchParams;
  const from = isIsoDate(sp.get("from")) ? sp.get("from")! : todayIso();
  const to = isIsoDate(sp.get("to")) ? sp.get("to")! : from;
  let out: { buffer: Buffer; filename: string } | null = null;
  if (kind === "invoice" && Number.isInteger(num)) out = await invoicePdf(num);
  if (kind === "receipt" && Number.isInteger(num)) out = await receiptPdf(num);
  if (kind === "statement" && Number.isInteger(num)) out = await statementPdf(num, from <= to ? from : to, from <= to ? to : from);
  if (kind === "daily") out = await dailyPdf(from <= to ? from : to, from <= to ? to : from);
  if (!out) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const download = sp.get("download") === "1";
  return new NextResponse(new Uint8Array(out.buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${out.filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
