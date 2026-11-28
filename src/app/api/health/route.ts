// GET /api/health — liveness + database check, pinged every few minutes by .github/workflows/keep-warm.yml so the
// Vercel function stays warm (no multi-second cold start for the first user) and the Supabase database never goes
// idle. Public on purpose; it reveals nothing beyond "ok".
import { prisma } from "@/server/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
