import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const gasUrl = process.env.BUDGET_GAS_WEB_APP_URL?.trim();
  const gasSecret = process.env.BUDGET_GAS_API_SECRET?.trim();

  if (!gasUrl) {
    return NextResponse.json(
      {
        ok: false,
        configured: false,
        projects: [],
        message: "BUDGET_GAS_WEB_APP_URL is not configured",
      },
      { status: 503 },
    );
  }

  if (!gasSecret) {
    return NextResponse.json(
      {
        ok: false,
        configured: false,
        projects: [],
        message: "BUDGET_GAS_API_SECRET is not configured",
      },
      { status: 503 },
    );
  }

  try {
    const requestUrl = new URL(gasUrl);
    requestUrl.searchParams.set("secret", gasSecret);

    const response = await fetch(requestUrl.toString(), {
      method: "GET",
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });

    const responseText = await response.text();

    let result: {
      ok?: boolean;
      projects?: unknown[];
      message?: string;
    } = {};

    try {
      result = responseText ? JSON.parse(responseText) : {};
    } catch {
      return NextResponse.json(
        {
          ok: false,
          configured: true,
          projects: [],
          message: "Budget GAS ตอบกลับเป็นข้อมูลที่ไม่ใช่ JSON",
        },
        { status: 502 },
      );
    }

    if (!response.ok || result.ok === false) {
      return NextResponse.json(
        {
          ok: false,
          configured: true,
          projects: [],
          message:
            result.message ||
            `Budget GAS request failed: ${response.status}`,
        },
        { status: 502 },
      );
    }

    if (!Array.isArray(result.projects)) {
      return NextResponse.json(
        {
          ok: false,
          configured: true,
          projects: [],
          message: "Budget GAS returned invalid project data",
        },
        { status: 502 },
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
      { status: 502 },
    );
  }
}
