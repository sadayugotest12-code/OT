# Plan Overtime

ระบบวางแผน บันทึก และตรวจสอบชั่วโมงทำงานล่วงเวลา (OT) สำหรับทีมงาน รองรับการวางแผนรายเดือน การบันทึกรายวัน วันลา กะการทำงาน และ Dashboard สรุปผลพร้อมแจ้งเตือนชั่วโมงที่เข้าใกล้หรือเกินเกณฑ์

## ฟีเจอร์หลัก

- วางแผน OT รายเดือน แยก OT `1.5x` และ `3x`
- บันทึก OT จริงรายวัน พร้อมกะกลางวัน `D` และกะกลางคืน `N`
- บันทึกวันลา `AL`, `SL`, `PL` และเหตุผลการลา
- กำหนดวันหยุดประจำทีมและวันหยุดพิเศษรายเดือน
- Dashboard แสดง OT Plan, OT Actual, ค่าเฉลี่ย และรายการแจ้งเตือน
- ตรวจสอบการทำงานต่อเนื่อง 6 วันและ 7 วันขึ้นไป
- Export รายงานผ่านหน้าพิมพ์ของเบราว์เซอร์เป็น PDF
- Login ด้วยรหัสพนักงานและ JWT authentication
- จำกัดข้อมูลตามสิทธิ์ `admin`, `supervisor` และ `employee`
- บันทึกข้อมูลใน `localStorage` และเลือกเชื่อมโฟลเดอร์เพื่อเขียนไฟล์ `data/ot-data.json`

## เทคโนโลยี

- Frontend: HTML, CSS, Vanilla JavaScript
- Backend: Node.js, Express
- Database: PostgreSQL
- Authentication: bcrypt และ JSON Web Token (JWT)

## โครงสร้างโปรเจกต์

```text
.
├── ot.html                  # หน้าหลักของระบบ
├── ot.css                   # รูปแบบหน้าจอ
├── ot.js                    # การทำงานของ planner และ report
├── login.html               # หน้าเข้าสู่ระบบ
├── change-password.html     # หน้าเปลี่ยนรหัสผ่าน
├── auth.js                  # ตัวช่วย authentication ฝั่ง frontend
├── data/ot-data.json        # ไฟล์ข้อมูลสำรอง/ข้อมูลที่เชื่อมจากโฟลเดอร์
├── sql/schema.sql           # PostgreSQL schema
└── server/
    ├── server.js            # Express API
    ├── db.js                # PostgreSQL connection pool
    ├── seed.js              # ข้อมูลตัวอย่างสำหรับเริ่มต้นระบบ
    └── middleware/auth.js    # JWT และ role middleware
```

## สิ่งที่ต้องติดตั้ง

- Node.js 18 ขึ้นไป
- PostgreSQL 14 ขึ้นไป
- เบราว์เซอร์ที่รองรับ `showDirectoryPicker()` เช่น Google Chrome หรือ Microsoft Edge รุ่นปัจจุบัน

## การติดตั้ง Backend

1. สร้างฐานข้อมูล PostgreSQL เช่น `ot_db`
2. รัน schema:

   ```bash
   psql -U postgres -d ot_db -f sql/schema.sql
   ```

3. เข้าโฟลเดอร์ backend และติดตั้ง dependencies:

   ```bash
   cd server
   npm install
   ```

4. สร้างไฟล์ `server/.env` โดยใช้ค่าต่อไปนี้เป็นตัวอย่าง:

   ```env
   PGHOST=localhost
   PGPORT=5432
   PGUSER=postgres
   PGPASSWORD=เปลี่ยนเป็นรหัสผ่านของคุณ
   PGDATABASE=ot_db
   JWT_SECRET=เปลี่ยนเป็น secret ที่ยาวและสุ่ม
   JWT_EXPIRES_IN=8h
   PORT=3001
   ```

5. สร้างผู้ใช้ตัวอย่าง:

   ```bash
   npm run seed
   ```

6. เริ่ม API server:

   ```bash
   npm start
   ```

   ระหว่างพัฒนาใช้คำสั่ง `npm run dev` ได้

API จะทำงานที่ `http://localhost:3001`

## การเปิดใช้งาน Frontend

เปิดโฟลเดอร์โปรเจกต์ผ่าน local HTTP server แล้วเข้า `login.html` ได้หลายวิธี โดยต้องเปิดคำสั่งจากโฟลเดอร์รากของโปรเจกต์นี้

