ปรับระบบสร้าง PDF รายวันให้เหมือน Google Docs ต้นฉบับ

Template ID:
1XFEiaz3xRKVVXqQFkXpGk_Ts7oxEajElQe4VRkKvql0

ระบบใหม่:
- สำเนา Google Docs ต้นฉบับ
- รักษาฟอนต์ ระยะขอบ ตาราง และรูปแบบเดิม
- เปลี่ยนวันที่อัตโนมัติ
- กรอกข้อมูลลงตาราง 8 คอลัมน์ตามต้นฉบับ:
  ที่ / ชื่อ-สกุล / ตำแหน่ง / เวลามา / สถานะ /
  เวลากลับ / ลายมือชื่อ / หมายเหตุ
- เรียงเวลาเข้าจากน้อยไปมาก
- เติมเลขลำดับเป็นเลขไทย
- เหลือแถวว่างให้ครบ 12 แถว
- กรอกหมายเหตุผู้ลา/ไปราชการท้ายเอกสาร
- คำนวณสรุปด้านล่าง
- ใช้ TH Sarabun New ขนาด 14 ในข้อมูลตาราง
- แปลงเป็น PDF
- ลบสำเนา Google Docs ชั่วคราว

ไฟล์ที่แก้:
1. app/api/admin/attendance/daily-pdf/route.ts
2. gas/Code.gs

ติดตั้ง:
cd $HOME\Downloads

Expand-Archive `
  -Path ".\work-attendance-template-daily-pdf.zip" `
  -DestinationPath "D:\work-attendance-system" `
  -Force

cd D:\work-attendance-system
npm run build

จากนั้นอัปเดต gas/Code.gs:
Save > Deploy > Manage deployments > Edit > New version > Deploy
