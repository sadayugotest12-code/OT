// ต้อง login ก่อนถึงจะใช้หน้านี้ได้ (redirect ไป login.html ถ้าไม่มี token)
const currentUser = window.OTAuth ? window.OTAuth.requireLogin() : null;

// ====== Configuration: ดูแลง่าย แก้ได้ในจุดเดียว ======
// weekday index: 0=Sun, 1=Mon, ... 5=Fri, 6=Sat
const TEAM_CONFIG = {
	friSat: { key: "friSat", name: "Maintenance1", label: "(Fri-Sat)", offDays: [5, 6], colorClass: "team-friSat" },
	sunMon: { key: "sunMon", name: "Maintenance2", label: "(Sun-Mon)", offDays: [0, 1], colorClass: "team-sunMon" }
};

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES_TH = [
	"มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
	"กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"
];

const state = {
	year: new Date().getFullYear(),
	month: new Date().getMonth(),
	employees: [],
	activeTab: "plan",
	activeSubTab: "monthly",
	monthlySelectedEmpId: null,
	teamMonthOffDatesByMonth: {
		[getMonthKey(new Date().getFullYear(), new Date().getMonth())]: {
			friSat: [12, 13],
			sunMon: []
		}
	},
	teamMonthOffDates: {
		friSat: [12, 13],
		sunMon: []
	}
};

const STORAGE_KEY = "ot-app-state-v1";
const DATA_FOLDER_NAME = "data";
const DATA_FILE_NAME = "ot-data.json";
const DB_NAME = "ot-folder-store";
const DB_STORE = "handles";
const DB_KEY = "dataDirHandle";

let dataDirHandle = null;
let lastLoadedJson = "";
let autoSyncTimer = null;

const els = {
	pageTitle: document.getElementById("pageTitle"),
	yearSelect: document.getElementById("yearSelect"),
	monthSelect: document.getElementById("monthSelect"),
	monthlyTableWrap: document.getElementById("monthlyTableWrap"),
	monthlyEmployeeSelect: document.getElementById("monthlyEmployeeSelect"),
	teamConfigWrap: document.getElementById("teamConfigWrap"),
	dailyDate: document.getElementById("dailyDate"),
	dailyTableWrap: document.getElementById("dailyTableWrap"),
	reportTableWrap: document.getElementById("reportTableWrap"),
	summaryGrid: document.getElementById("summaryGrid"),
	btnConfirmMonthly: document.getElementById("btnConfirmMonthly"),
	btnConfirmDaily: document.getElementById("btnConfirmDaily"),
	btnConnectDataFolder: document.getElementById("btnConnectDataFolder"),
	btnReloadFromFile: document.getElementById("btnReloadFromFile"),
	folderStatus: document.getElementById("folderStatus")
};

function updatePageTitle() {
	const teamName = TEAM_CONFIG[currentUser?.teamKey]?.name || "Unknown Team";
	const title = `Plan Overtime of ${teamName}`;
	if (els.pageTitle) els.pageTitle.textContent = title;
	document.title = title;
}

function getDaysInMonth(year, month) {
	return new Date(year, month + 1, 0).getDate();
}

function formatLocalDateInputValue(date) {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

function dateOfDay(day) {
	return new Date(state.year, state.month, day);
}

function dayKey(day) {
	return String(day);
}

function getMonthKey(year, month) {
	return `${year}-${String(month + 1).padStart(2, "0")}`;
}

function createEmptyMonthTeamOffDates() {
	return { friSat: [], sunMon: [] };
}

function normalizeMonthTeamOffDates(data) {
	return {
		friSat: Array.isArray(data?.friSat) ? Array.from(new Set(data.friSat.map((d) => Number(d)).filter((d) => Number.isInteger(d) && d >= 1))).sort((a, b) => a - b) : [],
		sunMon: Array.isArray(data?.sunMon) ? Array.from(new Set(data.sunMon.map((d) => Number(d)).filter((d) => Number.isInteger(d) && d >= 1))).sort((a, b) => a - b) : []
	};
}

function getCurrentMonthKey() {
	return getMonthKey(state.year, state.month);
}

function getCurrentMonthLeave(emp) {
	if (!emp.leaveByMonth || typeof emp.leaveByMonth !== "object") {
		emp.leaveByMonth = { [getCurrentMonthKey()]: emp.leave || {} };
	}
	if (!emp.leaveByMonth[getCurrentMonthKey()]) {
		emp.leaveByMonth[getCurrentMonthKey()] = {};
	}
	return emp.leaveByMonth[getCurrentMonthKey()];
}

function getMonthTeamOffDates(monthKey = getCurrentMonthKey()) {
	return normalizeMonthTeamOffDates(state.teamMonthOffDatesByMonth[monthKey] || createEmptyMonthTeamOffDates());
}

function setCurrentMonthTeamOffDates(data) {
	state.teamMonthOffDates = normalizeMonthTeamOffDates(data);
	state.teamMonthOffDatesByMonth[getCurrentMonthKey()] = JSON.parse(JSON.stringify(state.teamMonthOffDates));
}

function saveCurrentMonthTeamOffDates() {
	state.teamMonthOffDatesByMonth[getCurrentMonthKey()] = JSON.parse(JSON.stringify(state.teamMonthOffDates));
}

function toNum(v) {
	const n = Number(v);
	return Number.isFinite(n) ? n : 0;
}

function clampOt(v) {
	return Math.max(0, Math.min(24, Math.round(toNum(v) * 2) / 2));
}

function randomPick(arr) {
	return arr[Math.floor(Math.random() * arr.length)];
}

function getTeamMonthOffDates(teamKey) {
	return state.teamMonthOffDates[teamKey] || [];
}

function getOffDaysForEmployee(emp) {
	return TEAM_CONFIG[emp.teamKey]?.offDays || [];
}

function isHoliday(emp, day) {
	const weekday = dateOfDay(day).getDay();
	const baseOff = getOffDaysForEmployee(emp).includes(weekday);
	const monthOff = getTeamMonthOffDates(emp.teamKey).includes(day);
	return baseOff || monthOff;
}

function isCustomHoliday(emp, day) {
	return false;
}

function getLeaveType(emp, day) {
	return getCurrentMonthLeave(emp)[dayKey(day)]?.type || "";
}

function getLeaveReason(emp, day) {
	return getCurrentMonthLeave(emp)[dayKey(day)]?.reason || "";
}

function getShiftType(emp, day) {
	return emp.shift?.[dayKey(day)] || "";
}

function setShift(emp, day, shiftType) {
	if (!emp.shift) emp.shift = {};
	const key = dayKey(day);
	const next = String(shiftType || "").trim().toUpperCase();
	if (!next || !["D", "N"].includes(next)) {
		delete emp.shift[key];
		return;
	}
	emp.shift[key] = next;
}

function setLeave(emp, day, leaveType, reason) {
	const leave = getCurrentMonthLeave(emp);
	const key = dayKey(day);
	if (!leaveType) {
		delete leave[key];
		return;
	}
	leave[key] = { type: leaveType, reason: reason || "" };
	emp.actualOT15[key] = 0;
	emp.actualOT3[key] = 0;
}

function getWeekBucket(day) {
	const d = dateOfDay(day);
	const mondayOffset = (d.getDay() + 6) % 7;
	const monday = new Date(d);
	monday.setDate(d.getDate() - mondayOffset);
	const y = monday.getFullYear();
	const m = String(monday.getMonth() + 1).padStart(2, "0");
	const dd = String(monday.getDate()).padStart(2, "0");
	return `${y}-${m}-${dd}`;
}

function dayPlanTotal(emp, day) {
	const key = dayKey(day);
	return toNum(emp.planOT15[key]) + toNum(emp.planOT3[key]);
}

function dayActualTotal(emp, day) {
	if (getLeaveType(emp, day)) return 0;
	const key = dayKey(day);
	return toNum(emp.actualOT15[key]) + toNum(emp.actualOT3[key]);
}

function parseDateList(text) {
	const days = getDaysInMonth(state.year, state.month);
	return Array.from(new Set(String(text || "")
		.split(/[\s,]+/)
		.map((n) => Number(n))
		.filter((n) => Number.isInteger(n) && n >= 1 && n <= days))).sort((a, b) => a - b);
}

function formatDateList(arr) {
	return (arr || []).join(", ");
}

function cloneStateForStorage() {
	return {
		year: state.year,
		month: state.month,
		activeTab: state.activeTab,
		activeSubTab: state.activeSubTab,
		teamMonthOffDatesByMonth: JSON.parse(JSON.stringify(state.teamMonthOffDatesByMonth)),
		employees: JSON.parse(JSON.stringify(state.employees))
	};
}

function buildStoredPayload(scope) {
	return {
		meta: {
			source: "OT Planner",
			scope,
			savedAt: new Date().toISOString(),
			year: state.year,
			month: state.month,
			monthName: MONTH_NAMES_TH[state.month]
		},
		settings: {
			activeTab: state.activeTab,
			activeSubTab: state.activeSubTab,
			teamMonthOffDatesByMonth: state.teamMonthOffDatesByMonth
		},
		employees: state.employees,
		summary: {
			employees: state.employees.length,
			planTotal: state.employees.reduce((sum, emp) => sum + employeeStats(emp).planTotal, 0),
			actualTotal: state.employees.reduce((sum, emp) => sum + employeeStats(emp).actualTotal, 0)
		}
	};
}

function persistStateToLocalStorage() {
	try {
		saveCurrentMonthTeamOffDates();
		localStorage.setItem(STORAGE_KEY, JSON.stringify(buildStoredPayload("localStorage")));
	} catch (err) {
		console.warn("Unable to persist OT state", err);
	}
}

function persistState() {
	persistStateToLocalStorage();
}

function setFolderStatus(text, mode) {
	if (!els.folderStatus) return;
	els.folderStatus.textContent = text;
	els.folderStatus.dataset.mode = mode || "idle";
}

function supportsFolderAccess() {
	return typeof window.showDirectoryPicker === "function";
}

function openFolderDb() {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, 1);
		request.onupgradeneeded = () => {
			const db = request.result;
			if (!db.objectStoreNames.contains(DB_STORE)) {
				db.createObjectStore(DB_STORE);
			}
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

async function saveFolderHandle(handle) {
	const db = await openFolderDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(DB_STORE, "readwrite");
		tx.objectStore(DB_STORE).put(handle, DB_KEY);
		tx.oncomplete = () => resolve(true);
		tx.onerror = () => reject(tx.error);
	});
}

