import { NextResponse } from "next/server";
import { adminClient, requireUser } from "../_shared";
export const dynamic = "force-dynamic";

async function readGitHubError(response: Response) {
  const text = await response.text().catch(() => "");
  let detail = text.trim();

  try {
    const json = JSON.parse(text) as { message?: string };
    detail = json.message || detail;
  } catch {
    // GitHub may return an empty body for some responses.
  }

  return detail || response.statusText || "Unknown GitHub error";
}

export async function POST(request: Request) {
  const user = await requireUser(request);
  if (!user) return NextResponse.json({ ok:false, message:"Unauthorized" }, { status:401 });
  const token = process.env.GITHUB_WORKFLOW_TOKEN;
  const repo = process.env.GITHUB_WORKFLOW_REPOSITORY || "disomanceo/work-attendance-system";
  const ref = process.env.GITHUB_WORKFLOW_REF || "main";
  if (!token) return NextResponse.json({ ok:false, message:"ยังไม่ได้ตั้งค่า GITHUB_WORKFLOW_TOKEN สำหรับสั่งดึงหนังสือจากระบบกลาง" }, { status:500 });
  const admin = adminClient();
  const { data: run, error } = await admin.from("smart_area_import_runs").insert({ status:"queued", created_by:user.id }).select("id").single();
  if (error) return NextResponse.json({ ok:false, message:error.message }, { status:500 });
  const response = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/smart-area-import.yml/dispatches`, { method:"POST", headers:{ authorization:`Bearer ${token}`, accept:"application/vnd.github+json", "x-github-api-version":"2022-11-28", "content-type":"application/json" }, body:JSON.stringify({ ref, inputs:{ force:"true" } }) });
  if (!response.ok) {
    const detail = await readGitHubError(response);
    const githubMessage = `GitHub HTTP ${response.status}: ${detail}`;

    await admin.from("smart_area_import_runs").update({
      status:"failed",
      finished_at:new Date().toISOString(),
      errors:[{
        message: githubMessage,
        repo,
        ref,
        workflow:"smart-area-import.yml",
      }],
    }).eq("id", run.id);

    return NextResponse.json({
      ok:false,
      message:`เริ่ม GitHub workflow ไม่สำเร็จ (${githubMessage})`,
      githubStatus:response.status,
      githubMessage:detail,
      fallback:"extension",
    }, { status:502 });
  }
  return NextResponse.json({ ok:true, runId:run.id });
}
