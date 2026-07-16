import "server-only";

type GasPayload = Record<string, unknown>;

export function getAnnouncementDriveConfig() {
  const url = process.env.GAS_ORDER_FILES_URL?.trim();
  const secret = process.env.GAS_ORDER_FILES_SECRET?.trim();

  return url && secret ? { url, secret } : null;
}

export async function callAnnouncementDriveGas(
  url: string,
  payload: GasPayload
): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
    redirect: "follow",
  });

  const text = await response.text();
  let result: Record<string, unknown>;

  try {
    result = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error("GAS อัปโหลดไฟล์ตอบกลับไม่ถูกต้อง");
  }

  if (!response.ok || result.ok !== true) {
    throw new Error(
      typeof result.message === "string"
        ? result.message
        : "อัปโหลดไฟล์คำสั่งไม่สำเร็จ"
    );
  }

  return result;
}
