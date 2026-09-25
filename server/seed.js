require("dotenv").config();
const bcrypt = require("bcrypt");
const { pool } = require("./db");

// รายชื่อพนักงานตัวอย่างตามเงื่อนไข: หัวหน้า 2 คน + ลูกน้อง 7 คน + admin 1 คน
// password ของทุกคน = employee_code (ตามเงื่อนไขข้อ 1)
const ADMIN = { code: "Admin", name: "Admin", rank: "Admin", teamKey: ["friSat", "sunMon", "satSun"], role: "admin" };

const SUPERVISORS = [
	{ code: "1770", name: "ณรงฤทธิ์", teamKey: ["friSat", "sunMon", "satSun"] },
	{ code: "3339", name: "รติรส", teamKey: ["friSat", "sunMon", "satSun"] },
	{ code: "4153", name: "อภิสิทธ์", teamKey: ["friSat", "sunMon", "satSun"] }
];

const EMPLOYEES_BY_SUPERVISOR = {
	1770: [
		{ code: "4324", name: "ไชยา", teamKey: "friSat" },
		{ code: "1220", name: "เบญจ์", teamKey: "friSat" },
		{ code: "4204", name: "ชนะชัย", teamKey: "friSat" }
	],
	4153: [
		{ code: "3762", name: "กรกช", teamKey: "sunMon" },
		{ code: "4033", name: "สุเทพ", teamKey: "sunMon" },
		{ code: "4205", name: "นันทวัฒน์", teamKey: "sunMon" },
		{ code: "4221", name: "ธนากร", teamKey: "sunMon" }
	],
	3339: []
};

const normalizeTeamKey = (teamKey) => Array.isArray(teamKey) ? teamKey[0] : teamKey;

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

		await upsertEmployee(client, { ...ADMIN, teamKey: normalizeTeamKey(ADMIN.teamKey), role: "admin", mustChangePassword: false });

		for (const sup of SUPERVISORS) {
			const teamKeys = Array.isArray(sup.teamKey) ? sup.teamKey : [sup.teamKey];

			for (const teamKey of teamKeys) {
				const supId = await upsertEmployee(client, { ...sup, teamKey, role: "supervisor" });

				for (const emp of EMPLOYEES_BY_SUPERVISOR[sup.code] || []) {
					await upsertEmployee(client, {
						...emp,
						teamKey: emp.teamKey || teamKey,
						role: "employee",
						supervisorId: supId
					});
				}
			}
		}

		await client.query("COMMIT");
		console.log("Seed completed: 1 admin, 3 supervisors, 7 employees (password = employee_code).");
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
