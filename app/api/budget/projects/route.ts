import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const gasUrl = process.env.BUDGET_GAS_WEB_APP_URL?.trim();

  if (!gasUrl) {
    return NextResponse.json(
      {
        ok: false,
        configured: false,
        projects: [],
        message: "BUDGET_GAS_WEB_APP_URL is not configured",
      },
      { status: 503 }
    );
  }

  try {
    const response = await fetch(gasUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "listProjects", payload: {} }),
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      return NextResponse.json(
        {
          ok: false,
          configured: true,
          projects: [],
          message: `Budget GAS request failed: ${response.status}`,
        },
        { status: 502 }
      );
    }

    const result = (await response.json()) as {
      ok?: boolean;
      projects?: unknown[];
      message?: string;
    };

    if (!result.ok || !Array.isArray(result.projects)) {
      return NextResponse.json(
        {
          ok: false,
          configured: true,
          projects: [],
          message: result.message || "Budget GAS returned invalid data",
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      configured: true,
      projects: result.projects,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        configured: true,
        projects: [],
        message:
          error instanceof Error
            ? error.message
            : "Unable to load budget projects",
      },
      { status: 502 }
    );
  }
}
