import type { SupabaseClient } from "@supabase/supabase-js";

export type IssuedDocumentNumber = {
  issueId: string;
  seriesId: string;
  runningNumber: number;
  buddhistYear: number;
  prefix: string;
  formattedNumber: string;
  mode: "TEST" | "LIVE";
};

export async function issueDocumentNumber(
  admin: SupabaseClient,
  input: {
    seriesCode: string;
    documentType: string;
    referenceId: string;
    issuedBy: string;
    metadata?: Record<string, unknown>;
  }
): Promise<IssuedDocumentNumber> {
  const { data, error } = await admin.rpc("issue_document_number", {
    p_series_code: input.seriesCode,
    p_document_type: input.documentType,
    p_reference_id: input.referenceId,
    p_issued_by: input.issuedBy,
    p_metadata: input.metadata ?? {},
  });

  if (error) {
    throw new Error(`ออกเลขเอกสารไม่สำเร็จ: ${error.message}`);
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.issue_id || !row?.formatted_number) {
    throw new Error("ระบบออกเลขเอกสารไม่คืนข้อมูลที่จำเป็น");
  }

  return {
    issueId: String(row.issue_id),
    seriesId: String(row.series_id),
    runningNumber: Number(row.running_number),
    buddhistYear: Number(row.buddhist_year),
    prefix: String(row.prefix ?? ""),
    formattedNumber: String(row.formatted_number),
    mode: String(row.mode) as "TEST" | "LIVE",
  };
}

export async function markDocumentNumberIssue(
  admin: SupabaseClient,
  input: {
    documentType: string;
    referenceId: string;
    status: "COMPLETED" | "FAILED" | "CANCELLED";
    failureReason?: string | null;
  }
) {
  const { error } = await admin.rpc("mark_document_number_issue", {
    p_document_type: input.documentType,
    p_reference_id: input.referenceId,
    p_status: input.status,
    p_failure_reason: input.failureReason ?? null,
  });

  if (error) {
    console.error("mark_document_number_issue error:", error);
  }
}
