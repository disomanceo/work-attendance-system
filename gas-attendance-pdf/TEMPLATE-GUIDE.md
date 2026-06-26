# ปรับ Google Docs ต้นฉบับให้ใช้ Placeholder

## Placeholder ข้อความทั่วไป

วางข้อความเหล่านี้ในตำแหน่งเดิมของเอกสาร และกำหนดฟอนต์/ขนาด/ตัวหนา/การจัดแนวจาก Google Docs:

- `{{REPORT_DATE}}` วันที่เต็ม เช่น ๒๗ มิถุนายน ๒๕๖๙
- `{{REPORT_DAY}}`
- `{{REPORT_MONTH}}`
- `{{REPORT_YEAR_BE}}`
- `{{NOTES}}`
- `{{TOTAL_STAFF}}`
- `{{PRESENT_COUNT}}`
- `{{SICK_COUNT}}`
- `{{PERSONAL_COUNT}}`
- `{{OFFICIAL_DUTY_COUNT}}`
- `{{LATE_COUNT}}`
- `{{ABSENT_COUNT}}`

ตัวอย่าง:

```text
ประจำวันที่ {{REPORT_DATE}}
หมายเหตุ  {{NOTES}}

ข้าราชการทั้งหมด {{TOTAL_STAFF}} คน
มาปฏิบัติราชการ {{PRESENT_COUNT}} คน
ลาป่วย {{SICK_COUNT}} คน
ลากิจ {{PERSONAL_COUNT}} คน
ไปราชการ {{OFFICIAL_DUTY_COUNT}} คน
มาสาย {{LATE_COUNT}} คน
ไม่มาปฏิบัติราชการ {{ABSENT_COUNT}} คน
```

## แถวต้นแบบในตาราง

เหลือแถวข้อมูลต้นแบบเพียง 1 แถวใต้หัวตาราง แล้วใส่ตามลำดับ 8 ช่อง:

1. `{{ROW_NO}}`
2. `{{FULL_NAME}}`
3. `{{POSITION}}`
4. `{{CHECK_IN}}`
5. `{{STATUS}}`
6. `{{CHECK_OUT}}`
7. `{{SIGNATURE}}`
8. `{{ROW_NOTE}}`

ระบบจะคัดลอกแถวนี้ตามค่า `DAILY_DATA_ROWS` และเติมแถวว่างให้ครบจำนวนเดิม เพื่อรักษาความสูงและการจัดหน้า

## ข้อสำคัญ

- Placeholder แต่ละคำต้องใช้รูปแบบเดียวกันทั้งคำ
- อย่าทำบางส่วนของ placeholder เป็นตัวหนาหรือคนละฟอนต์
- อย่าเว้นวรรคภายในวงเล็บปีกกา
- อย่าใช้ `{{NOTE}}` ในตาราง ให้ใช้ `{{ROW_NOTE}}`
- กำหนดเส้นตาราง ความกว้างคอลัมน์ การจัดแนว ฟอนต์ และความสูงของแถวจากแถวต้นแบบ
