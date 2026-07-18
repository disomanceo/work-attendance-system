import "server-only";

import { createClient } from "@supabase/supabase-js";
import { notifyTelegramProfiles } from "@/lib/telegram/private-notifications";

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !service) {
    throw new Error("Supabase server environment variables are not configured");
  }

  return createClient(url, service, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function appUrl() {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (explicit) return explicit;

  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return production ? `https://${production}` : "http://localhost:3000";
}

function escapeHtml(value: unknown) {
  return String(value ?? "-")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function thaiDate(value: string) {
  const date = new Date(`${value}T00:00:00+07:00`);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

async function loadDirectorProfileIds() {
  const { data, error } = await adminClient()
    .from("profiles")
    .select("id")
    .in("role", ["director", "admin"])
    .eq("account_status", "active");

  if (error) {
    throw new Error(`Cannot load director profiles: ${error.message}`);
  }

  return (data ?? [])
    .map((profile) => String(profile.id || "").trim())
    .filter(Boolean);
}

export async function notifyOrderSubmittedTelegram(input: {
  orderId: string;
  applicantProfileId: string;
  applicantName: string;
  responsibleProfileId: string;
  responsibleName: string;
  orderNumber?: string | null;
  subject: string;
  orderDate: string;
  revisionCount?: number;
}) {
  const directorProfileIds = await loadDirectorProfileIds();

  if (directorProfileIds.length === 0) {
    return { requested: 0, sent: 0, skipped: 0, failed: 0 };
  }

  const heading =
    Number(input.revisionCount || 0) > 0
      ? "🔁 <b>มีคำสั่งแก้ไขส่งกลับมาใหม่</b>"
      : "📜 <b>มีคำสั่งใหม่รอพิจารณา</b>";

  const text = [
    heading,
    "",
    `ผู้ส่ง: ${escapeHtml(input.applicantName)}`,
    `ผู้รับผิดชอบ: ${escapeHtml(input.responsibleName)}`,
    `เลขที่: ${escapeHtml(input.orderNumber || "-")}`,
    `เรื่อง: ${escapeHtml(input.subject)}`,
    `วันที่คำสั่ง: ${escapeHtml(thaiDate(input.orderDate))}`,
    ...(Number(input.revisionCount || 0) > 0
      ? [`แก้ไขครั้งที่: ${escapeHtml(input.revisionCount)}`]
      : []),
    "",
    `เปิดรายการคำสั่ง: ${escapeHtml(`${appUrl()}/orders`)}`,
  ].join("\n");

  return notifyTelegramProfiles({
    event:
      Number(input.revisionCount || 0) > 0
        ? "order.resubmitted"
        : "order.submitted",
    recipientProfileIds: directorProfileIds,
    actorProfileId: input.applicantProfileId,
    entityType: "order_document",
    entityId: input.orderId,
    text,
    metadata: {
      orderNumber: input.orderNumber || null,
      responsibleProfileId: input.responsibleProfileId,
      revisionCount: Number(input.revisionCount || 0),
    },
  });
}

export async function notifyOrderReviewedTelegram(input: {
  orderId: string;
  recipientProfileId: string;
  reviewerProfileId: string;
  reviewerName: string;
  approved: boolean;
  orderNumber?: string | null;
  subject: string;
  orderDate: string;
  revisionCount?: number;
  reviewNote?: string | null;
  pdfFileUrl?: string | null;
}) {
  const heading = input.approved
    ? "✅ <b>คำสั่งได้รับการอนุมัติแล้ว</b>"
    : "✏️ <b>คำสั่งถูกส่งกลับให้แก้ไข</b>";

  const text = [
    heading,
    "",
    `เลขที่: ${escapeHtml(input.orderNumber || "-")}`,
    `เรื่อง: ${escapeHtml(input.subject)}`,
    `วันที่คำสั่ง: ${escapeHtml(thaiDate(input.orderDate))}`,
    `ผู้พิจารณา: ${escapeHtml(input.reviewerName)}`,
    ...(!input.approved
      ? [`แก้ไขครั้งที่: ${escapeHtml(input.revisionCount || 1)}`]
      : []),
    ...(input.reviewNote
      ? [`รายละเอียด: ${escapeHtml(input.reviewNote)}`]
      : []),
    ...(input.pdfFileUrl
      ? ["", `เปิดเอกสาร PDF: ${escapeHtml(input.pdfFileUrl)}`]
      : []),
  ].join("\n");

  return notifyTelegramProfiles({
    event: input.approved ? "order.approved" : "order.revision",
    recipientProfileIds: [input.recipientProfileId],
    actorProfileId: input.reviewerProfileId,
    entityType: "order_document",
    entityId: input.orderId,
    text,
    metadata: {
      orderNumber: input.orderNumber || null,
      approved: input.approved,
      revisionCount: Number(input.revisionCount || 0),
    },
  });
}

export async function notifyOrderAssignedTelegram(input: {
  orderId: string;
  recipientProfileIds: string[];
  actorProfileId: string;
  actorName: string;
  orderNumber?: string | null;
  subject: string;
  orderDate: string;
  pdfFileUrl?: string | null;
}) {
  const text = [
    "📌 <b>มีคำสั่งแจ้งให้รับทราบ</b>",
    "",
    `เลขที่: ${escapeHtml(input.orderNumber || "-")}`,
    `เรื่อง: ${escapeHtml(input.subject)}`,
    `วันที่คำสั่ง: ${escapeHtml(thaiDate(input.orderDate))}`,
    `ผู้แจ้ง: ${escapeHtml(input.actorName)}`,
    ...(input.pdfFileUrl
      ? ["", `เปิดเอกสาร PDF: ${escapeHtml(input.pdfFileUrl)}`]
      : []),
    "",
    `เปิดรายการคำสั่ง: ${escapeHtml(`${appUrl()}/orders`)}`,
  ].join("\n");

  return notifyTelegramProfiles({
    event: "order.assigned",
    recipientProfileIds: input.recipientProfileIds,
    actorProfileId: input.actorProfileId,
    entityType: "order_document",
    entityId: input.orderId,
    text,
    metadata: {
      orderNumber: input.orderNumber || null,
    },
  });
}

export async function notifyOrderAcknowledgedTelegram(input: {
  orderId: string;
  recipientProfileIds: string[];
  actorProfileId: string;
  actorName: string;
  orderNumber?: string | null;
  subject: string;
  orderDate: string;
}) {
  const text = [
    "✅ <b>ครูรับทราบคำสั่งแล้ว</b>",
    "",
    `ผู้รับทราบ: ${escapeHtml(input.actorName)}`,
    `เลขที่: ${escapeHtml(input.orderNumber || "-")}`,
    `เรื่อง: ${escapeHtml(input.subject)}`,
    `วันที่คำสั่ง: ${escapeHtml(thaiDate(input.orderDate))}`,
    "",
    `เปิดรายการคำสั่ง: ${escapeHtml(`${appUrl()}/orders`)}`,
  ].join("\n");

  return notifyTelegramProfiles({
    event: "order.acknowledged",
    recipientProfileIds: input.recipientProfileIds,
    actorProfileId: input.actorProfileId,
    entityType: "order_document",
    entityId: input.orderId,
    text,
    metadata: {
      orderNumber: input.orderNumber || null,
    },
  });
}
