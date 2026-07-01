import { NextResponse } from "next/server";
import {
  authorizeOfficialDuty,
  callOfficialDutyGas,
  officialDutyConfig,
} from "@/lib/official-duty-auth";
import { notifyOfficialDutySubmitted } from "@/lib/line/official-duty-notifications";
import {
  issueDocumentNumber,
  markDocumentNumberIssue,
} from "@/lib/document-numbers";
import {
  callOfficialDutyDocumentGas,
  getOfficialDutyDocumentConfig,
  getOfficialDutySignatureAsset,
  type OfficialDutyPendingResponse,
} from "@/lib/official-duty-document-gas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "application/pdf",
]);

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("วันที่ไปราชการไม่ถูกต้อง");
  }
  return value;
}

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

function rangesOverlap(
  leftStart: string,
  leftEnd: string,
  rightStart: string,
  rightEnd: string
) {
  return leftStart <= rightEnd && rightStart <= leftEnd;
}

export async function GET(request: Request) {
  try {
    const auth = await authorizeOfficialDuty(request);
    if (!auth.ok) {
      return NextResponse.json(
        { ok: false, message: auth.message },
        { status: auth.status }
      );
    }

    const { data, error } = await auth.admin
      .from("official_duty_requests")
      .select("*")
      .eq("user_id", auth.user.id)
      .order("created_at", { ascending: false });

    if (error) throw new Error("โหลดประวัติการขอไปราชการไม่สำเร็จ");

    return NextResponse.json({ ok: true, requests: data ?? [] });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "เกิดข้อผิดพลาด",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  let issuedReferenceId: string | null = null;
  let pendingDocumentId: string | null = null;
  let pendingRequestFolderId: string | null = null;
  let pendingAttachmentFileId: string | null = null;
  let pendingGasUrl: string | null = null;
  let pendingGasSecret: string | null = null;

  try {
    const auth = await authorizeOfficialDuty(request);
    if (!auth.ok) {
      return NextResponse.json(
        { ok: false, message: auth.message },
        { status: auth.status }
      );
    }

    const form = await request.formData();
    const dutyDate = validDate(
      String(form.get("dutyStartDate") ?? form.get("dutyDate") ?? "")
    );
    const dutyEndDate = validDate(
      String(form.get("dutyEndDate") ?? dutyDate)
    );
    const subject = String(form.get("subject") ?? "").trim();
    const location = String(form.get("location") ?? "").trim();
    const reason = subject;
    const note = String(form.get("note") ?? "").trim();
    const evidenceDescription = String(
      form.get("evidenceDescription") ?? ""
    ).trim();
    const attachment = form.get("attachment");
    const dutyDates = eachDateInRange(dutyDate, dutyEndDate);
    const totalDays = dutyDates.length;

    if (dutyEndDate < dutyDate) {
      return NextResponse.json(
        { ok: false, message: "วันที่กลับต้องไม่ก่อนวันที่ไป" },
        { status: 400 }
      );
    }

    if (subject.length < 3) {
      return NextResponse.json(
        { ok: false, message: "กรุณาระบุเรื่องไปราชการอย่างน้อย 3 ตัวอักษร" },
        { status: 400 }
      );
    }

    if (location.length < 2) {
      return NextResponse.json(
        { ok: false, message: "กรุณาระบุสถานที่ไปราชการ" },
        { status: 400 }
      );
    }

    // ตรวจสอบข้อมูลลงเวลาเดิมก่อนสร้างคำขอ
    const [
      { data: checkedIn },
      { data: activeLeave },
      { data: activeOfficialDuty },
    ] = await Promise.all([
      auth.admin
        .from("attendance_records")
        .select("id,check_in_at")
        .eq("user_id", auth.user.id)
        .in("work_date", dutyDates)
        .not("check_in_at", "is", null)
        .limit(1),

      auth.admin
        .from("leave_requests")
        .select("id,status")
        .eq("user_id", auth.user.id)
        .in("status", ["pending", "approved"])
        .lte("start_date", dutyEndDate)
        .gte("end_date", dutyDate)
        .limit(1)
        .maybeSingle(),

      auth.admin
        .from("official_duty_requests")
        .select("id,status,duty_date,duty_end_date")
        .eq("user_id", auth.user.id)
        .in("status", ["pending", "approved"])
        .lte("duty_date", dutyEndDate),
    ]);

    if (checkedIn?.length) {
      return NextResponse.json(
        {
          ok: false,
          message: "ช่วงวันที่เลือกมีวันที่ลงเวลาปฏิบัติงานแล้ว จึงไม่สามารถขอไปราชการได้",
        },
        { status: 409 }
      );
    }

    if (activeLeave) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "ช่วงวันที่เลือกมีคำขอลาหรือการลาที่อนุมัติแล้ว จึงไม่สามารถขอไปราชการซ้ำได้",
        },
        { status: 409 }
      );
    }
    const duplicate = (activeOfficialDuty ?? []).find((item) =>
      rangesOverlap(
        item.duty_date,
        item.duty_end_date || item.duty_date,
        dutyDate,
        dutyEndDate
      )
    );

    if (duplicate) {
      return NextResponse.json(
        { ok: false, message: "มีคำขอไปราชการในช่วงวันที่นี้อยู่แล้ว" },
        { status: 409 }
      );
    }

    const requestId = crypto.randomUUID();
    const documentConfig = getOfficialDutyDocumentConfig();
    let officialDutyNumber: string | null = null;
    let documentNumberIssueId: string | null = null;
    let sequenceNumber: number | null = null;
    let workingDocumentId: string | null = null;
    let workingDocumentUrl: string | null = null;
    let driveRequestFolderId: string | null = null;
    let uploaded: {
      fileId?: string;
      fileUrl?: string;
      fileName?: string;
      mimeType?: string;
    } = {};

    if (attachment instanceof File && attachment.size > 0) {
      if (attachment.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { ok: false, message: "ไฟล์แนบต้องไม่เกิน 5 MB" },
          { status: 400 }
        );
      }

      if (!ALLOWED_TYPES.has(attachment.type)) {
        return NextResponse.json(
          { ok: false, message: "รองรับเฉพาะ JPG, PNG และ PDF" },
          { status: 400 }
        );
      }

      if (!documentConfig) {
        const base64 = Buffer.from(await attachment.arrayBuffer()).toString("base64");

        uploaded = await callOfficialDutyGas(auth.cfg.gasUrl, {
          action: "uploadOfficialDutyAttachment",
          secret: auth.cfg.gasSecret,
          buddhistYear: Number(dutyDate.slice(0, 4)) + 543,
          fullName: auth.profile.full_name,
          dutyDate,
          originalName: attachment.name,
          mimeType: attachment.type,
          base64,
        }) as typeof uploaded;
      }
    }

    if (documentConfig) {
      if (!auth.profile.signature_file_id) {
        return NextResponse.json(
          {
            ok: false,
            message:
              "กรุณาอัปโหลดลายเซ็นในข้อมูลส่วนตัวก่อนส่งคำขอไปราชการ",
          },
          { status: 400 }
        );
      }

      const issued = await issueDocumentNumber(auth.admin, {
        seriesCode: "LEAVE",
        documentType: "OFFICIAL_DUTY",
        referenceId: requestId,
        issuedBy: auth.profile.id,
        metadata: {
          subject,
          applicantName: auth.profile.full_name,
          dutyDate,
          dutyEndDate,
          location,
        },
      });

      issuedReferenceId = requestId;
      officialDutyNumber = issued.formattedNumber;
      documentNumberIssueId = issued.issueId;
      sequenceNumber = issued.runningNumber;

      let attachmentDataUrl = "";
      let attachmentName = "";
      let attachmentMimeType = "";

      if (attachment instanceof File && attachment.size > 0) {
        const base64 = Buffer.from(await attachment.arrayBuffer()).toString("base64");
        attachmentDataUrl = `data:${attachment.type};base64,${base64}`;
        attachmentName = attachment.name;
        attachmentMimeType = attachment.type;
      }

      const applicantSignature = await getOfficialDutySignatureAsset(
        documentConfig.profileGasUrl,
        documentConfig.profileGasSecret,
        auth.profile.signature_file_id,
        "ลายเซ็นผู้ยื่นคำขอไปราชการ"
      );

      const gasResult = (await callOfficialDutyDocumentGas(
        documentConfig.officialDutyGasUrl,
        {
          action: "officialDutyCreatePending",
          secret: documentConfig.officialDutyGasSecret,
          documentNumber: officialDutyNumber,
          documentRunningNumber: sequenceNumber,
          documentYear: issued.buddhistYear,
          documentPrefix: issued.prefix,
          documentMode: issued.mode,
          fullName: auth.profile.full_name,
          position: auth.profile.position || auth.profile.role,
          dutyDate,
          dutyEndDate,
          totalDays,
          subject,
          location,
          evidenceDescription:
            evidenceDescription || attachmentName || "-",
          note,
          submittedAt: new Date().toISOString(),
          applicantSignatureBase64:
            `data:${applicantSignature.mimeType};base64,${applicantSignature.base64}`,
          attachmentName,
          attachmentMimeType,
          attachmentBase64: attachmentDataUrl,
        }
      )) as OfficialDutyPendingResponse;

      if (!gasResult.workingDocumentId || !gasResult.requestFolderId) {
        throw new Error("GAS ไม่คืนข้อมูลเอกสารไปราชการที่จำเป็น");
      }

      pendingDocumentId = gasResult.workingDocumentId;
      pendingRequestFolderId = gasResult.requestFolderId;
      pendingAttachmentFileId = gasResult.attachmentFileId || null;
      pendingGasUrl = documentConfig.officialDutyGasUrl;
      pendingGasSecret = documentConfig.officialDutyGasSecret;

      workingDocumentId = gasResult.workingDocumentId;
      workingDocumentUrl = gasResult.workingDocumentUrl || null;
      driveRequestFolderId = gasResult.requestFolderId;
      uploaded = {
        fileId: gasResult.attachmentFileId || undefined,
        fileUrl: gasResult.attachmentFileUrl || undefined,
        fileName: gasResult.attachmentFileName || undefined,
        mimeType: gasResult.attachmentMimeType || undefined,
      };
    }

    const { data, error } = await auth.admin
      .from("official_duty_requests")
      .insert({
        id: requestId,
        user_id: auth.user.id,
        full_name: auth.profile.full_name,
        position: auth.profile.position || auth.profile.role,
        duty_date: dutyDate,
        duty_end_date: dutyEndDate,
        total_days: totalDays,
        subject,
        location,
        reason,
        note: note || null,
        evidence_description:
          evidenceDescription || uploaded.fileName || "-",
        attachment_file_id: uploaded.fileId || null,
        attachment_file_url: uploaded.fileUrl || null,
        attachment_file_name: uploaded.fileName || null,
        attachment_mime_type: uploaded.mimeType || null,
        status: "pending",
        official_duty_number: officialDutyNumber,
        sequence_number: sequenceNumber,
        document_number_issue_id: documentNumberIssueId,
        working_document_id: workingDocumentId,
        working_document_url: workingDocumentUrl,
        drive_request_folder_id: driveRequestFolderId,
      })
      .select("*")
      .single();

    if (error || !data) throw new Error("บันทึกคำขอไปราชการไม่สำเร็จ");

    pendingDocumentId = null;
    pendingRequestFolderId = null;
    pendingAttachmentFileId = null;

    if (issuedReferenceId) {
      await markDocumentNumberIssue(auth.admin, {
        documentType: "OFFICIAL_DUTY",
        referenceId: issuedReferenceId,
        status: "COMPLETED",
      });
    }

    await notifyOfficialDutySubmitted({
      requestId: data.id,
      fullName: data.full_name,
      position: data.position || "",
      dutyDate: data.duty_date,
      reason: data.reason,
      hasAttachment: Boolean(data.attachment_file_id),
    }).catch(console.error);

    return NextResponse.json({
      ok: true,
      request: data,
      message: "ส่งคำขอไปราชการเรียบร้อยแล้ว",
    });
  } catch (error) {
    if (pendingGasUrl && pendingGasSecret && pendingDocumentId) {
      await callOfficialDutyDocumentGas(pendingGasUrl, {
        action: "officialDutyDiscardPending",
        secret: pendingGasSecret,
        workingDocumentId: pendingDocumentId,
        requestFolderId: pendingRequestFolderId || "",
        attachmentFileId: pendingAttachmentFileId || "",
      }).catch((cleanupError) => {
        console.error("Official duty document cleanup error:", cleanupError);
      });
    }

    if (issuedReferenceId) {
      const cfg = officialDutyConfig();
      const admin = (await import("@supabase/supabase-js")).createClient(
        cfg.url,
        cfg.service,
        { auth: { persistSession: false, autoRefreshToken: false } }
      );
      await markDocumentNumberIssue(admin, {
        documentType: "OFFICIAL_DUTY",
        referenceId: issuedReferenceId,
        status: "FAILED",
        failureReason:
          error instanceof Error ? error.message : "เกิดข้อผิดพลาด",
      });
    }

    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "เกิดข้อผิดพลาด",
      },
      { status: 500 }
    );
  }
}

