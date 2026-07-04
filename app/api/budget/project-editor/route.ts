import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type GasResult = {
  ok?: boolean;
  projects?: unknown[];
  project?: unknown;
  diagnostics?: unknown;
  message?: string;
};

function getConfiguration() {
  return {
    url: process.env.BUDGET_GAS_API_URL?.trim() || "",
    secret: process.env.BUDGET_GAS_API_SECRET?.trim() || "",
  };
}

function buildGasUrl(baseUrl: string, secret: string) {
  const url = new URL(baseUrl);

  if (secret) {
    url.searchParams.set("secret", secret);
  }

  return url.toString();
}

async function callGas(
  method: "GET" | "POST",
  body?: unknown
): Promise<GasResult> {
  const { url, secret } = getConfiguration();
  const requestUrl = buildGasUrl(url, method === "GET" ? secret : "");

  const postBody =
    method === "POST"
      ? {
          ...((body && typeof body === "object") ? body : {}),
          secret,
        }
      : undefined;

  const response = await fetch(requestUrl, {
    method,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
    },
    body: method === "POST" ? JSON.stringify(postBody) : undefined,
    redirect: "follow",
  });

  const text = await response.text();
  let result: GasResult = {};

  try {
    result = text ? (JSON.parse(text) as GasResult) : {};
  } catch {
    throw new Error(`GAS ตอบกลับไม่ใช่ JSON (HTTP ${response.status})`);
  }

  if (!response.ok || result.ok === false) {
    throw new Error(
      result.message || `GAS request failed (HTTP ${response.status})`
    );
  }

  return result;
}

export async function GET() {
  const { url } = getConfiguration();

  if (!url) {
    return NextResponse.json({
      ok: true,
      configured: false,
      projects: [],
      message: "ยังไม่ได้ตั้งค่า BUDGET_GAS_API_URL",
    });
  }

  try {
    const result = await callGas("GET");

    return NextResponse.json({
      ok: true,
      configured: true,
      projects: Array.isArray(result.projects) ? result.projects : [],
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
            : "ไม่สามารถโหลดข้อมูลจาก GAS ได้",
      },
      { status: 502 }
    );
  }
}

export async function POST(request: Request) {
  const { url } = getConfiguration();

  if (!url) {
    return NextResponse.json({
      ok: true,
      configured: false,
      message:
        "ยังไม่ได้ตั้งค่า BUDGET_GAS_API_URL จึงใช้ localStorage ต่อ",
    });
  }

  try {
    const body = (await request.json()) as unknown;
    const result = await callGas("POST", {
      action: "saveBudgetProject",
      ...((body && typeof body === "object") ? body : {}),
    });

    return NextResponse.json({
      ok: true,
      configured: true,
      project: result.project,
      diagnostics: result.diagnostics,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        configured: true,
        message:
          error instanceof Error
            ? error.message
            : "ไม่สามารถบันทึกข้อมูลไป GAS ได้",
      },
      { status: 502 }
    );
  }
}