### ใช้ Python

ถ้ามี Python ติดตั้งอยู่แล้ว:

```bash
python -m http.server 5500
```

หรือบน Windows บางเครื่องอาจต้องใช้:

```bash
py -m http.server 5500
```

### ใช้ Node.js

ถ้ามี Node.js และต้องการใช้แพ็กเกจสำหรับ static server:

```bash
npx serve . -l 5500
```

### ใช้ VS Code Live Server

สามารถใช้ VS Code extension Live Server ได้เช่นกัน แต่ไม่ใช่ข้อบังคับ

จากนั้นเปิด URL นี้ในเบราว์เซอร์:

```text
http://localhost:5500/login.html
```

ถ้าเลือกพอร์ตอื่น ให้เปลี่ยนเลข `5500` ใน URL ให้ตรงกับคำสั่งที่ใช้ และเปิด backend API แยกอีกหนึ่ง terminal ด้วย `npm start` จากโฟลเดอร์ `server`

ไม่แนะนำให้เปิดด้วย `file://` เพราะอาจทำให้การเรียก API และการเขียนไฟล์ผ่าน File System Access API ทำงานไม่ครบถ้วน

โดยค่าเริ่มต้น frontend จะเรียก backend ที่:

```text
http://localhost:3001
```

หากต้องการใช้ API คนละ URL ให้กำหนด `window.OT_API_BASE` ก่อนโหลด `auth.js` และ `ot.js`

## บัญชีตัวอย่างจาก Seed

คำสั่ง `npm run seed` จะสร้างบัญชีตัวอย่าง 9 บัญชี โดยรหัสผ่านเริ่มต้นเท่ากับรหัสพนักงาน:

| รหัส | Role | สิทธิ์โดยสรุป |
| --- | --- | --- |
| `ADMIN01` | admin | ดูและจัดการข้อมูลพนักงานทั้งหมด |
| `SUP001`, `SUP002` | supervisor | ดูและจัดการข้อมูลของตนเองและลูกทีม |
| `EMP001` - `EMP006` | employee | บันทึกข้อมูลของตนเอง และดูข้อมูลทีมตามที่ระบบอนุญาต |

ผู้ใช้ที่เข้าสู่ระบบครั้งแรกควรเปลี่ยนรหัสผ่านทันที บัญชีและรหัสผ่านชุดนี้มีไว้สำหรับการทดสอบเท่านั้น ห้ามใช้ใน production

## การจัดเก็บข้อมูล

- ข้อมูลผู้ใช้และข้อมูล OT ที่ API รองรับจัดเก็บใน PostgreSQL
- สถานะการกรอกข้อมูลของหน้าเว็บถูกสำรองไว้ใน browser `localStorage`
- ปุ่มเชื่อมโฟลเดอร์สามารถเขียนข้อมูลลง `data/ot-data.json` ได้โดยตรง
- ปัจจุบันหน้าเว็บยังใช้ localStorage/ไฟล์เป็นหลักสำหรับ OT state ส่วน API สำหรับ authentication และรายชื่อพนักงานเชื่อมกับ PostgreSQL แล้ว

## API หลัก

ทุก endpoint ต่อไปนี้ยกเว้น login ต้องส่ง JWT ใน header `Authorization: Bearer <token>`:

- `POST /api/auth/login`
- `POST /api/auth/change-password`
- `GET /api/employees`
- `GET /api/team-off-dates`
- `POST /api/team-off-dates`
- `GET /api/ot-records`
- `POST /api/ot-records`

## ความปลอดภัยก่อน Deploy

- เปลี่ยน `JWT_SECRET`, รหัสผ่าน PostgreSQL และรหัสผ่านบัญชี seed ทั้งหมด
- อย่า commit ไฟล์ `server/.env` หรือค่า credential ใด ๆ ลง GitHub
- ตั้งค่า CORS ให้จำกัดเฉพาะ origin ของ frontend แทนการเปิดกว้างเมื่อใช้งานจริง
- ใช้ HTTPS และตั้งค่า PostgreSQL ให้รับการเชื่อมต่อจาก host ที่จำเป็นเท่านั้น
- ตรวจสอบสิทธิ์และ validation ของข้อมูลอีกครั้งก่อนใช้งาน production

## License

โปรเจกต์นี้จัดทำเพื่อใช้งานภายใน/การพัฒนา กรุณาเพิ่มรายละเอียด license ให้เหมาะสมก่อนเผยแพร่สู่สาธารณะ