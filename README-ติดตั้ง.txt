Work Attendance System — สถานะรายวันและปิดเดือน

ฟังก์ชันใหม่
1. ปุ่มวันที่สีเขียว + ✓ = มี PDF รายวันแล้ว
2. ปุ่มวันที่สีเทา = ยังไม่มี PDF
3. ปุ่มรวมเดือนสีม่วง + ✓ = มี PDF รวมเดือน
4. ปุ่ม “ปิดเดือนและลบรายวัน”
5. ปิดเดือนได้เฉพาะเมื่อ:
   - เดือนนั้นสิ้นสุดแล้ว
   - มี PDF รวมเดือนที่สมบูรณ์
6. เมื่อปิดเดือน:
   - ย้าย PDF รายวันไปถังขยะ
   - ย้าย Google Docs รายวันไปถังขยะ
   - ย้าย Google Docs รวมเดือนไปถังขยะ
   - เก็บ PDF รวมเดือนไว้เพียงไฟล์เดียว
7. ขณะสร้าง PDF รวมเดือน:
   - Google Docs รวมเดือนเป็นไฟล์ชั่วคราว
   - ถูกย้ายไปถังขยะทันทีหลังแปลง PDF สำเร็จ

ไฟล์ที่แก้ไข
- app/admin/attendance/page.tsx
- app/admin/attendance/attendance-report.module.css
- app/api/admin/attendance/monthly-pdf/route.ts
- gas/Code.gs

ติดตั้ง Next.js
cd $HOME\Downloads
Expand-Archive `
  -Path ".\work-attendance-month-status-close.zip" `
  -DestinationPath "D:\work-attendance-system" `
  -Force

cd D:\work-attendance-system
npm run build
npm run dev

อัปเดต GAS
1. เปิด GAS Web App เดิม
2. แทน Code.gs ด้วย gas/Code.gs
3. Save
4. Deploy > Manage deployments
5. Edit > New version > Deploy

ไม่ต้องเปลี่ยน .env.local

ข้อควรระวัง
- ปุ่มปิดเดือนเป็นการย้ายไฟล์ไปถังขยะ ไม่ได้ลบถาวร
- ระบบไม่อนุญาตปิดเดือนปัจจุบันก่อนสิ้นเดือน
- ต้องตรวจ PDF รวมเดือนก่อนกดปิดเดือน
