"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
export default function SmartAreaImportButton() {
  const [run, setRun] = useState<any>(null); const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  async function authFetch(url:string, init?:RequestInit) { const { data } = await createClient().auth.getSession(); const token = data.session?.access_token; return fetch(url, { ...init, headers:{ ...(init?.headers || {}), authorization:`Bearer ${token}` } }); }
  async function load() { const r = await authFetch("/api/documents/smart-area-import/status"); const b = await r.json(); if (b.ok) setRun(b.run); }
  useEffect(() => { load(); const id = setInterval(load, 10000); return () => clearInterval(id); }, []);
  async function start() { setBusy(true); setMessage("กำลังส่งคำสั่ง..."); const r = await authFetch("/api/documents/smart-area-import/dispatch", { method:"POST" }); const b = await r.json(); setMessage(b.ok ? "เริ่มดึงหนังสือแล้ว" : (b.message || "เริ่มงานไม่สำเร็จ")); setBusy(false); await load(); }
  const active = busy || ["queued","running"].includes(run?.status);
  return <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",marginBottom:12}}><button type="button" onClick={start} disabled={active} style={{border:0,borderRadius:10,padding:"10px 14px",fontWeight:700,background:active?"#9ca3af":"#15803d",color:"white",cursor:active?"not-allowed":"pointer"}}>{active?"กำลังดึงหนังสือ...":"ดึงหนังสือล่าสุด"}</button><span style={{fontSize:13}}>{message || (run ? `เพิ่มใหม่ ${run.added} · อัปเดต ${run.updated} · ซ้ำ ${run.duplicate} · ผิดพลาด ${run.failed}` : "")}</span></div>;
}
