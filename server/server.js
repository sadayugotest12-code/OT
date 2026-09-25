require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { pool } = require("./db");
const { requireAuth, requireRole } = require("./middleware/auth");

const app = express();
app.use(cors());
app.use(express.json());

// ------------------------------------------------------------
// Helper: คืนรายการ employee id ที่ user ปัจจุบันมีสิทธิ์เห็น
// admin -> ทุกคน, supervisor -> ตัวเอง + ลูกน้อง, employee -> ตัวเอง + หัวหน้า + เพื่อนร่วมทีม
// ------------------------------------------------------------
async function getVisibleEmployeeIds(user) {
	if (user.role === "admin") {
		const { rows } = await pool.query("SELECT id FROM employees WHERE is_active = TRUE");
		return rows.map((r) => r.id);
	}
	if (user.role === "supervisor") {
		const { rows } = await pool.query(
			"SELECT id FROM employees WHERE is_active = TRUE AND (id = $1 OR supervisor_id = $1)",
			[user.id]
		);
		return rows.map((r) => r.id);
	}
	const { rows } = await pool.query(
		`SELECT id FROM employees
		 WHERE is_active = TRUE
		   AND (id = $1 OR id = $2 OR supervisor_id = $2)`,
		[user.id, user.supervisorId]
	);
	return rows.map((r) => r.id);
}

function getEditableEmployeeIds(user) {
	if (user.role === "employee") return [user.id];
	return getVisibleEmployeeIds(user);
}

// ================= AUTH =================

// POST /api/auth/login  { username, password }
app.post("/api/auth/login", async (req, res) => {
	const { username, password } = req.body || {};
	if (!username || !password) {
		return res.status(400).json({ error: "กรุณากรอก username และ password" });
	}

	try {
		const { rows } = await pool.query(
			"SELECT * FROM employees WHERE employee_code = $1 AND is_active = TRUE",
			[username]
		);
		const emp = rows[0];
		if (!emp) return res.status(401).json({ error: "ไม่พบผู้ใช้งานนี้" });

		const ok = await bcrypt.compare(password, emp.password_hash);
		if (!ok) return res.status(401).json({ error: "รหัสผ่านไม่ถูกต้อง" });

		const payload = {
			id: emp.id,
			employeeCode: emp.employee_code,
			name: emp.name,
			role: emp.role,
			supervisorId: emp.supervisor_id,
			teamKey: emp.team_key
		};
		const token = jwt.sign(payload, process.env.JWT_SECRET, {
			expiresIn: process.env.JWT_EXPIRES_IN || "8h"
		});

		res.json({ token, user: payload, mustChangePassword: emp.must_change_password });
	} catch (err) {
		console.error(err);
		res.status(500).json({ error: "เกิดข้อผิดพลาดในระบบ" });
	}
});

// POST /api/auth/change-password  { oldPassword, newPassword }
app.post("/api/auth/change-password", requireAuth, async (req, res) => {
	const { oldPassword, newPassword } = req.body || {};
	if (!oldPassword || !newPassword || newPassword.length < 4) {
		return res.status(400).json({ error: "กรุณากรอกรหัสผ่านเดิม/ใหม่ให้ถูกต้อง (รหัสใหม่อย่างน้อย 4 ตัวอักษร)" });
	}

	try {
		const { rows } = await pool.query("SELECT * FROM employees WHERE id = $1", [req.user.id]);
		const emp = rows[0];
		if (!emp) return res.status(404).json({ error: "ไม่พบผู้ใช้งาน" });

		const ok = await bcrypt.compare(oldPassword, emp.password_hash);
		if (!ok) return res.status(401).json({ error: "รหัสผ่านเดิมไม่ถูกต้อง" });

		const newHash = await bcrypt.hash(newPassword, 10);
		await pool.query(
			"UPDATE employees SET password_hash = $1, must_change_password = FALSE, updated_at = now() WHERE id = $2",
			[newHash, req.user.id]
		);
		res.json({ success: true });
	} catch (err) {
		console.error(err);
		res.status(500).json({ error: "เกิดข้อผิดพลาดในระบบ" });
	}
});

// ================= EMPLOYEES (scoped by role) =================

// GET /api/employees -> เฉพาะรายชื่อที่ user มีสิทธิ์เห็นตาม role
app.get("/api/employees", requireAuth, async (req, res) => {
	try {
		const ids = await getVisibleEmployeeIds(req.user);
		if (ids.length === 0) return res.json([]);
		const { rows } = await pool.query(
			`SELECT id, employee_code AS code, name, rank, team_key AS "teamKey", role, supervisor_id AS "supervisorId"
			 FROM employees WHERE id = ANY($1::int[]) ORDER BY id`,
			[ids]
		);
		res.json(rows);
	} catch (err) {
		console.error(err);
		res.status(500).json({ error: "เกิดข้อผิดพลาดในระบบ" });
	}
});

// ================= TEAM MONTH OFF DATES =================

