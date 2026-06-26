alter table public.leave_requests
add column if not exists evidence_description text;

comment on column public.leave_requests.evidence_description is
  'คำอธิบายหลักฐาน เช่น ใบรับรองแพทย์ หรือ รูปถ่าย; หากไม่แนบให้เก็บ -';
