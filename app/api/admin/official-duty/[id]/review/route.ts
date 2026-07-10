import { NextResponse } from "next/server";
import { authorizeOfficialDuty } from "@/lib/official-duty-auth";
import { notifyOfficialDutyReviewed } from "@/lib/line/official-duty-notifications";
import { notifyOfficialDutyReviewedTelegram } from "@/lib/telegram/official-duty-workflow-notifications";
import {
  callOfficialDutyDocumentGas,
  getOfficialDutyDocumentConfig,
  getOfficialDutySignatureAsset,
  type OfficialDutyFinalizeResponse,
} from "@/lib/official-duty-document-gas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

function toBangkokDate(value: string) {
  return new Date(`${value}T00:00:00+07:00`);
}

function eachDateInRange(startDate: string, endDate: string) {
  const dates: string[] = [];
  const current = toBangkokDate(startDate);
  const end = toBangkokDate(endDate);

  while (current <= end) {
    dates.push(
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Bangkok",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(current)
    );
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

export async function POST(request: Request, context: Params) {
  try {
    const auth = await authorizeOfficialDuty(request);

    if (!auth.ok) {
      return NextResponse.json(
        { ok: false, message: auth.message },
        { status: auth.status }
      );
    }

    if (!["director", "admin"].includes(auth.profile.role)) {
      return NextResponse.json(
        { ok: false, message: "เนเธกเนเธกเธตเธชเธดเธ—เธเธดเนเธเธดเธเธฒเธฃเธ“เธฒเธเธณเธเธญ" },
        { status: 403 }
      );
    }

    const reviewerProfile = auth.profile;
    const reviewerUser = auth.user;
    const { id } = await context.params;

    let body: {
      action?: "approve" | "reject";
      reviewNote?: string;
    };

    try {
      body = (await request.json()) as typeof body;
    } catch {
      return NextResponse.json(
        { ok: false, message: "เธเนเธญเธกเธนเธฅเธ—เธตเนเธชเนเธเธกเธฒเนเธกเนเธ–เธนเธเธ•เนเธญเธ" },
        { status: 400 }
      );
    }

    if (!["approve", "reject"].includes(String(body.action))) {
      return NextResponse.json(
        { ok: false, message: "เธเธณเธชเธฑเนเธเธเธดเธเธฒเธฃเธ“เธฒเนเธกเนเธ–เธนเธเธ•เนเธญเธ" },
        { status: 400 }
      );
    }

    const { data: item, error: loadError } = await auth.admin
      .from("official_duty_requests")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (loadError || !item) {
      return NextResponse.json(
        { ok: false, message: "เนเธกเนเธเธเธเธณเธเธญเนเธเธฃเธฒเธเธเธฒเธฃ" },
        { status: 404 }
      );
    }

    if (item.status !== "pending") {
      return NextResponse.json(
        { ok: false, message: "เธเธณเธเธญเธเธตเนเนเธ”เนเธฃเธฑเธเธเธฒเธฃเธเธดเธเธฒเธฃเธ“เธฒเนเธฅเนเธง" },
        { status: 409 }
      );
    }

    const approved = body.action === "approve";
    const reviewNote = String(body.reviewNote ?? "").trim();
    const now = new Date().toISOString();
    const documentConfig = getOfficialDutyDocumentConfig();
    const dutyEndDate = item.duty_end_date || item.duty_date;
    const dutyDates = eachDateInRange(item.duty_date, dutyEndDate);

    async function finalizeOfficialDutyDocument() {
      if (!documentConfig || !item.working_document_id) {
        return {};
      }

      if (!reviewerProfile.signature_file_id) {
        throw new Error(
          "เธเธฃเธธเธ“เธฒเธญเธฑเธเนเธซเธฅเธ”เธฅเธฒเธขเน€เธเนเธเนเธเธเนเธญเธกเธนเธฅเธชเนเธงเธเธ•เธฑเธงเธเนเธญเธเธเธดเธเธฒเธฃเธ“เธฒเธเธณเธเธญเนเธเธฃเธฒเธเธเธฒเธฃ"
        );
      }

      const directorSignature = await getOfficialDutySignatureAsset(
        documentConfig.profileGasUrl,
        documentConfig.profileGasSecret,
        reviewerProfile.signature_file_id,
        "เธฅเธฒเธขเน€เธเนเธเธเธนเนเธญเธณเธเธงเธขเธเธฒเธฃ"
      );

      const gasResult = (await callOfficialDutyDocumentGas(
        documentConfig.officialDutyGasUrl,
        {
          action: "officialDutyFinalize",
          secret: documentConfig.officialDutyGasSecret,
          workingDocumentId: item.working_document_id,
          requestFolderId: item.drive_request_folder_id || "",
          officialDutyNumber: item.official_duty_number || "",
          fullName: item.full_name,
          dutyDate: item.duty_date,
          dutyEndDate,
          totalDays: item.total_days || dutyDates.length,
          subject: item.subject || item.reason,
          location: item.location || "",
          evidenceDescription:
            item.evidence_description || item.attachment_file_name || "-",
          decision: approved ? "approved" : "rejected",
          directorName: reviewerProfile.full_name,
          directorPosition: reviewerProfile.position || reviewerProfile.role,
          directorNote: reviewNote,
          reviewedAt: now,
          directorSignatureBase64:
            `data:${directorSignature.mimeType};base64,${directorSignature.base64}`,
        }
      )) as OfficialDutyFinalizeResponse;

      if (!gasResult.pdfFileId || !gasResult.pdfFileUrl) {
        throw new Error("GAS เธชเธฃเนเธฒเธ PDF เนเธเธฃเธฒเธเธเธฒเธฃเนเธกเนเธชเธณเน€เธฃเนเธเธซเธฃเธทเธญเนเธกเนเธเธทเธ File ID");
      }

      return {
        pdf_file_id: gasResult.pdfFileId,
        pdf_file_url: gasResult.pdfFileUrl,
        pdf_file_name: gasResult.pdfFileName || null,
        final_drive_folder_id: gasResult.finalFolderId || null,
        finalized_at: now,
        working_document_id: null,
        working_document_url: null,
        drive_request_folder_id: null,
      };
    }

    if (!approved) {
      const finalizePayload = await finalizeOfficialDutyDocument();

      const { data: rejected, error: rejectError } = await auth.admin
        .from("official_duty_requests")
        .update({
          status: "rejected",
          reviewed_by: reviewerUser.id,
          reviewer_name: reviewerProfile.full_name,
          reviewed_at: now,
          review_note: reviewNote || null,
          attendance_record_id: null,
          updated_at: now,
          ...finalizePayload,
        })
        .eq("id", id)
        .eq("status", "pending")
        .select("*")
        .single();

      if (rejectError || !rejected) {
        throw new Error(
          rejectError?.message || "เธเธฑเธเธ—เธถเธเธเธฅเนเธกเนเธญเธเธธเธเธฒเธ•เนเธกเนเธชเธณเน€เธฃเนเธ"
        );
      }

      void Promise.allSettled([
        notifyOfficialDutyReviewed({
          requestId: rejected.id,
          fullName: rejected.full_name,
          dutyDate: rejected.duty_date,
          reason: rejected.reason,
          approved: false,
          reviewerName: reviewerProfile.full_name,
          reviewNote: rejected.review_note || "",
        }),
        notifyOfficialDutyReviewedTelegram({
          requestId: rejected.id,
          applicantProfileId: rejected.user_id,
          reviewerProfileId: reviewerProfile.id,
          reviewerName: reviewerProfile.full_name,
          approved: false,
          officialDutyNumber: rejected.official_duty_number,
          dutyDate: rejected.duty_date,
          dutyEndDate: rejected.duty_end_date || rejected.duty_date,
          totalDays: Number(rejected.total_days || 1),
          subject: rejected.subject || rejected.reason,
          location: rejected.location || "-",
          reviewNote: rejected.review_note || "",
          pdfFileUrl: rejected.pdf_file_url || null,
        }),
      ]).then((results) => {
        results.forEach((result, index) => {
          if (result.status === "rejected") {
            console.error(
              index === 0
                ? "LINE official duty rejected notification error:"
                : "Telegram official duty rejected notification error:",
              result.reason
            );
          }
        });
      });

      return NextResponse.json({
        ok: true,
        request: rejected,
        message: "เธเธฑเธเธ—เธถเธเธเธฅเนเธกเนเธญเธเธธเธเธฒเธ•เนเธฅเนเธง",
      });
    }

    const [{ data: existing }, { data: activeLeave }] = await Promise.all([
      auth.admin
        .from("attendance_records")
        .select("id,work_date,check_in_at")
        .eq("user_id", item.user_id)
        .in("work_date", dutyDates),

      auth.admin
        .from("leave_requests")
        .select("id,status")
        .eq("user_id", item.user_id)
        .in("status", ["pending", "approved"])
        .lte("start_date", dutyEndDate)
        .gte("end_date", item.duty_date)
        .limit(1)
        .maybeSingle(),
    ]);

    if ((existing ?? []).some((record) => record.check_in_at)) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "เธเธนเนเธเธญเธฅเธเน€เธงเธฅเธฒเน€เธเนเธฒเนเธฅเนเธงเนเธเธเธฒเธเธงเธฑเธเธเธญเธเธเนเธงเธเธเธตเน เธเธถเธเนเธกเนเธชเธฒเธกเธฒเธฃเธ–เธญเธเธธเธเธฒเธ•เนเธเธฃเธฒเธเธเธฒเธฃเธขเนเธญเธเธซเธฅเธฑเธเนเธ”เน",
        },
        { status: 409 }
      );
    }

    if (activeLeave) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "เธงเธฑเธเธ—เธตเนเธเธญเนเธเธฃเธฒเธเธเธฒเธฃเธกเธตเธเธณเธเธญเธฅเธฒเธซเธฃเธทเธญเธเธฒเธฃเธฅเธฒเธ—เธตเนเธญเธเธธเธกเธฑเธ•เธดเนเธฅเนเธง เธเธถเธเนเธกเนเธชเธฒเธกเธฒเธฃเธ–เธญเธเธธเธเธฒเธ•เธเนเธณเนเธ”เน",
        },
        { status: 409 }
      );
    }

    let attendanceRecordId: string | null = null;
    const existingByDate = new Map(
      (existing ?? []).map((record) => [record.work_date, record.id])
    );
    const nowForAttendance = new Date().toISOString();

    for (const workDate of dutyDates) {
      const existingId = existingByDate.get(workDate);

      if (existingId) {
        const { data: updated, error } = await auth.admin
          .from("attendance_records")
          .update({
            check_in_at: null,
            check_out_at: null,
            check_in_status: null,
            check_out_status: null,
            note: "เนเธเธฃเธฒเธเธเธฒเธฃ",
            updated_at: nowForAttendance,
          })
          .eq("id", existingId)
          .select("id")
          .single();

        if (error || !updated) {
          throw new Error(
            error?.message || "เธเธฑเธเธ—เธถเธเธชเธ–เธฒเธเธฐเนเธเธฃเธฒเธเธเธฒเธฃเนเธกเนเธชเธณเน€เธฃเนเธ"
          );
        }

        attendanceRecordId = attendanceRecordId || updated.id;
      } else {
        const { data: inserted, error } = await auth.admin
          .from("attendance_records")
          .insert({
            user_id: item.user_id,
            work_date: workDate,
            check_in_at: null,
            check_out_at: null,
            note: "เนเธเธฃเธฒเธเธเธฒเธฃ",
          })
          .select("id")
          .single();

        if (error || !inserted) {
          throw new Error(
            error?.message ||
              "เธชเธฃเนเธฒเธเธฃเธฒเธขเธเธฒเธฃเนเธเธฃเธฒเธเธเธฒเธฃเนเธเธฃเธฐเธเธเธฅเธเน€เธงเธฅเธฒเนเธกเนเธชเธณเน€เธฃเนเธ"
          );
        }

        attendanceRecordId = attendanceRecordId || inserted.id;
      }
    }

    const finalizePayload = await finalizeOfficialDutyDocument();

    const { data: reviewed, error: reviewError } = await auth.admin
      .from("official_duty_requests")
      .update({
        status: "approved",
        reviewed_by: reviewerUser.id,
        reviewer_name: reviewerProfile.full_name,
        reviewed_at: now,
        review_note: reviewNote || null,
        attendance_record_id: attendanceRecordId,
        updated_at: now,
        ...finalizePayload,
      })
      .eq("id", id)
      .eq("status", "pending")
      .select("*")
      .single();

    if (reviewError || !reviewed) {
      throw new Error(
        reviewError?.message || "เธเธฑเธเธ—เธถเธเธเธฅเธเธฒเธฃเธเธดเธเธฒเธฃเธ“เธฒเนเธกเนเธชเธณเน€เธฃเนเธ"
      );
    }

    void Promise.allSettled([
      notifyOfficialDutyReviewed({
        requestId: reviewed.id,
        fullName: reviewed.full_name,
        dutyDate: reviewed.duty_date,
        reason: reviewed.reason,
        approved: true,
        reviewerName: reviewerProfile.full_name,
        reviewNote: reviewed.review_note || "",
      }),
      notifyOfficialDutyReviewedTelegram({
        requestId: reviewed.id,
        applicantProfileId: reviewed.user_id,
        reviewerProfileId: reviewerProfile.id,
        reviewerName: reviewerProfile.full_name,
        approved: true,
        officialDutyNumber: reviewed.official_duty_number,
        dutyDate: reviewed.duty_date,
        dutyEndDate: reviewed.duty_end_date || reviewed.duty_date,
        totalDays: Number(reviewed.total_days || 1),
        subject: reviewed.subject || reviewed.reason,
        location: reviewed.location || "-",
        reviewNote: reviewed.review_note || "",
        pdfFileUrl: reviewed.pdf_file_url || null,
      }),
    ]).then((results) => {
      results.forEach((result, index) => {
        if (result.status === "rejected") {
          console.error(
            index === 0
              ? "LINE official duty approved notification error:"
              : "Telegram official duty approved notification error:",
            result.reason
          );
        }
      });
    });

    return NextResponse.json({
      ok: true,
      request: reviewed,
      message: "เธญเธเธธเธเธฒเธ•เนเธซเนเนเธเธฃเธฒเธเธเธฒเธฃเนเธฅเธฐเธเธฑเธเธ—เธถเธเธชเธ–เธฒเธเธฐเธฅเธเน€เธงเธฅเธฒเนเธฅเนเธง",
    });
  } catch (error) {
    console.error("Official duty review error:", error);

    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "เธเธฑเธเธ—เธถเธเธเธฅเธเธฒเธฃเธเธดเธเธฒเธฃเธ“เธฒเนเธกเนเธชเธณเน€เธฃเนเธ",
      },
      { status: 500 }
    );
  }
}