// GET /api/team-off-dates?year=&month=
app.get("/api/team-off-dates", requireAuth, async (req, res) => {
	const year = Number(req.query.year);
	const month = Number(req.query.month);
	if (!year || !month) return res.status(400).json({ error: "ต้องระบุ year และ month" });

	try {
		const { rows } = await pool.query(
			"SELECT team_key AS \"teamKey\", off_day AS \"offDay\" FROM team_month_off_dates WHERE year = $1 AND month = $2",
			[year, month]
		);
		const result = { friSat: [], sunMon: [] };
		for (const r of rows) {
			if (result[r.teamKey]) result[r.teamKey].push(r.offDay);
		}
		res.json(result);
	} catch (err) {
		console.error(err);
		res.status(500).json({ error: "เกิดข้อผิดพลาดในระบบ" });
	}
});

// POST /api/team-off-dates  { year, month, friSat: [..], sunMon: [..] }  (admin/supervisor only)
app.post("/api/team-off-dates", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
	const { year, month, friSat = [], sunMon = [] } = req.body || {};
	if (!year || !month) return res.status(400).json({ error: "ต้องระบุ year และ month" });

	const client = await pool.connect();
	try {
		await client.query("BEGIN");
		await client.query("DELETE FROM team_month_off_dates WHERE year = $1 AND month = $2", [year, month]);

		const rowsToInsert = [
			...friSat.map((d) => ["friSat", d]),
			...sunMon.map((d) => ["sunMon", d])
		];
		for (const [teamKey, offDay] of rowsToInsert) {
			await client.query(
				"INSERT INTO team_month_off_dates (team_key, year, month, off_day) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING",
				[teamKey, year, month, offDay]
			);
		}
		await client.query("COMMIT");
		res.json({ success: true });
	} catch (err) {
		await client.query("ROLLBACK");
		console.error(err);
		res.status(500).json({ error: "เกิดข้อผิดพลาดในระบบ" });
	} finally {
		client.release();
	}
});

// ================= OT RECORDS =================

// GET /api/ot-records?year=&month=  -> เฉพาะ employee ที่อยู่ในสิทธิ์ของ user
app.get("/api/ot-records", requireAuth, async (req, res) => {
	const year = Number(req.query.year);
	const month = Number(req.query.month);
	if (!year || !month) return res.status(400).json({ error: "ต้องระบุ year และ month" });

	try {
		const ids = await getVisibleEmployeeIds(req.user);
		if (ids.length === 0) return res.json([]);
		const { rows } = await pool.query(
			`SELECT employee_id AS "employeeId", day, plan_ot15 AS "planOT15", plan_ot3 AS "planOT3",
			        actual_ot15 AS "actualOT15", actual_ot3 AS "actualOT3", leave_type AS "leaveType",
			        leave_reason AS "leaveReason", shift_type AS "shiftType"
			 FROM ot_records
			 WHERE year = $1 AND month = $2 AND employee_id = ANY($3::int[])
			 ORDER BY employee_id, day`,
			[year, month, ids]
		);
		res.json(rows);
	} catch (err) {
		console.error(err);
		res.status(500).json({ error: "เกิดข้อผิดพลาดในระบบ" });
	}
});

// POST /api/ot-records  { year, month, records: [{employeeId, day, planOT15, planOT3, actualOT15, actualOT3, leaveType, leaveReason, shiftType}] }
app.post("/api/ot-records", requireAuth, async (req, res) => {
	const { year, month, records } = req.body || {};
	if (!year || !month || !Array.isArray(records)) {
		return res.status(400).json({ error: "ข้อมูลไม่ถูกต้อง" });
	}

	try {
		const allowedIds = new Set(await getEditableEmployeeIds(req.user));
		const invalid = records.some((r) => !allowedIds.has(Number(r.employeeId)));
		if (invalid) return res.status(403).json({ error: "ไม่มีสิทธิ์บันทึกข้อมูลของพนักงานบางรายการ" });

		const client = await pool.connect();
		try {
			await client.query("BEGIN");
			for (const r of records) {
				await client.query(
					`INSERT INTO ot_records
					   (employee_id, year, month, day, plan_ot15, plan_ot3, actual_ot15, actual_ot3, leave_type, leave_reason, shift_type, updated_at)
					 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, now())
					 ON CONFLICT (employee_id, year, month, day) DO UPDATE SET
					   plan_ot15 = EXCLUDED.plan_ot15, plan_ot3 = EXCLUDED.plan_ot3,
					   actual_ot15 = EXCLUDED.actual_ot15, actual_ot3 = EXCLUDED.actual_ot3,
					   leave_type = EXCLUDED.leave_type, leave_reason = EXCLUDED.leave_reason,
					   shift_type = EXCLUDED.shift_type, updated_at = now()`,
					[
						r.employeeId, year, month, r.day,
						r.planOT15 || 0, r.planOT3 || 0, r.actualOT15 || 0, r.actualOT3 || 0,
						r.leaveType || "", r.leaveReason || "", r.shiftType || ""
					]
				);
			}
			await client.query("COMMIT");
			res.json({ success: true });
		} catch (err) {
			await client.query("ROLLBACK");
			throw err;
		} finally {
			client.release();
		}
	} catch (err) {
		console.error(err);
		res.status(500).json({ error: "เกิดข้อผิดพลาดในระบบ" });
	}
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`OT API server listening on port ${PORT}`));
