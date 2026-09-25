-- ============================================================
-- OT System - PostgreSQL schema + seed data
-- ============================================================

-- ต้องเปิดใช้ extension สำหรับ gen_random_uuid() ถ้าต้องการใช้ uuid (ไม่บังคับ ตอนนี้ใช้ serial id)
-- CREATE EXTENSION IF NOT EXISTS pgcrypto;

DROP TABLE IF EXISTS ot_records CASCADE;
DROP TABLE IF EXISTS employee_custom_off_days CASCADE;
DROP TABLE IF EXISTS team_month_off_dates CASCADE;
DROP TABLE IF EXISTS employees CASCADE;

-- ------------------------------------------------------------
-- employees: ใช้เป็นทั้งตารางพนักงานและตารางผู้ใช้งานระบบ (login ด้วย employee_code)
-- ------------------------------------------------------------
CREATE TABLE employees (
	id                   SERIAL PRIMARY KEY,
	employee_code        VARCHAR(20)  NOT NULL UNIQUE,   -- ใช้เป็น username
	name                 VARCHAR(100) NOT NULL,
	rank                 VARCHAR(50)  DEFAULT '',
	team_key             VARCHAR(20)  NOT NULL DEFAULT 'friSat' CHECK (team_key IN ('friSat', 'sunMon')),
	role                 VARCHAR(20)  NOT NULL DEFAULT 'employee' CHECK (role IN ('admin', 'supervisor', 'employee')),
	supervisor_id        INTEGER      REFERENCES employees(id) ON DELETE SET NULL,
	password_hash        VARCHAR(255) NOT NULL,
	must_change_password BOOLEAN      NOT NULL DEFAULT TRUE,
	is_active            BOOLEAN      NOT NULL DEFAULT TRUE,
	created_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
	updated_at           TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_employees_supervisor_id ON employees(supervisor_id);

-- ------------------------------------------------------------
-- team_month_off_dates: วันหยุดพิเศษรายทีมต่อเดือน (แทน settings.teamMonthOffDatesByMonth)
-- ------------------------------------------------------------
CREATE TABLE team_month_off_dates (
	id        SERIAL PRIMARY KEY,
	team_key  VARCHAR(20) NOT NULL CHECK (team_key IN ('friSat', 'sunMon')),
	year      INTEGER     NOT NULL,
	month     INTEGER     NOT NULL CHECK (month BETWEEN 1 AND 12),
	off_day   INTEGER     NOT NULL CHECK (off_day BETWEEN 1 AND 31),
	UNIQUE (team_key, year, month, off_day)
);

-- ------------------------------------------------------------
-- employee_custom_off_days: วันหยุดเฉพาะบุคคล (customOffDays)
-- ------------------------------------------------------------
CREATE TABLE employee_custom_off_days (
	id           SERIAL PRIMARY KEY,
	employee_id  INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
	year         INTEGER NOT NULL,
	month        INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
	off_day      INTEGER NOT NULL CHECK (off_day BETWEEN 1 AND 31),
	UNIQUE (employee_id, year, month, off_day)
);

-- ------------------------------------------------------------
-- ot_records: ข้อมูลรายวันต่อพนักงาน (plan/actual OT, ลา, กะ)
-- ------------------------------------------------------------
CREATE TABLE ot_records (
	id            SERIAL PRIMARY KEY,
	employee_id   INTEGER      NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
	year          INTEGER      NOT NULL,
	month         INTEGER      NOT NULL CHECK (month BETWEEN 1 AND 12),
	day           INTEGER      NOT NULL CHECK (day BETWEEN 1 AND 31),
	plan_ot15     NUMERIC(5,2) NOT NULL DEFAULT 0,
	plan_ot3      NUMERIC(5,2) NOT NULL DEFAULT 0,
	actual_ot15   NUMERIC(5,2) NOT NULL DEFAULT 0,
	actual_ot3    NUMERIC(5,2) NOT NULL DEFAULT 0,
	leave_type    VARCHAR(20)  DEFAULT '',
	leave_reason  VARCHAR(255) DEFAULT '',
	shift_type    VARCHAR(10)  DEFAULT '',
	updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
	UNIQUE (employee_id, year, month, day)
);

CREATE INDEX idx_ot_records_employee_period ON ot_records(employee_id, year, month);

-- ============================================================
-- Seed data
-- หมายเหตุ: password = employee_code เสมอ (ตามเงื่อนไข)
-- password_hash ต้องเป็น bcrypt hash จริง ไม่ควร hardcode ในไฟล์ SQL
-- ให้รัน `node server/seed.js` แทน (จะ hash รหัสผ่านด้วย bcrypt ให้อัตโนมัติแล้ว INSERT ผ่าน pg)
-- ตัวอย่างรายชื่อที่ seed.js จะสร้าง:
--   ADMIN01                 -> admin            (password = ADMIN01)
--   SUP001, SUP002          -> supervisor        (password = SUP001 / SUP002)
--   EMP001-EMP003 (under SUP001), EMP004-EMP006 (under SUP002) -> employee
-- ============================================================

-- ตัวอย่างวันหยุดพิเศษรายทีมของเดือนปัจจุบัน (ปรับปีเดือนตามจริง)
INSERT INTO team_month_off_dates (team_key, year, month, off_day) VALUES
	('friSat', 2026, 8, 12),
	('friSat', 2026, 8, 13);
