require("dotenv").config();
const { Pool } = require("pg");

// ใช้ connection pool เดียวทั้งแอป, ค่าถูกอ่านจาก env (ห้าม hardcode credential ในโค้ด)
const pool = new Pool({
	host: process.env.PGHOST,
	port: Number(process.env.PGPORT || 5432),
	user: process.env.PGUSER,
	password: process.env.PGPASSWORD,
	database: process.env.PGDATABASE
});

module.exports = { pool };