async function loadFolderHandle() {
	try {
		const db = await openFolderDb();
		return await new Promise((resolve, reject) => {
			const tx = db.transaction(DB_STORE, "readonly");
			const request = tx.objectStore(DB_STORE).get(DB_KEY);
			request.onsuccess = () => resolve(request.result || null);
			request.onerror = () => reject(request.error);
		});
	} catch (err) {
		console.warn("Unable to load folder handle", err);
		return null;
	}
}

// ลบ handle ที่ค้างไว้เมื่อสิทธิ์ถูกปฏิเสธถาวร เพื่อให้ครั้งถัดไป showDirectoryPicker ถามใหม่แทนที่จะเงียบล้มเหลวซ้ำๆ
async function clearFolderHandle() {
	try {
		const db = await openFolderDb();
		await new Promise((resolve, reject) => {
			const tx = db.transaction(DB_STORE, "readwrite");
			tx.objectStore(DB_STORE).delete(DB_KEY);
			tx.oncomplete = () => resolve(true);
			tx.onerror = () => reject(tx.error);
		});
	} catch (err) {
		console.warn("Unable to clear folder handle", err);
	}
	dataDirHandle = null;
}

async function verifyFolderPermission(handle, requestWritePermission = false) {
	if (!handle) return false;
	const options = requestWritePermission ? { mode: "readwrite" } : { mode: "read" };
	if (await handle.queryPermission(options) === "granted") return true;
	if (!requestWritePermission) return false;
	return (await handle.requestPermission(options)) === "granted";
}

function normalizeAndApplySavedState(saved) {
	if (!saved || typeof saved !== "object") return false;

	const meta = saved.meta || {};
	const settings = saved.settings || {};
	const monthKey = getMonthKey(
		Number.isFinite(saved.year) ? saved.year : Number.isFinite(meta.year) ? meta.year : state.year,
		Number.isFinite(saved.month) ? saved.month : Number.isFinite(meta.month) ? meta.month : state.month
	);

	if (Number.isFinite(saved.year)) state.year = saved.year;
	else if (Number.isFinite(meta.year)) state.year = meta.year;

	if (Number.isFinite(saved.month)) state.month = saved.month;
	else if (Number.isFinite(meta.month)) state.month = meta.month;

	const activeTab = saved.activeTab || settings.activeTab;
	if (activeTab === "plan" || activeTab === "report") state.activeTab = activeTab;

	const activeSubTab = saved.activeSubTab || settings.activeSubTab;
	if (activeSubTab === "monthly" || activeSubTab === "daily") state.activeSubTab = activeSubTab;

	const teamMonthOffDatesByMonth = settings.teamMonthOffDatesByMonth || saved.teamMonthOffDatesByMonth;
	if (teamMonthOffDatesByMonth && typeof teamMonthOffDatesByMonth === "object") {
		state.teamMonthOffDatesByMonth = {};
		Object.keys(teamMonthOffDatesByMonth).forEach((key) => {
			state.teamMonthOffDatesByMonth[key] = normalizeMonthTeamOffDates(teamMonthOffDatesByMonth[key]);
		});
	} else if (saved.teamMonthOffDates && typeof saved.teamMonthOffDates === "object") {
		state.teamMonthOffDatesByMonth = {
			[monthKey]: normalizeMonthTeamOffDates(saved.teamMonthOffDates)
		};
	}

	const savedEmployees = Array.isArray(saved.employees) ? saved.employees : [];
	if (savedEmployees.length) {
		state.employees = savedEmployees.map((emp, idx) => ({
			id: Number(emp.id) || idx + 1,
			code: emp.code || `E${idx + 1}`,
			name: emp.name || `Emp ${idx + 1}`,
			rank: emp.rank || "-",
			teamKey: TEAM_CONFIG[emp.teamKey] ? emp.teamKey : "friSat",
			customOffDays: [],
			planOT15: emp.planOT15 || {},
			planOT3: emp.planOT3 || {},
			actualOT15: emp.actualOT15 || {},
			actualOT3: emp.actualOT3 || {},
			leave: emp.leave || {},
			leaveByMonth: emp.leaveByMonth,
			shift: emp.shift || {}
		}));
	}

	const storedJson = JSON.stringify(saved);
	lastLoadedJson = storedJson;
	if (!state.teamMonthOffDatesByMonth[monthKey]) {
		state.teamMonthOffDatesByMonth[monthKey] = createEmptyMonthTeamOffDates();
	}
	state.teamMonthOffDates = getMonthTeamOffDates(monthKey);
	state.teamMonthOffDatesByMonth[monthKey] = JSON.parse(JSON.stringify(state.teamMonthOffDates));
	return true;
}

function loadPersistedStateFromLocalStorage() {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return false;
		const saved = JSON.parse(raw);
		return normalizeAndApplySavedState(saved);
	} catch (err) {
		console.warn("Unable to load persisted OT state", err);
		return false;
	}
}

async function ensureFolderHandle(requestAccess = false) {
	if (!supportsFolderAccess()) return null;
	if (!dataDirHandle) {
		dataDirHandle = await loadFolderHandle();
	}
	if (!dataDirHandle && requestAccess) {
		dataDirHandle = await window.showDirectoryPicker({ mode: "readwrite" });
		await saveFolderHandle(dataDirHandle);
	}
	if (!dataDirHandle) return null;
	const granted = await verifyFolderPermission(dataDirHandle, requestAccess);
	if (!granted) {
		// สิทธิ์ของ handle เดิมถูกปฏิเสธ (เช่น หลังรีสตาร์ทเบราว์เซอร์) ล้างทิ้งเพื่อให้กดบันทึก/เชื่อมโฟลเดอร์ครั้งถัดไปถามสิทธิ์ใหม่
		if (requestAccess) await clearFolderHandle();
		return null;
	}
	return dataDirHandle;
}

async function getDataFolderHandle(requestAccess = false) {
	const rootHandle = await ensureFolderHandle(requestAccess);
	if (!rootHandle) return null;
	if (rootHandle.name === DATA_FOLDER_NAME) return rootHandle;
	return rootHandle.getDirectoryHandle(DATA_FOLDER_NAME, { create: true });
}

async function readJsonFromFolder() {
	const handle = await getDataFolderHandle(false);
	if (!handle) return null;
	try {
		const fileHandle = await handle.getFileHandle(DATA_FILE_NAME);
		const file = await fileHandle.getFile();
		const raw = await file.text();
		if (!raw.trim()) return null;
		return raw;
	} catch (err) {
		if (err && err.name !== "NotFoundError") {
			console.warn("Unable to read data file", err);
		}
		return null;
	}
}

