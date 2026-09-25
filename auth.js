// Shared client-side auth helper used by login.html, change-password.html, ot.html
(function () {
	const API_BASE = window.OT_API_BASE || `${window.location.protocol}//${window.location.hostname}:3001`;
	const TOKEN_KEY = "ot-auth-token";
	const USER_KEY = "ot-auth-user";

	async function login(username, password) {
		const res = await fetch(`${API_BASE}/api/auth/login`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ username, password })
		});
		const data = await res.json();
		if (!res.ok) throw new Error(data.error || "เข้าสู่ระบบไม่สำเร็จ");

		sessionStorage.setItem(TOKEN_KEY, data.token);
		sessionStorage.setItem(USER_KEY, JSON.stringify(data.user));
		return data;
	}

	async function changePassword(oldPassword, newPassword) {
		const res = await authFetch("/api/auth/change-password", {
			method: "POST",
			body: JSON.stringify({ oldPassword, newPassword })
		});
		return res;
	}

	function logout() {
		sessionStorage.removeItem(TOKEN_KEY);
		sessionStorage.removeItem(USER_KEY);
		window.location.href = "login.html";
	}

	function getToken() {
		return sessionStorage.getItem(TOKEN_KEY);
	}

	function getUser() {
		const raw = sessionStorage.getItem(USER_KEY);
		return raw ? JSON.parse(raw) : null;
	}

	// เรียกใช้บนหน้าที่ต้อง login (ot.html, change-password.html) — ถ้าไม่มี token จะเด้งไป login.html
	function requireLogin() {
		if (!getToken()) {
			window.location.href = "login.html";
			return null;
		}
		return getUser();
	}

	// wrapper fetch ที่แนบ Authorization header ให้อัตโนมัติ + จัดการ 401 (token หมดอายุ)
	async function authFetch(path, options = {}) {
		const token = getToken();
		const res = await fetch(`${API_BASE}${path}`, {
			...options,
			headers: {
				"Content-Type": "application/json",
				...(options.headers || {}),
				...(token ? { Authorization: `Bearer ${token}` } : {})
			}
		});

		if (res.status === 401) {
			logout();
			throw new Error("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่");
		}

		const data = await res.json().catch(() => ({}));
		if (!res.ok) throw new Error(data.error || "เกิดข้อผิดพลาด");
		return data;
	}

	window.OTAuth = { login, changePassword, logout, getToken, getUser, requireLogin, authFetch, API_BASE };
})();
