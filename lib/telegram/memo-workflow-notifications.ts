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

function statusLabel(status: string) {
  if (status === "approved") return "เธญเธเธธเธกเธฑเธ•เธด";
  if (status === "acknowledged") return "เธฃเธฑเธเธ—เธฃเธฒเธ";
  if (status === "rejected") return "เนเธกเนเธญเธเธธเธกเธฑเธ•เธด";
  if (status === "revision") return "เธชเนเธเธเธฅเธฑเธเนเธเนเนเธ";
  return status;
}

export async function notifyMemoSubmittedTelegram(input: {
  requestId: string;
  applicantProfileId: string;
  applicantName: string;
  memoNumber?: string | null;
  subject: string;
  reason: string;
}) {
  const directorProfileIds = await loadDirectorProfileIds();

  if (directorProfileIds.length === 0) {
    return { requested: 0, sent: 0, skipped: 0, failed: 0 };
  }

  const text = [
    "๐“ <b>เธกเธตเธเธฑเธเธ—เธถเธเธเนเธญเธเธงเธฒเธกเนเธซเธกเนเธฃเธญเธเธดเธเธฒเธฃเธ“เธฒ</b>",
    "",
    `เธเธนเนเธขเธทเนเธ: ${escapeHtml(input.applicantName)}`,
    `เน€เธฅเธเธ—เธตเน: ${escapeHtml(input.memoNumber || "-")}`,
    `เน€เธฃเธทเนเธญเธ: ${escapeHtml(input.subject)}`,
    `เน€เธซเธ•เธธเธเธฅ: ${escapeHtml(input.reason)}`,
    "",
    `เน€เธเธดเธ”เธฃเธฒเธขเธเธฒเธฃ: ${escapeHtml(`${appUrl()}/admin/memo`)}`,
  ].join("\n");

  return notifyTelegramProfiles({
    event: "memo.submitted",
    recipientProfileIds: directorProfileIds,
    actorProfileId: input.applicantProfileId,
    entityType: "memo_request",
    entityId: input.requestId,
    text,
    metadata: {
      memoNumber: input.memoNumber || null,
      subject: input.subject,
    },
  });
}

export async function notifyMemoReviewedTelegram(input: {
  requestId: string;
  applicantProfileId: string;
  reviewerProfileId: string;
  reviewerName: string;
  status: string;
  memoNumber?: string | null;
  subject: string;
  reviewNote?: string | null;
  pdfFileUrl?: string | null;
}) {
  const heading =
    input.status === "approved"
      ? "โ… <b>เธเธฑเธเธ—เธถเธเธเนเธญเธเธงเธฒเธกเธเธญเธเธเธธเธ“เนเธ”เนเธฃเธฑเธเธเธฒเธฃเธญเธเธธเธกเธฑเธ•เธดเนเธฅเนเธง</b>"
      : input.status === "acknowledged"
        ? "๐‘๏ธ <b>เธเธนเนเธเธฃเธดเธซเธฒเธฃเธฃเธฑเธเธ—เธฃเธฒเธเธเธฑเธเธ—เธถเธเธเนเธญเธเธงเธฒเธกเนเธฅเนเธง</b>"
        : input.status === "revision"
          ? "โ๏ธ <b>เธเธฑเธเธ—เธถเธเธเนเธญเธเธงเธฒเธกเธ–เธนเธเธชเนเธเธเธฅเธฑเธเนเธซเนเนเธเนเนเธ</b>"
          : "โ <b>เธเธฑเธเธ—เธถเธเธเนเธญเธเธงเธฒเธกเนเธกเนเนเธ”เนเธฃเธฑเธเธเธฒเธฃเธญเธเธธเธกเธฑเธ•เธด</b>";

  const text = [
    heading,
    "",
    `เน€เธฅเธเธ—เธตเน: ${escapeHtml(input.memoNumber || "-")}`,
    `เน€เธฃเธทเนเธญเธ: ${escapeHtml(input.subject)}`,
    `เธเธฅเธเธฒเธฃเธเธดเธเธฒเธฃเธ“เธฒ: ${escapeHtml(statusLabel(input.status))}`,
    `เธเธนเนเธเธดเธเธฒเธฃเธ“เธฒ: ${escapeHtml(input.reviewerName)}`,
    ...(input.reviewNote
      ? [`เธเธงเธฒเธกเธเธดเธ”เน€เธซเนเธ: ${escapeHtml(input.reviewNote)}`]
      : []),
    ...(input.pdfFileUrl
      ? ["", `เน€เธเธดเธ”เน€เธญเธเธชเธฒเธฃ PDF: ${escapeHtml(input.pdfFileUrl)}`]
      : []),
  ].join("\n");

  return notifyTelegramProfiles({
    event:
      input.status === "approved"
        ? "memo.approved"
        : input.status === "acknowledged"
          ? "memo.acknowledged"
          : input.status === "revision"
            ? "memo.revision"
            : "memo.rejected",
    recipientProfileIds: [input.applicantProfileId],
    actorProfileId: input.reviewerProfileId,
    entityType: "memo_request",
    entityId: input.requestId,
    text,
    metadata: {
      memoNumber: input.memoNumber || null,
      status: input.status,
    },
  });
}
