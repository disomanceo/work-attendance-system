เพิ่มปุ่มสร้าง PDF รายวัน

ฟังก์ชัน:
- ถ้ายังไม่มี PDF: ปุ่ม “สร้าง PDF วันนี้”
- ถ้ามี PDF แล้ว: ปุ่ม “สร้าง PDF ใหม่”
- ถ้าสร้างใหม่ ระบบย้ายไฟล์เดิมไปถังขยะก่อน
- เรียงรายชื่อตามเวลาเข้าเร็วไปช้า
- ผู้ไม่มีเวลาเข้าไม่ใส่ในตาราง
- ช่องสถานะของผู้ไม่มีเวลาเข้าจะไม่ถูกสร้าง
- หมายเหตุจากข้อมูลที่ไม่มีเวลาเข้า จะสรุปท้ายเอกสาร
- Google Docs รายวันเป็นไฟล์ชั่วคราว และถูกลบทันทีหลังสร้าง PDF
- หลังสร้าง:
  - ปุ่มวันที่เปลี่ยนเป็นสีเขียว ✓
  - Preview โหลดไฟล์ใหม่
  - ดาวน์โหลดและลบ PDF ได้ตามปกติ

ไฟล์ที่แก้:
1. app/admin/attendance/page.tsx
2. app/admin/attendance/attendance-report.module.css
3. app/api/admin/attendance/daily-pdf/route.ts
4. gas/Code.gs

ติดตั้ง:
cd $HOME\Downloads

Expand-Archive `
  -Path ".\work-attendance-daily-pdf-build.zip" `
  -DestinationPath "D:\work-attendance-system" `
  -Force

cd D:\work-attendance-system
npm run build
npm run dev

อัปเดต GAS:
1. แทน Code.gs ด้วย gas/Code.gs
2. Save
3. Deploy > Manage deployments
4. Edit > New version > Deploy

สำคัญ:
GAS ต้องรองรับ doPost จากโค้ดชุดนี้
ไม่ต้องเปลี่ยน .env.local