async function writeJsonToFolder(scope) {
	const handle = await getDataFolderHandle(true);
	if (!handle) return false;

	const payload = buildStoredPayload(scope);
	const fileHandle = await handle.getFileHandle(DATA_FILE_NAME, { create: true });
	const writable = await fileHandle.createWritable();
	await writable.write(JSON.stringify(payload, null, 2));
	await writable.close();
	persistStateToLocalStorage();
	setFolderStatus(`บันทึกลง ${DATA_FILE_NAME} แล้ว`, "ok");
	return true;
}

async function syncFromFolder({ silent = false } = {}) {
	const raw = await readJsonFromFolder();
	if (!raw) {
		if (!silent) setFolderStatus("ไม่พบไฟล์ ot-data.json ในโฟลเดอร์", "warn");
		return false;
	}
	if (raw === lastLoadedJson) {
		if (!silent) setFolderStatus(`อ่านไฟล์ล่าสุดแล้ว (${DATA_FILE_NAME})`, "ok");
		return true;
	}

	let saved;
	try {
		saved = JSON.parse(raw);
	} catch (err) {
		if (!silent) setFolderStatus("ไฟล์ JSON อ่านไม่ได้", "warn");
		return false;
	}

	const rosterBeforeSync = state.employees;
	normalizeAndApplySavedState(saved);
	// รักษา roster (\u0e23\u0e32\u0e22\u0e0a\u0e37\u0e48\u0e2d\u0e17\u0e35\u0e48\u0e16\u0e39\u0e01\u0e01\u0e23\u0e2d\u0e07\u0e15\u0e32\u0e21 role \u0e08\u0e32\u0e01 backend) \u0e44\u0e27\u0e49 \u0e41\u0e25\u0e49\u0e27\u0e14\u0e36\u0e07\u0e40\u0e09\u0e1e\u0e32\u0e30\u0e04\u0e48\u0e32 OT/\u0e25\u0e32/\u0e01\u0e30 \u0e08\u0e32\u0e01\u0e44\u0e1f\u0e25\u0e4c\u0e21\u0e32\u0e2d\u0e31\u0e1b\u0e40\u0e14\u0e15 \u0e40\u0e1e\u0e37\u0e48\u0e2d\u0e01\u0e31\u0e19\u0e44\u0e1f\u0e25\u0e4c\u0e17\u0e35\u0e48\u0e43\u0e0a\u0e49\u0e23\u0e48\u0e27\u0e21\u0e01\u0e31\u0e19\u0e17\u0e33\u0e43\u0e2b\u0e49\u0e04\u0e19\u0e2d\u0e37\u0e48\u0e19\u0e17\u0e35\u0e21/\u0e40\u0e1e\u0e37\u0e48\u0e2d\u0e19\u0e23\u0e48\u0e27\u0e21\u0e07\u0e32\u0e19\u0e42\u0e1c\u0e25\u0e48\u0e40\u0e02\u0e49\u0e32\u0e21\u0e32\u0e0b\u0e49\u0e33
	if (rosterBeforeSync.length) {
		state.employees = mergeOtDataIntoRoster(dedupeEmployeesByCode(rosterBeforeSync), state.employees);
	} else {
		state.employees = dedupeEmployeesByCode(state.employees);
	}
	state.employees.forEach(normalizeEmployeeMonthData);
	els.yearSelect.value = String(state.year);
	els.monthSelect.value = String(state.month);
	initDailyDate();
	renderAll();
	lastLoadedJson = raw;
	if (!silent) setFolderStatus(`อัปเดตจาก ${DATA_FILE_NAME} แล้ว`, "ok");
	persistStateToLocalStorage();
	return true;
}

async function connectDataFolder() {
	if (!supportsFolderAccess()) {
		window.alert("เบราว์เซอร์นี้ไม่รองรับการเขียนไฟล์ลงโฟลเดอร์โดยตรง");
		return;
	}

	dataDirHandle = await ensureFolderHandle(true);
	if (!dataDirHandle) return;
	setFolderStatus(`เชื่อมโฟลเดอร์โปรแกรมแล้ว และใช้โฟลเดอร์ ${DATA_FOLDER_NAME}`, "ok");
	const loaded = await syncFromFolder({ silent: true });
	if (!loaded) {
		await writeJsonToFolder("monthly");
		await syncFromFolder({ silent: true });
	}
}

function startAutoSync() {
	if (autoSyncTimer) clearInterval(autoSyncTimer);
	autoSyncTimer = setInterval(() => {
		if (!dataDirHandle || document.hidden) return;
		syncFromFolder({ silent: true }).catch((err) => console.warn("Auto sync failed", err));
	}, 5000);
}

async function saveSnapshot(scope) {
	persistStateToLocalStorage();
	try {
		const success = await writeJsonToFolder(scope);
		if (success) {
			await syncFromFolder({ silent: true });
			window.alert("บันทึกข้อมูลลงไฟล์เรียบร้อย");
		} else {
			setFolderStatus("ยังไม่ได้เชื่อมโฟลเดอร์ (สิทธิ์หมดอายุหรือยังไม่เชื่อม) กรุณากดปุ่มเชื่อมโฟลเดอร์อีกครั้ง", "warn");
			window.alert("บันทึกข้อมูลในเว็บเรียบร้อย แต่ยังไม่ได้เชื่อมโฟลเดอร์โปรแกรม กรุณากดปุ่ม \"เชื่อมโฟลเดอร์\" ใหม่อีกครั้ง (สิทธิ์การเข้าถึงโฟลเดอร์อาจหมดอายุ เช่น หลังปิด-เปิดเบราว์เซอร์ใหม่)");
		}
	} catch (err) {
		console.error("Unable to save OT snapshot", err);
		window.alert("บันทึกข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
	}
}

function loadPersistedState() {
	return loadPersistedStateFromLocalStorage();
}

function buildMockEmployees() {
	const seeds = [
		["A1", "A", "Tech", "friSat"],
		["A2", "B", "Tech", "friSat"],
		["A3", "C", "Tech", "friSat"],
		["A4", "D", "Tech", "friSat"],
		["A5", "AA", "Tech", "sunMon"],
		["A6", "BB", "Tech", "sunMon"],
		["A7", "CC", "Tech", "sunMon"],
		["A8", "DD", "Tech", "sunMon"],
		["A9", "AB", "Fore", "friSat"],
		["A10", "AC", "Eng", "sunMon"],
		["A11", "AD", "Center", "friSat"]
	];

	const days = getDaysInMonth(state.year, state.month);

	return seeds.map((seed, index) => {
		const [code, name, rank, teamKey] = seed;
		const emp = {
			id: index + 1,
			code,
			name,
			rank,
			teamKey,
			customOffDays: [],
			planOT15: {},
			planOT3: {},
			actualOT15: {},
			actualOT3: {},
			leave: {},
			shift: {}
		};

		for (let day = 1; day <= days; day += 1) {
			emp.planOT15[dayKey(day)] = 0;
			emp.planOT3[dayKey(day)] = 0;
			emp.actualOT15[dayKey(day)] = 0;
			emp.actualOT3[dayKey(day)] = 0;
		}

		return emp;
	});
}

function resetOtValuesToZero() {
	const days = getDaysInMonth(state.year, state.month);
	state.employees.forEach((emp) => {
		for (let day = 1; day <= days; day += 1) {
			const key = dayKey(day);
			emp.planOT15[key] = 0;
			emp.planOT3[key] = 0;
			emp.actualOT15[key] = 0;
			emp.actualOT3[key] = 0;
		}
	});
	persistState();
}

function normalizeEmployeeMonthData(emp) {
	const days = getDaysInMonth(state.year, state.month);
	for (let day = 1; day <= days; day += 1) {
		const key = dayKey(day);
		if (emp.planOT15[key] == null) emp.planOT15[key] = 0;
		if (emp.planOT3[key] == null) emp.planOT3[key] = 0;
		if (emp.actualOT15[key] == null) emp.actualOT15[key] = 0;
		if (emp.actualOT3[key] == null) emp.actualOT3[key] = 0;
	}
	["planOT15", "planOT3", "actualOT15", "actualOT3"].forEach((field) => {
		Object.keys(emp[field]).forEach((k) => {
			if (Number(k) > days) delete emp[field][k];
		});
	});
	const currentMonthLeave = getCurrentMonthLeave(emp);
	Object.keys(currentMonthLeave).forEach((k) => {
		if (Number(k) > days) delete currentMonthLeave[k];
	});
	if (!emp.shift) emp.shift = {};
	Object.keys(emp.shift || {}).forEach((k) => {
		if (Number(k) > days) delete emp.shift[k];
		else if (!["D", "N"].includes(String(emp.shift[k]).toUpperCase())) delete emp.shift[k];
	});
}

function initSelectors() {
	const now = new Date();
	const years = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];
	els.yearSelect.innerHTML = years.map((y) => `<option value="${y}">${y}</option>`).join("");
	els.monthSelect.innerHTML = MONTH_NAMES_TH
		.map((name, idx) => `<option value="${idx}">${String(idx + 1).padStart(2, "0")} - ${name}</option>`)
		.join("");
	els.yearSelect.value = String(state.year);
	els.monthSelect.value = String(state.month);
}

