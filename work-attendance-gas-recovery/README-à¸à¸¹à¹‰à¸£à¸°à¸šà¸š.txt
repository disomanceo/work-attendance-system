ชุดกู้ระบบ GAS — Work Attendance System

สาเหตุ:
Code.gs สำหรับรายงาน PDF ถูกนำไปแทน GAS เดิมที่รับ Action อัปโหลดรูปและลายเซ็น
จึงเกิดข้อความ "ไม่พบ Action ที่ร้องขอ"

โครงสร้างที่ถูกต้อง:
1) GAS เดิม = อัปโหลดรูปภาพ/ลายเซ็น
2) GAS ใหม่ = รายงาน PDF เท่านั้น

กู้ GAS เดิม:
- เปิด Apps Script โครงการเดิม
- Project history
- เลือกเวอร์ชันก่อนนำ Code.gs ระบบ PDF ไปแทน
- Restore this version
- Save
- Deploy > Manage deployments > Edit > New version > Deploy

ค้นหาโค้ดเดิมในเครื่องสำรอง:
Set-ExecutionPolicy -Scope Process Bypass
& "D:\work-attendance-system\scripts\Find-OldUploadGas.ps1"

ผลลัพธ์:
D:\gas-upload-candidates.txt

สร้าง GAS ใหม่สำหรับ PDF:
- เข้า script.google.com
- New project
- ตั้งชื่อ Work Attendance PDF Service
- ใช้ไฟล์ gas-pdf/Code.gs
- Project Settings > Script Properties
- เพิ่ม DAILY_PDF_SECRET ให้ตรงกับ .env.local
- Deploy > New deployment > Web app
- Execute as: Me
- Who has access: Anyone
- คัดลอก URL /exec ไปใส่ GAS_DAILY_PDF_API_URL

หลังแก้ .env.local:
cd D:\work-attendance-system
Remove-Item .next -Recurse -Force -ErrorAction SilentlyContinue
npm run dev

หมายเหตุ:
ไฟล์ชุดนี้มี Code.gs รายงาน PDF แบบเต็ม
แต่ไม่สร้างโค้ดอัปโหลดรูป/ลายเซ็นโดยเดา เพราะต้องใช้ Action, Folder ID,
ชื่อฟิลด์ และโครงสร้างข้อมูลจริงของระบบเดิม
