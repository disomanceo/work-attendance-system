begin;

-- ล้างข้อมูลการเบิกจ่ายทดสอบทั้งหมด
delete from public.budget_payment_attachments;
delete from public.budget_payment_records;

-- ยกเลิกยอดเก่าที่นำเข้ามา เพื่อให้ยอดใช้จริงเริ่มต้นที่ 0
update public.budget_projects
set
  legacy_actual_amount = 0,
  updated_at = now()
where legacy_actual_amount <> 0;

update public.budget_activities
set
  legacy_actual_amount = 0,
  updated_at = now()
where legacy_actual_amount <> 0;

commit;