function initDailyDate() {
	setDailyDateMinMax();

	const current = new Date();
	const typedValue = els.dailyDate.value;
	const typedDate = typedValue ? new Date(typedValue + "T00:00:00") : null;
	const sameMonth = typedDate && typedDate.getFullYear() === state.year && typedDate.getMonth() === state.month;

	if (sameMonth) {
		els.dailyDate.value = formatLocalDateInputValue(typedDate);
		return;
	}

	const today = new Date(state.year, state.month, Math.min(current.getDate(), getDaysInMonth(state.year, state.month)));
	els.dailyDate.value = formatLocalDateInputValue(today);
}

function setDailyDateMinMax() {
	const first = new Date(state.year, state.month, 1);
	const last = new Date(state.year, state.month, getDaysInMonth(state.year, state.month));
	els.dailyDate.min = formatLocalDateInputValue(first);
	els.dailyDate.max = formatLocalDateInputValue(last);
}

function selectedDayFromDateInput() {
	if (!els.dailyDate.value) return 1;
	const d = new Date(els.dailyDate.value + "T00:00:00");
	if (d.getFullYear() !== state.year || d.getMonth() !== state.month) return 1;
	return d.getDate();
}

function changeMonthYear() {
	saveCurrentMonthTeamOffDates();
	state.year = Number(els.yearSelect.value);
	state.month = Number(els.monthSelect.value);
	state.teamMonthOffDates = getMonthTeamOffDates();
	state.employees.forEach(normalizeEmployeeMonthData);
	initDailyDate();
	persistState();
	renderAll();
}

function renderTeamConfig() {
	const cards = Object.values(TEAM_CONFIG).filter((team) => team.key !== "custom").map((team) => {
		const val = formatDateList(getTeamMonthOffDates(team.key));
		return `
			<div class="team-config-item">
				<div class="label">Team ${team.label} : วันหยุดพิเศษ (วันที่)</div>
				<input type="text" data-action="team-extra-dates" data-team-key="${team.key}" value="${val}" placeholder="เช่น 12, 13, 24">
				<div class="small">มีผลกับพนักงานทุกคนในทีมนี้เฉพาะเดือนที่กำลังดู</div>
			</div>
		`;
	}).join("");
	els.teamConfigWrap.innerHTML = `<div class="team-config-grid">${cards}</div>`;
}

function renderAll() {
	renderTeamConfig();
	renderMonthlyTable();
	renderDailyTable();
	renderReport();
	persistState();
}

function renderMonthlyTable() {
	const days = getDaysInMonth(state.year, state.month);
	const dayHeaders = [];
	for (let day = 1; day <= days; day += 1) {
		const wd = WEEKDAY_SHORT[dateOfDay(day).getDay()];
		dayHeaders.push(`<th class="day-head">${day}<br><span class="small">${wd}</span></th>`);
	}

	if (state.monthlySelectedEmpId == null || !findEmployee(state.monthlySelectedEmpId)) {
		state.monthlySelectedEmpId = state.employees.length ? state.employees[0].id : null;
	}

	if (els.monthlyEmployeeSelect) {
		const empOptions = state.employees
			.map((emp) => `<option value="${emp.id}" ${emp.id === state.monthlySelectedEmpId ? "selected" : ""}>${emp.code} - ${emp.name}</option>`)
			.join("");
		els.monthlyEmployeeSelect.innerHTML = empOptions;
	}

	const visibleEmployees = state.employees.filter((emp) => emp.id === state.monthlySelectedEmpId);

	const rows = visibleEmployees.map((emp, idx) => {
		const dayInputs = [];
		const streakMap = getStreakHighlights(emp);
		for (let day = 1; day <= days; day += 1) {
			const key = dayKey(day);
			const holiday = isHoliday(emp, day);
			const customHoliday = isCustomHoliday(emp, day);
			const leaveType = getLeaveType(emp, day);
			const shift = getShiftType(emp, day);
			const p15 = toNum(emp.planOT15[key]);
			const p3 = toNum(emp.planOT3[key]);
			let streakClass = "";
			if (streakMap[day] === "warn") streakClass = "streak-warn";
			if (streakMap[day] === "danger") streakClass = "streak-danger";

			dayInputs.push(`
				<td class="${holiday ? "holiday" : ""} ${customHoliday ? "custom-holiday" : ""} ${leaveType ? "leave" : ""} ${streakClass}">
					<div class="day-cell-stack">
						${leaveType
							? `<div class="leave-pill">${leaveType}</div>`
							: `<div class="dual-input">
								<select class="day-input mini" data-action="plan15-input" data-emp-id="${emp.id}" data-day="${day}" title="OT 1.5x">
									<option value="" ${p15 === "" ? "selected" : ""}>-</option>
									<option value="1" ${p15 == "1" ? "selected" : ""}>1</option>
									<option value="2" ${p15 == "2" ? "selected" : ""}>2</option>
									<option value="3" ${p15 == "3" ? "selected" : ""}>3</option>
									<option value="4" ${p15 == "4" ? "selected" : ""}>4</option>
									<option value="5" ${p15 == "5" ? "selected" : ""}>5</option>
									<option value="6" ${p15 == "6" ? "selected" : ""}>6</option>
									<option value="7" ${p15 == "7" ? "selected" : ""}>7</option>
									<option value="8" ${p15 == "8" ? "selected" : ""}>8</option>
									<option value="9" ${p15 == "9" ? "selected" : ""}>9</option>
									<option value="10" ${p15 == "10" ? "selected" : ""}>10</option>
								</select>
								<select class="day-input mini" data-action="plan3-input" data-emp-id="${emp.id}" data-day="${day}" title="OT 3x">
									<option value="" ${p3 === "" ? "selected" : ""}>-</option>
									<option value="1" ${p3 == "1" ? "selected" : ""}>1</option>
									<option value="2" ${p3 == "2" ? "selected" : ""}>2</option>
									<option value="3" ${p3 == "3" ? "selected" : ""}>3</option>
									<option value="4" ${p3 == "4" ? "selected" : ""}>4</option>
									<option value="5" ${p3 == "5" ? "selected" : ""}>5</option>
									<option value="6" ${p3 == "6" ? "selected" : ""}>6</option>
									<option value="7" ${p3 == "7" ? "selected" : ""}>7</option>
									<option value="8" ${p3 == "8" ? "selected" : ""}>8</option>
									<option value="9" ${p3 == "9" ? "selected" : ""}>9</option>
									<option value="10" ${p3 == "10" ? "selected" : ""}>10</option>
								</select>
								</div>`}
						<div class="shift-select-wrap">
							<select class="shift-select" data-action="shift-input" data-emp-id="${emp.id}" data-day="${day}" title="กะวัน / กะคืน">
								<option value="" ${shift === "" ? "selected" : ""}>-</option>
								<option value="D" ${shift === "D" ? "selected" : ""}>D</option>
								<option value="N" ${shift === "N" ? "selected" : ""}>N</option>
							</select>
						</div>
					</div>
				</td>
			`);
		}

		const teamOptions = Object.values(TEAM_CONFIG)
			.map((team) => `<option value="${team.key}" ${emp.teamKey === team.key ? "selected" : ""}>${team.label}</option>`)
			.join("");

		return `
			<tr>
				<td class="sticky">${idx + 1}</td>
				<td class="sticky2">${emp.code}</td>
				<td class="sticky3">${emp.name}</td>
				<td class="sticky4">${emp.rank}</td>
				<td class="sticky5">
					<select data-action="team-change" data-emp-id="${emp.id}">${teamOptions}</select>
				</td>
				${dayInputs.join("")}
			</tr>
		`;
	}).join("");

	els.monthlyTableWrap.innerHTML = `
		<table>
			<thead>
				<tr>
					<th class="sticky">No</th>
					<th class="sticky2">Code</th>
					<th class="sticky3">Name</th>
					<th class="sticky4">Rank</th>
					<th class="sticky5">Team</th>
					${dayHeaders.join("")}
				</tr>
				<tr>
					<th class="sticky"></th>
					<th class="sticky2"></th>
					<th class="sticky3"></th>
					<th class="sticky4"></th>
					<th class="sticky5"><span class="small">ช่องรายวัน: ซ้าย = 1.5x, ขวา = 3x</span></th>
					${new Array(days).fill('<th><span class="small">1.5|3</span></th>').join("")}
				</tr>
			</thead>
			<tbody>${rows}</tbody>
		</table>
	`;
}

