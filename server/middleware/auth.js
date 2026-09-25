const jwt = require("jsonwebtoken");

function requireAuth(req, res, next) {
	const header = req.headers.authorization || "";
	const token = header.startsWith("Bearer ") ? header.slice(7) : null;
	if (!token) return res.status(401).json({ error: "ไม่พบ token กรุณาเข้าสู่ระบบ" });

	try {
		req.user = jwt.verify(token, process.env.JWT_SECRET);
		next();
	} catch (err) {
		return res.status(401).json({ error: "Token ไม่ถูกต้องหรือหมดอายุ" });
	}
}

function requireRole(...roles) {
	return (req, res, next) => {
		if (!req.user || !roles.includes(req.user.role)) {
			return res.status(403).json({ error: "ไม่มีสิทธิ์เข้าถึงข้อมูลนี้" });
		}
		next();
	};
}

module.exports = { requireAuth, requireRole };
