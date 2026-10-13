import { adminFetchText } from "../../lib/api";

/**
 * Admin console v2 §6: the platform money panel as a CSV download (`/cash/money.csv?days=7|30`). The browser
 * can't hold the admin token, so the console fetches it server-side and passes the file through.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const days = new URL(request.url).searchParams.get("days") === "30" ? "30" : "7";
  const res = await adminFetchText(`/admin/cash/money/csv?days=${days}`);
  if (!("text" in res)) {
    return new Response(`Couldn't get the money CSV (${res.reason}).\n`, { status: 502, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  return new Response(res.text, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="lynia-money-${days}d.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