function renderDailyTable() {
	const day = selectedDayFromDateInput();
	const wd = WEEKDAY_SHORT[dateOfDay(day).getDay()];
	const rows = state.employees.map((emp, idx) => {
		const team = TEAM_CONFIG[emp.teamKey] || TEAM_CONFIG.friSat;
		const holiday = isHoliday(emp, day);
		const customHoliday = isCustomHoliday(emp, day);
		const leaveType = getLeaveType(emp, day);
		const reason = getLeaveReason(emp, day);
		const shift = getShiftType(emp, day);
		const key = dayKey(day);
		const p15 = toNum(emp.planOT15[key]);
		const p3 = toNum(emp.planOT3[key]);
		const a15 = toNum(emp.actualOT15[key]);
		const a3 = toNum(emp.actualOT3[key]);
		const total = leaveType ? 0 : a15 + a3;
		const streakMap = getStreakHighlights(emp);
		let streakClass = "";
		if (streakMap[day] === "warn") streakClass = "streak-warn";
		if (streakMap[day] === "danger") streakClass = "streak-danger";

		return `
			<tr class="${streakClass}">
				<td>${idx + 1}</td>
				<td>${emp.code}</td>
				<td>${emp.name}</td>
				<td>${emp.rank}</td>
				<td><span class="team-tag ${team.colorClass}">${team.label}</span></td>
				<td>
					<select data-action="daily-shift" data-emp-id="${emp.id}" data-day="${day}">
						<option value="" ${shift === "" ? "selected" : ""}>-</option>
						<option value="D" ${shift === "D" ? "selected" : ""}>D</option>
						<option value="N" ${shift === "N" ? "selected" : ""}>N</option>
					</select>
				</td>
				<td class="${holiday ? "holiday" : ""} ${customHoliday ? "custom-holiday" : ""}">${holiday ? "D" : "-"}</td>
				<td>${p15}</td>
				<td>${p3}</td>
				<td>
					<select data-action="daily-leave" data-emp-id="${emp.id}" data-day="${day}">
						<option value="" ${leaveType === "" ? "selected" : ""}>-</option>
						<option value="AL" ${leaveType === "AL" ? "selected" : ""}>AL</option>
						<option value="SL" ${leaveType === "SL" ? "selected" : ""}>SL</option>
						<option value="PL" ${leaveType === "PL" ? "selected" : ""}>PL</option>
					</select>
				</td>
				<td>
					<input class="leave-reason" type="text" data-action="daily-leave-reason" data-emp-id="${emp.id}" data-day="${day}" value="${reason}" placeholder="เหตุผลวันลา" ${leaveType ? "" : "disabled"}>
				</td>
				
				<td>
					<select class="day-input" data-action="daily-actual15" data-emp-id="${emp.id}" data-day="${day}" ${leaveType ? "disabled" : ""}>
						<option value="" ${a15 === "" ? "selected" : ""}>-</option>
						<option value="1" ${a15 == "1" ? "selected" : ""}>1</option>
						<option value="2" ${a15 == "2" ? "selected" : ""}>2</option>
						<option value="3" ${a15 == "3" ? "selected" : ""}>3</option>
						<option value="4" ${a15 == "4" ? "selected" : ""}>4</option>
						<option value="5" ${a15 == "5" ? "selected" : ""}>5</option>
						<option value="6" ${a15 == "6" ? "selected" : ""}>6</option>
						<option value="7" ${a15 == "7" ? "selected" : ""}>7</option>
						<option value="8" ${a15 == "8" ? "selected" : ""}>8</option>
						<option value="9" ${a15 == "9" ? "selected" : ""}>9</option>
						<option value="10" ${a15 == "10" ? "selected" : ""}>10</option>
					</select>
				</td>
				<td>
					<select class="day-input" data-action="daily-actual3" data-emp-id="${emp.id}" data-day="${day}" ${leaveType ? "disabled" : ""}>
						<option value="" ${a3 === "" ? "selected" : ""}>-</option>
						<option value="1" ${a3 == "1" ? "selected" : ""}>1</option>
						<option value="2" ${a3 == "2" ? "selected" : ""}>2</option>
						<option value="3" ${a3 == "3" ? "selected" : ""}>3</option>
						<option value="4" ${a3 == "4" ? "selected" : ""}>4</option>
						<option value="5" ${a3 == "5" ? "selected" : ""}>5</option>
						<option value="6" ${a3 == "6" ? "selected" : ""}>6</option>
						<option value="7" ${a3 == "7" ? "selected" : ""}>7</option>
						<option value="8" ${a3 == "8" ? "selected" : ""}>8</option>
						<option value="9" ${a3 == "9" ? "selected" : ""}>9</option>
						<option value="10" ${a3 == "10" ? "selected" : ""}>10</option>
					</select>
				</td>
				<td><b>${total.toFixed(1)}</b></td>
			</tr>
		`;
	}).join("");

	els.dailyTableWrap.innerHTML = `
		<table>
			<thead>
				<tr>
					<th colspan="13">วันที่ ${day} (${wd}) เดือน ${MONTH_NAMES_TH[state.month]} ${state.year}</th>
				</tr>
				<tr>
					<th>No</th>
					<th>Code</th>
					<th>Name</th>
					<th>Rank</th>
					<th>Team</th>
					<th>Shift</th>
					<th>Holiday</th>
					<th>Plan 1.5x</th>
					<th>Plan 3x</th>
					<th>Leave</th>
					<th>Leave Reason</th>
					<th>Actual 1.5x</th>
					<th>Actual 3x</th>
					<th>Actual Total</th>
				</tr>
			</thead>
			<tbody>${rows}</tbody>
		</table>
	`;

	if (currentUser?.role === "employee") {
		els.dailyTableWrap.querySelectorAll("[data-emp-id]").forEach((input) => {
			input.disabled = Number(input.dataset.empId) !== Number(currentUser.id);
		});
	}
}

function getStreakHighlights(emp) {
	const days = getDaysInMonth(state.year, state.month);
	let streak = 0;
	const marks = {};
	const activeDays = [];

	for (let day = 1; day <= days; day += 1) {
		const leaveType = getLeaveType(emp, day);
		const key = dayKey(day);
		const hasPlannedOt = dayPlanTotal(emp, day) > 0;
		const hasActualOt = toNum(emp.actualOT15[key]) > 0 || toNum(emp.actualOT3[key]) > 0;
		const hasOt = hasPlannedOt || hasActualOt;
		const hasWork = !leaveType && (hasOt || !isHoliday(emp, day));
		if (hasWork) {
			streak += 1;
			activeDays.push(day);
			if (streak >= 6) {
				const level = streak >= 7 ? "danger" : "warn";
				activeDays.forEach((d) => {
					marks[d] = level;
				});
			}
		} else {
			streak = 0;
			activeDays.length = 0;
		}
	}

	return marks;
}

