import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type GasResult = {
  ok?: boolean;
  project?: unknown;
  projects?: unknown[];
  message?: string;
};

async function callBudgetGas(
  gasUrl: string,
  action: string,
  payload: Record<string, unknown>
) {
  const response = await fetch(gasUrl, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8",
    },
    body: JSON.stringify({ action, payload }),
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`Budget GAS request failed: ${response.status}`);
  }

  return (await response.json()) as GasResult;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const gasUrl = process.env.BUDGET_GAS_WEB_APP_URL?.trim();

  if (!gasUrl) {
    return NextResponse.json(
      {
        ok: false,
        configured: false,
        message: "BUDGET_GAS_WEB_APP_URL is not configured",
      },
      { status: 503 }
    );
  }

  const { id } = await context.params;
  const projectId = decodeURIComponent(id || "").trim();

  if (!projectId) {
    return NextResponse.json(
      {
        ok: false,
        configured: true,
        message: "ไม่พบรหัสโครงการ",
      },
      { status: 400 }
    );
  }

  try {
    const directResult = await callBudgetGas(gasUrl, "getProject", {
      id: projectId,
    });

    if (directResult.ok && directResult.project) {
      return NextResponse.json({
        ok: true,
        configured: true,
        project: directResult.project,
      });
    }

    const listResult = await callBudgetGas(gasUrl, "listProjects", {});

    if (!listResult.ok || !Array.isArray(listResult.projects)) {
      return NextResponse.json(
        {
          ok: false,
          configured: true,
          message:
            directResult.message ||
            listResult.message ||
            "ไม่สามารถโหลดข้อมูลโครงการได้",
        },
        { status: 502 }
      );
    }

    const project = listResult.projects.find((item) => {
      if (!item || typeof item !== "object") return false;
      const row = item as Record<string, unknown>;
      return String(row.ID ?? "").trim() === projectId;
    });

    if (!project) {
      return NextResponse.json(
        {
          ok: false,
          configured: true,
          message: "ไม่พบโครงการ",
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      configured: true,
      project,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        configured: true,
        message:
          error instanceof Error
            ? error.message
            : "ไม่สามารถโหลดรายละเอียดโครงการได้",
      },
      { status: 502 }
    );
  }
}
