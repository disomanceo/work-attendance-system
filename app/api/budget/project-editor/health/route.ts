import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type GasResponse = {
  ok?: boolean;
  projects?: unknown[];
  message?: string;
};

function getConfiguration() {
  return {
    url: process.env.BUDGET_GAS_API_URL?.trim() || "",
    secret: process.env.BUDGET_GAS_API_SECRET?.trim() || "",
  };
}

export async function GET() {
  const { url, secret } = getConfiguration();

  if (!url) {
    return NextResponse.json({
      ok: false,
      configured: false,
      gasReachable: false,
      message: "ยังไม่ได้ตั้งค่า BUDGET_GAS_API_URL",
    });
  }

  try {
    const requestUrl = new URL(url);

    if (secret) {
      requestUrl.searchParams.set("secret", secret);
    }

    const response = await fetch(requestUrl.toString(), {
      method: "GET",
      cache: "no-store",
      redirect: "follow",
    });

    const responseText = await response.text();
    let result: GasResponse = {};

    try {
      result = responseText
        ? (JSON.parse(responseText) as GasResponse)
        : {};
    } catch {
      return NextResponse.json(
        {
          ok: false,
          configured: true,
          gasReachable: true,
          message: "GAS ตอบกลับ แต่ข้อมูลไม่ใช่ JSON",
          httpStatus: response.status,
        },
        { status: 502 }
      );
    }

    if (!response.ok || result.ok === false) {
      return NextResponse.json(
        {
          ok: false,
          configured: true,
          gasReachable: true,
          message:
            result.message ||
            `GAS ตอบกลับ HTTP ${response.status}`,
          httpStatus: response.status,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      configured: true,
      gasReachable: true,
      projectCount: Array.isArray(result.projects)
        ? result.projects.length
        : 0,
      message: "เชื่อมต่อ Budget GAS API สำเร็จ",
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        configured: true,
        gasReachable: false,
        message:
          error instanceof Error
            ? error.message
            : "ไม่สามารถเชื่อมต่อ GAS ได้",
      },
      { status: 502 }
    );
  }
}