function employeeStats(emp) {
	const days = getDaysInMonth(state.year, state.month);
	let plan15Total = 0;
	let plan3Total = 0;
	let actual15Total = 0;
	let actual3Total = 0;
	let streak = 0;
	let maxStreak = 0;
	const weekTotals = {};

	for (let day = 1; day <= days; day += 1) {
		const key = dayKey(day);
		plan15Total += toNum(emp.planOT15[key]);
		plan3Total += toNum(emp.planOT3[key]);
		const a15 = getLeaveType(emp, day) ? 0 : toNum(emp.actualOT15[key]);
		const a3 = getLeaveType(emp, day) ? 0 : toNum(emp.actualOT3[key]);
		actual15Total += a15;
		actual3Total += a3;
		const total = a15 + a3;
		const hasWorkDay = (!getLeaveType(emp, day) && (a15 > 0 || a3 > 0 || !isHoliday(emp, day)));

		if (hasWorkDay) {
			streak += 1;
			maxStreak = Math.max(maxStreak, streak);
		} else {
			streak = 0;
		}

		const bucket = getWeekBucket(day);
		weekTotals[bucket] = (weekTotals[bucket] || 0) + total;
	}

	const actualTotal = actual15Total + actual3Total;
	const weekAnyOver36 = Object.values(weekTotals).some((v) => v > 36);
	const weekAnyOver32 = Object.values(weekTotals).some((v) => v >= 32);

	return {
		plan15Total, plan3Total,
		planTotal: plan15Total + plan3Total,
		actual15Total, actual3Total,
		actualTotal,
		maxStreak,
		weekAnyOver32,
		weekAnyOver36
	};
}

function buildRemark(stats) {
	let level = "ok";

	if (stats.maxStreak >= 7) {
		level = "danger";
	} else if (stats.maxStreak === 6) {
		level = "warn";
	}

	if (stats.weekAnyOver36) {
		level = "danger";
	} else if (stats.weekAnyOver32) {
		if (level === "ok") level = "warn";
	}

	if (stats.actualTotal > 32) {
		if (level === "ok") level = "warn";
	}

	if (stats.actualTotal > 80) {
		level = "danger";
	}

	if (level === "danger") {
		return { text: "🔴 ช่องสีแดง: เกินกำหนด (เวลาปฏิบัติงานเกินระเบียบข้อบังคับ)", level };
	}
	if (level === "warn") {
		return { text: "🟡 ช่องสีเหลือง: เฝ้าระวัง (ชั่วโมงทำงานใกล้ถึงขีดจำกัดสูงสุด)", level };
	}
	return { text: "ผ่านเกณฑ์", level: "ok" };
}

function renderReport() {
	const days = getDaysInMonth(state.year, state.month);
	const dayHeaders = [];
	for (let day = 1; day <= days; day += 1) {
		const wd = WEEKDAY_SHORT[dateOfDay(day).getDay()];
		dayHeaders.push(`<th class="day-head">${day}<br><span class="small">${wd}</span></th>`);
	}

	const dayTotalsPlan15 = new Array(days).fill(0);
	const dayTotalsPlan3 = new Array(days).fill(0);
	const dayTotalsPlan = new Array(days).fill(0);
	const dayTotalsActual15 = new Array(days).fill(0);
	const dayTotalsActual3 = new Array(days).fill(0);
	const dayTotalsActual = new Array(days).fill(0);
	let overallPlan = 0;
	let overallActual = 0;
	const warningItems = [];
	let overallPlan15 = 0;
	let overallPlan3 = 0;
	let overallActual15 = 0;
	let overallActual3 = 0;

	const rows = state.employees.map((emp, idx) => {
		const stats = employeeStats(emp);
		const remark = buildRemark(stats);
		const team = TEAM_CONFIG[emp.teamKey] || TEAM_CONFIG.friSat;
		const streakMap = getStreakHighlights(emp);
		overallPlan += stats.planTotal;
		overallActual += stats.actualTotal;
		overallPlan15 += stats.plan15Total;
		overallPlan3 += stats.plan3Total;
		overallActual15 += stats.actual15Total;
		overallActual3 += stats.actual3Total;

		if (remark.level !== "ok") {
			warningItems.push({ name: `${emp.code} - ${emp.name}`, text: remark.text, level: remark.level });
		}

		const plan15Cells = [];
		const plan3Cells = [];
		const actualCells = [];
		const shiftCells = [];
		let shiftDayCountD = 0;
		let shiftDayCountN = 0;

		for (let day = 1; day <= days; day += 1) {
			const key = dayKey(day);
			const holiday = isHoliday(emp, day);
			const customHoliday = isCustomHoliday(emp, day);
			const leaveType = getLeaveType(emp, day);
			const shift = getShiftType(emp, day);
			const p15 = toNum(emp.planOT15[key]);
			const p3 = toNum(emp.planOT3[key]);
			const a15 = leaveType ? 0 : toNum(emp.actualOT15[key]);
			const a3 = leaveType ? 0 : toNum(emp.actualOT3[key]);
			const aTotal = a15 + a3;

			dayTotalsPlan15[day - 1] += p15;
			dayTotalsPlan3[day - 1] += p3;
			dayTotalsPlan[day - 1] += (p15 + p3);
			dayTotalsActual15[day - 1] += a15;
			dayTotalsActual3[day - 1] += a3;
			dayTotalsActual[day - 1] += aTotal;

			plan15Cells.push(`<td class="plan-row ${holiday ? "holiday" : ""} ${customHoliday ? "custom-holiday" : ""}"><span class="dual-view">${p15}</span></td>`);
			plan3Cells.push(`<td class="plan-row ${holiday ? "holiday" : ""} ${customHoliday ? "custom-holiday" : ""}"><span class="dual-view">${p3}</span></td>`);
			if (shift === "D") shiftDayCountD += 1;
			if (shift === "N") shiftDayCountN += 1;
			shiftCells.push(`<td class="plan-row ${holiday ? "holiday" : ""} ${customHoliday ? "custom-holiday" : ""}"><span class="dual-view">${shift || "-"}</span></td>`);

			let streakClass = "";
			if (streakMap[day] === "warn") streakClass = "streak-warn";
			if (streakMap[day] === "danger") streakClass = "streak-danger";

			let actualText = `${aTotal}`;
			let titleText = "";
			if (leaveType) {
				actualText = leaveType;
				const reason = getLeaveReason(emp, day);
				titleText = reason ? ` title="${reason}"` : "";
			}

			actualCells.push(`<td class="${holiday ? "holiday" : ""} ${customHoliday ? "custom-holiday" : ""} ${leaveType ? "leave" : ""} ${streakClass}"${titleText}><span class="dual-view">${actualText}</span></td>`);
		}

		const shiftTotalText = `${shiftDayCountD}D/${shiftDayCountN}N`;
		const teamCell = `<span class="team-tag ${team.colorClass}">${team.label}</span>`;

		return `
			<tr>
				<td class="sticky" rowspan="4">${idx + 1}</td>
				<td class="sticky2" rowspan="4">${emp.code}</td>
				<td class="sticky3" rowspan="4">${emp.name}</td>
				<td class="sticky4" rowspan="4">${emp.rank}</td>
				<td class="sticky5" rowspan="4">${teamCell}</td>
				<td class="plan-row type-col sticky6">Shift</td>
				${shiftCells.join("")}
				<td class="plan-row">${shiftTotalText}</td>
				<td class="plan-row">-</td>
			</tr>
			<tr>
				<td class="plan-row type-col sticky6">Plan 1.5x</td>
				${plan15Cells.join("")}
				<td class="plan-row">${stats.plan15Total.toFixed(1)}</td>
				<td class="plan-row">-</td>
			</tr>
			<tr>
				<td class="plan-row type-col sticky6">Plan 3x</td>
				${plan3Cells.join("")}
				<td class="plan-row">${stats.plan3Total.toFixed(1)}</td>
				<td class="plan-row">Plan ${stats.planTotal.toFixed(1)}</td>
			</tr>
			<tr>
				<td class="type-col sticky6">Actual</td>
				${actualCells.join("")}
				<td>${stats.actualTotal.toFixed(1)}</td>
				<td class="remark-${remark.level}">${remark.text}</td>
			</tr>
		`;
	}).join("");

	const totalPlan15Row = dayTotalsPlan15.map((v) => `<td>${v.toFixed(1)}</td>`).join("");
	const totalPlan3Row = dayTotalsPlan3.map((v) => `<td>${v.toFixed(1)}</td>`).join("");
	const totalPlanRow = dayTotalsPlan.map((v) => `<td>${v.toFixed(1)}</td>`).join("");
	const totalActual15Row = dayTotalsActual15.map((v) => `<td>${v.toFixed(1)}</td>`).join("");
	const totalActual3Row = dayTotalsActual3.map((v) => `<td>${v.toFixed(1)}</td>`).join("");
	const totalActualRow = dayTotalsActual.map((v) => `<td>${v.toFixed(1)}</td>`).join("");

	els.reportTableWrap.innerHTML = `
		<table class="report-table">
			<thead>
				<tr>
					<th class="sticky">No</th>
					<th class="sticky2">Code</th>
					<th class="sticky3">Name</th>
					<th class="sticky4">Rank</th>
					<th class="sticky5">Team</th>
					<th class="type-col sticky6">Type</th>
					${dayHeaders.join("")}
					<th>OT Hrs.</th>
					<th>Remark</th>
				</tr>
			</thead>
			<tbody>
				${rows}
				<tr>
					<td colspan="6" class="summary-label"><b>Plan OT 1.5x รวม/วัน</b></td>
					${totalPlan15Row}
					<td><b>${overallPlan15.toFixed(1)}</b></td>
					<td>-</td>
				</tr>
				<tr>
					<td colspan="6" class="summary-label"><b>Plan OT 3x รวม/วัน</b></td>
					${totalPlan3Row}
					<td><b>${overallPlan3.toFixed(1)}</b></td>
					<td>-</td>
				</tr>
				<tr>
					<td colspan="6" class="summary-label"><b>Plan OT รวม/วัน (1.5x+3x)</b></td>
					${totalPlanRow}
					<td><b>${overallPlan.toFixed(1)}</b></td>
					<td>-</td>
				</tr>
				<tr>
					<td colspan="6" class="summary-label"><b>Actual OT 1.5x รวม/วัน</b></td>
					${totalActual15Row}
					<td><b>${overallActual15.toFixed(1)}</b></td>
					<td>-</td>
				</tr>
				<tr>
					<td colspan="6" class="summary-label"><b>Actual OT 3x รวม/วัน</b></td>
					${totalActual3Row}
					<td><b>${overallActual3.toFixed(1)}</b></td>
					<td>-</td>
				</tr>
				<tr>
					<td colspan="6" class="summary-label"><b>Actual OT รวม/วัน (1.5x+3x)</b></td>
					${totalActualRow}
					<td><b>${overallActual.toFixed(1)}</b></td>
					<td><b>Diff ${(overallPlan - overallActual).toFixed(1)}</b></td>
				</tr>
			</tbody>
		</table>
	`;

	renderSummary(overallPlan, overallActual, warningItems);
}

