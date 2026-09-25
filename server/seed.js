require("dotenv").config();
const bcrypt = require("bcrypt");
const { pool } = require("./db");

// รายชื่อพนักงานตัวอย่างตามเงื่อนไข: หัวหน้า 2 คน x ลูกน้อง 3 คน + admin 1 คน
// password ของทุกคน = employee_code (ตามเงื่อนไขข้อ 1)
const ADMIN = { code: "ADMIN01", name: "ผู้ดูแลระบบ", rank: "Admin", teamKey: "friSat", role: "admin" };

const SUPERVISORS = [
	{ code: "SUP001", name: "สมชาย หัวหน้าทีม A", teamKey: "friSat" },
	{ code: "SUP002", name: "สมหญิง หัวหน้าทีม B", teamKey: "sunMon" }
];

const EMPLOYEES_BY_SUPERVISOR = {
	SUP001: [
		{ code: "EMP001", name: "พนักงาน A1" },
		{ code: "EMP002", name: "พนักงาน A2" },
		{ code: "EMP003", name: "พนักงาน A3" }
	],
	SUP002: [
		{ code: "EMP004", name: "พนักงาน B1" },
		{ code: "EMP005", name: "พนักงาน B2" },
		{ code: "EMP006", name: "พนักงาน B3" }
	]
};

async function upsertEmployee(client, { code, name, rank = "Tech", teamKey, role, supervisorId = null, mustChangePassword = true }) {
	const passwordHash = await bcrypt.hash(code, 10);
	const result = await client.query(
		`INSERT INTO employees (employee_code, name, rank, team_key, role, supervisor_id, password_hash, must_change_password)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		 ON CONFLICT (employee_code) DO UPDATE
		   SET name = EXCLUDED.name, rank = EXCLUDED.rank, team_key = EXCLUDED.team_key,
		       role = EXCLUDED.role, supervisor_id = EXCLUDED.supervisor_id
		 RETURNING id`,
		[code, name, rank, teamKey, role, supervisorId, passwordHash, mustChangePassword]
	);
	return result.rows[0].id;
}

async function main() {
	const client = await pool.connect();
	try {
		await client.query("BEGIN");

		await upsertEmployee(client, { ...ADMIN, role: "admin", mustChangePassword: false });

		for (const sup of SUPERVISORS) {
			const supId = await upsertEmployee(client, { ...sup, role: "supervisor" });

			for (const emp of EMPLOYEES_BY_SUPERVISOR[sup.code]) {
				await upsertEmployee(client, { ...emp, teamKey: sup.teamKey, role: "employee", supervisorId: supId });
			}
		}

		await client.query("COMMIT");
		console.log("Seed completed: 1 admin, 2 supervisors, 6 employees (password = employee_code).");
	} catch (err) {
		await client.query("ROLLBACK");
		console.error("Seed failed:", err);
		process.exitCode = 1;
	} finally {
		client.release();
		await pool.end();
	}
}

main();