function renderSummary(overallPlan, overallActual, warningItems) {
	const people = state.employees.length;
	const avg = people ? overallActual / people : 0;
	let over80Count = 0;
	let over32WeekCount = 0;
	let over36WeekCount = 0;
	let streak6plusCount = 0;

	state.employees.forEach((emp) => {
		const st = employeeStats(emp);
		if (st.actualTotal > 80) over80Count += 1;
		if (st.weekAnyOver32) over32WeekCount += 1;
		if (st.weekAnyOver36) over36WeekCount += 1;
		if (st.maxStreak >= 6) streak6plusCount += 1;
	});

	const cards = [
		["พนักงานทั้งหมด", String(people)],
		["OT Plan รวม (เดือน)", overallPlan.toFixed(1)],
		["OT Actual รวม (เดือน)", overallActual.toFixed(1)],
		["OT เฉลี่ยต่อคน", avg.toFixed(1)],
		["จำนวนแจ้งเตือน", String(warningItems.length)]
	];

	els.summaryGrid.innerHTML = cards.map((c) => `
		<div class="sum-card">
			<div class="label">${c[0]}</div>
			<div class="value">${c[1]}</div>
		</div>
	`).join("");

	els.summaryGrid.innerHTML += `
		<div class="sum-card summary-status-card">
			<div class="label summary-status-title">สรุปสถานะ OT</div>
			<div class="summary-status-group danger">
				<div class="summary-status-heading">สถานะเกินเกณฑ์ (ปฏิบัติงานเกินข้อกำหนด)</div>
				<div class="summary-status-item">ล่วงเวลารายเดือนเกิน 80 ชม. <strong>${over80Count} ราย</strong></div>
				<div class="summary-status-item">รายสัปดาห์เกิน 36 ชม. <strong>${over36WeekCount} ราย</strong></div>
			</div>
			<div class="summary-status-group warning">
				<div class="summary-status-heading">สถานะเฝ้าระวัง (ชั่วโมงทำงานใกล้ถึงขีดจำกัดสูงสุด)</div>
				<div class="summary-status-item">ล่วงเวลารายสัปดาห์สะสมถึง 32 ชม. <strong>${over32WeekCount} ราย</strong></div>
				<div class="summary-status-item">ปฏิบัติงานต่อเนื่อง 6 วันขึ้นไป <strong>${streak6plusCount} ราย</strong></div>
			</div>
		</div>
	`;
}

function updateConfirmButton() {
	if (els.btnConfirmMonthly) els.btnConfirmMonthly.hidden = state.activeSubTab !== "monthly";
	if (els.btnConfirmDaily) els.btnConfirmDaily.hidden = state.activeSubTab !== "daily";
}

function bindStaticEvents() {
	document.querySelectorAll(".tab-btn").forEach((btn) => {
		btn.addEventListener("click", () => {
			const tab = btn.dataset.tab;
			state.activeTab = tab;
			document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b === btn));
			document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
			document.getElementById(`tab-${tab}`).classList.add("active");
		});
	});

	document.querySelectorAll(".subtab-btn").forEach((btn) => {
		btn.addEventListener("click", () => {
			const tab = btn.dataset.subtab;
			if (currentUser?.role === "employee" && tab === "monthly") return;
			state.activeSubTab = tab;
			document.querySelectorAll(".subtab-btn").forEach((b) => b.classList.toggle("active", b === btn));
			document.querySelectorAll(".subpanel").forEach((p) => p.classList.remove("active"));
			document.getElementById(`sub-${tab}`).classList.add("active");
			updateConfirmButton();
		});
	});

	els.yearSelect.addEventListener("change", changeMonthYear);
	els.monthSelect.addEventListener("change", changeMonthYear);
	els.dailyDate.addEventListener("change", () => renderDailyTable());
	if (els.monthlyEmployeeSelect) {
		els.monthlyEmployeeSelect.addEventListener("change", (e) => {
			state.monthlySelectedEmpId = Number(e.target.value);
			renderMonthlyTable();
		});
	}
	els.dailyDate.addEventListener("input", () => renderDailyTable());

	const btnLogout = document.getElementById("btnLogout");
	if (btnLogout) {
		btnLogout.addEventListener("click", () => window.OTAuth.logout());
	}

	if (els.btnConnectDataFolder) {
		els.btnConnectDataFolder.addEventListener("click", () => connectDataFolder());
	}

	if (els.btnReloadFromFile) {
		els.btnReloadFromFile.addEventListener("click", async () => {
			const loaded = await syncFromFolder({ silent: false });
			if (!loaded && !dataDirHandle) {
				window.alert("ยังไม่ได้เชื่อมโฟลเดอร์โปรแกรม");
			}
		});
	}

	if (els.btnConfirmMonthly) {
		els.btnConfirmMonthly.addEventListener("click", () => saveSnapshot("monthly"));
	}

	if (els.btnConfirmDaily) {
		els.btnConfirmDaily.addEventListener("click", () => saveSnapshot("daily"));
	}

	const applyDefaultBtn = document.getElementById("btnApplyDefaultByPlan");
	if (applyDefaultBtn) {
		applyDefaultBtn.addEventListener("click", () => {
			const day = selectedDayFromDateInput();
			state.employees.forEach((emp) => {
				if (!getLeaveType(emp, day)) {
					emp.actualOT15[dayKey(day)] = clampOt(emp.planOT15[dayKey(day)]);
					emp.actualOT3[dayKey(day)] = clampOt(emp.planOT3[dayKey(day)]);
				}
			});
			persistState();
			renderDailyTable();
			renderReport();
		});
	}

	document.getElementById("btnExportPdf").addEventListener("click", () => {
		if (state.activeTab !== "report") document.querySelector('[data-tab="report"]').click();
		setTimeout(() => window.print(), 100);
	});

	document.getElementById("btnScrollReportUp").addEventListener("click", () => {
		els.reportTableWrap.scrollBy({ top: -180, behavior: "smooth" });
	});

	document.getElementById("btnScrollReportDown").addEventListener("click", () => {
		els.reportTableWrap.scrollBy({ top: 180, behavior: "smooth" });
	});

	document.addEventListener("input", onDelegatedInputChange);
	document.addEventListener("change", onDelegatedInputChange);
}

function findEmployee(empId) {
	return state.employees.find((e) => e.id === Number(empId));
}

function onDelegatedInputChange(e) {
	const t = e.target;
	const action = t.dataset.action;
	if (!action) return;

	if (action === "team-extra-dates") {
		if (e.type === "input") return;
		const teamKey = t.dataset.teamKey;
		state.teamMonthOffDates[teamKey] = parseDateList(t.value);
		persistState();
		renderAll();
		return;
	}

	const emp = findEmployee(t.dataset.empId);
	if (!emp) return;

	if (action === "plan15-input" || action === "plan3-input") {
		const day = Number(t.dataset.day);
		if (action === "plan15-input") emp.planOT15[dayKey(day)] = clampOt(t.value);
		if (action === "plan3-input") emp.planOT3[dayKey(day)] = clampOt(t.value);
		persistState();
		renderMonthlyTable();
		renderDailyTable();
		renderReport();
		return;
	}

	if (action === "shift-input" || action === "daily-shift") {
		const day = Number(t.dataset.day);
		setShift(emp, day, t.value);
		persistState();
		renderMonthlyTable();
		renderDailyTable();
		renderReport();
		return;
	}

	if (action === "team-change") {
		emp.teamKey = t.value;
		persistState();
		renderAll();
		return;
	}

	if (action === "daily-leave") {
		const day = Number(t.dataset.day);
		setLeave(emp, day, t.value, getLeaveReason(emp, day));
		persistState();
		renderMonthlyTable();
		renderDailyTable();
		renderReport();
		return;
	}

	if (action === "daily-leave-reason") {
		const day = Number(t.dataset.day);
		const leaveType = getLeaveType(emp, day);
		if (leaveType) setLeave(emp, day, leaveType, t.value);
		persistState();
		renderReport();
		return;
	}

	if (action === "daily-actual15" || action === "daily-actual3") {
		const day = Number(t.dataset.day);
		if (action === "daily-actual15") emp.actualOT15[dayKey(day)] = clampOt(t.value);
		if (action === "daily-actual3") emp.actualOT3[dayKey(day)] = clampOt(t.value);
		persistState();
		renderDailyTable();
		renderReport();
	}
}

// ดึงรายชื่อพนักงานจาก backend ตามสิทธิ์ของผู้ใช้ (admin=ทุกคน, supervisor=ตัวเอง+ลูกน้อง, employee=ตัวเอง)
async function loadEmployeesFromBackend() {
	if (!window.OTAuth) return null;
	try {
		const list = await window.OTAuth.authFetch("/api/employees");
		const days = getDaysInMonth(state.year, state.month);
		// admin ไม่ใช่พนักงาน ไม่ต้องแสดงเป็นแถวในตาราง/ฟอร์มใดๆ
		return list.filter((row) => row.role !== "admin").map((row) => {
			const emp = {
				id: row.id,
				code: row.code,
				name: row.name,
				rank: row.rank,
				teamKey: row.teamKey,
				customOffDays: [],
				planOT15: {},
				planOT3: {},
				actualOT15: {},
				actualOT3: {},
				leave: {},
				leaveByMonth: {},
				shift: {}
			};
			for (let day = 1; day <= days; day += 1) {
				emp.planOT15[dayKey(day)] = 0;
				emp.planOT3[dayKey(day)] = 0;
				emp.actualOT15[dayKey(day)] = 0;
				emp.actualOT3[dayKey(day)] = 0;
			}
			return emp;
		});
	} catch (err) {
		console.warn("ไม่สามารถโหลดรายชื่อพนักงานจากเซิร์ฟเวอร์ได้ ใช้ข้อมูลสำรองในเครื่องแทน:", err.message);
		return null;
	}
}

// จำกัดการมองเห็น subtab ตาม role: พนักงานทั่วไปเห็นเฉพาะ "รูปแบบที่ 2", หัวหน้างาน/admin เห็นทั้งคู่ (หัวหน้างานกรอก OT รูปแบบ 2 ได้ด้วย)
function applyRoleBasedVisibility() {
	if (!currentUser) return;
	const btnMonthly = document.querySelector('.subtab-btn[data-subtab="monthly"]');

	if (currentUser.role === "employee") {
		if (btnMonthly) btnMonthly.hidden = true;
		state.activeSubTab = "daily";
		document.getElementById("sub-monthly")?.classList.remove("active");
		document.getElementById("sub-daily")?.classList.add("active");
		document.querySelector('.subtab-btn[data-subtab="monthly"]')?.classList.remove("active");
		document.querySelector('.subtab-btn[data-subtab="daily"]')?.classList.add("active");
	}

	const label = document.getElementById("currentUserLabel");
	if (label) {
		// admin มีหน้าที่แค่เข้ามาดู/กรอกแทนได้ทุกคน ไม่จำเป็นต้องแสดงชื่อ
		if (currentUser.role === "admin") {
			label.textContent = "";
		} else {
			const roleLabel = { supervisor: "หัวหน้างาน", employee: "พนักงาน" }[currentUser.role] || currentUser.role;
			label.textContent = `${currentUser.name} (${roleLabel})`;
		}
	}
}

// กันรายชื่อซ้ำกันใน roster (เก็บตัวที่เจอก่อนตาม code) เพราะ backend อาจคืนค่าซ้ำเมื่อ refresh ซ้ำๆ

function dedupeEmployeesByCode(list) {
	const byCode = new Map();
	list.forEach((emp) => {
		if (!byCode.has(emp.code)) byCode.set(emp.code, emp);
	});
	return Array.from(byCode.values());
}

// คัดลอกข้อมูล OT/ลา/กะ ที่เคยโหลดไว้ (จากไฟล์/localStorage) เข้าไปใน roster ที่มาจาก backend โดยจับคู่ด้วย code เพื่อไม่ให้ข้อมูลที่กรอกไว้หายไปเมื่อเปลี่ยนมาใช้ roster ของ backend
function mergeOtDataIntoRoster(roster, savedEmployees) {
	const savedByCode = new Map((savedEmployees || []).map((e) => [e.code, e]));
	roster.forEach((emp) => {
		const saved = savedByCode.get(emp.code);
		if (!saved) return;
		emp.planOT15 = saved.planOT15 || emp.planOT15;
		emp.planOT3 = saved.planOT3 || emp.planOT3;
		emp.actualOT15 = saved.actualOT15 || emp.actualOT15;
		emp.actualOT3 = saved.actualOT3 || emp.actualOT3;
		emp.leave = saved.leave || emp.leave;
		if (saved.leaveByMonth) emp.leaveByMonth = saved.leaveByMonth;
		else delete emp.leaveByMonth;
		emp.shift = saved.shift || emp.shift;
		emp.customOffDays = saved.customOffDays || emp.customOffDays;
	});
	return roster;
}

async function initApp() {
	initSelectors();
	updatePageTitle();
	applyRoleBasedVisibility();
	dataDirHandle = await loadFolderHandle();
	let restored = false;
	if (dataDirHandle && await verifyFolderPermission(dataDirHandle, false)) {
		restored = await syncFromFolder({ silent: true });
	}
	if (!restored) {
		restored = loadPersistedState();
	}
	applyRoleBasedVisibility();
	const previouslyLoadedEmployees = state.employees;
	const backendEmployees = await loadEmployeesFromBackend();
	if (backendEmployees && backendEmployees.length) {
		state.employees = mergeOtDataIntoRoster(dedupeEmployeesByCode(backendEmployees), previouslyLoadedEmployees);
	} else if (!restored || !state.employees.length) {
		state.employees = buildMockEmployees();
	} else {
		state.employees = dedupeEmployeesByCode(state.employees);
	}
	els.yearSelect.value = String(state.year);
	els.monthSelect.value = String(state.month);
	document.querySelectorAll(".tab-btn").forEach((btn) => {
		btn.classList.toggle("active", btn.dataset.tab === state.activeTab);
	});
	document.querySelectorAll(".tab-panel").forEach((panel) => panel.classList.remove("active"));
	document.getElementById(`tab-${state.activeTab}`).classList.add("active");
	document.querySelectorAll(".subtab-btn").forEach((btn) => {
		btn.classList.toggle("active", btn.dataset.subtab === state.activeSubTab);
	});
	document.querySelectorAll(".subpanel").forEach((panel) => panel.classList.remove("active"));
	document.getElementById(`sub-${state.activeSubTab}`).classList.add("active");
	updateConfirmButton();
	state.employees.forEach(normalizeEmployeeMonthData);
	initDailyDate();
	bindStaticEvents();
	setFolderStatus(dataDirHandle ? `เชื่อมโฟลเดอร์แล้ว: ${DATA_FILE_NAME}` : "ยังไม่ได้เชื่อมโฟลเดอร์", dataDirHandle ? "ok" : "idle");
	startAutoSync();
	renderAll();
}

initApp();
