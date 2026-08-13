import React, { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "./supabase";

/* ─── Animated Number Counter ─── */
function AnimatedNumber({ value, color }) {
  const [display, setDisplay] = useState(0);
  const ref = useRef(null);
  useEffect(() => {
    const target = typeof value === "number" ? value : parseInt(value) || 0;
    if (target === 0) { setDisplay(0); return; }
    let start = 0;
    const duration = 800;
    const startTime = performance.now();
    const step = (now) => {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(eased * target));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [value]);
  return <div ref={ref} className="stat-num-resp" style={{ ...styles.statNum, ...(color ? { color } : {}) }}>{display}</div>;
}

/* ─── Logo URLs ─── */
const LOGO_FLAG = "https://raw.githubusercontent.com/mujtaba1119/PSA-Oxygen-Plants/main/240_F_1475369941_dBG7IPXXeJLHejjX0ZpyqwykTxo8Wc3M-removebg-preview.png";
const LOGO_GLOBALFUND = "https://raw.githubusercontent.com/mujtaba1119/PSA-Oxygen-Plants/main/GF.png";
const LOGO_GOVT = "https://raw.githubusercontent.com/mujtaba1119/PSA-Oxygen-Plants/main/GOvt%20of%20Pakistan%20logo.png";
const LOGO_UNDP = "https://raw.githubusercontent.com/mujtaba1119/PSA-Oxygen-Plants/main/UNDP.png";
const LOGO_AMEX = "https://raw.githubusercontent.com/mujtaba1119/PSA-Oxygen-Plants/main/Amex.png";
const LOGO_NOXERIOR = "https://raw.githubusercontent.com/mujtaba1119/PSA-Oxygen-Plants/main/Noxerior.png";

/* ─── Data ─── */
const GROUPS = {
  "Novair": ["Rawalpindi","Kohat","Swat","Timergara","Malakand","Bannu","Neelum","Jhelum","Haveli","Nagar","Ghizer","Astore","Khaplu","Islamabad"],
  "Intexim": ["Bhakkar","Sahiwal","Toba Tek Singh","Sargodha","Rahim Yar Khan","Jhang","Faisalabad","Bhimber","Multan"],
  "Z-Corps": ["Larkana","Jamshoro","Quetta SZ","DM Jamali","Khuzdar","Sibbi","Nawabshah","Zhob","Quetta Sandeman","Loralai","Pangjur","Kharan","Karachi"],
};
const ALL_HOSPITALS = Object.values(GROUPS).flat();
const getProvider = h => Object.entries(GROUPS).find(([, list]) => list.includes(h))?.[0] || "Unknown";
const DISPLAY_NAMES = { "Timergara": "Lower Dir - Timergara", "Malakand": "Batkhela - Malakand", "Neelum": "Neelum - AJK", "Jhelum": "Jhelum - AJK", "Haveli": "Haveli - AJK", "Ghizer": "Gahkuch - Ghizer", "Khaplu": "Khaplu - Ghanche", "Quetta SZ": "Quetta Sheikh Zayed", "Pangjur": "Panjgur", "Bhimber": "Bhimber" };
const displayName = h => DISPLAY_NAMES[h] || h;

const COMPLAINT_TYPES = [
  "Compressor Issue","Dryer Issue","Booster Filling System Issue","Purity Issue",
  "Electrical/Power Issue","Monitoring/CSS Issue","Backup Manifold Issue","Other Issue"
];

/* ─── Supabase helpers ─── */
async function fetchComplaints() {
  const { data, error } = await supabase.from("complaints").select("*").order("created_at", { ascending: false });
  if (error) { console.error(error); return []; }
  return data;
}
async function insertComplaint(hospital, title, description, customDate) {
  const row = { hospital, title, description, status: "Open" };
  if (customDate) row.created_at = new Date(customDate).toISOString();
  const { data, error } = await supabase.from("complaints").insert([row]).select();
  if (error) { console.error(error); return null; }
  const complaint = data[0];
  notifyComplaintEmail(hospital, title, description).catch((e) => console.error("Email notify failed", e));
  return complaint;
}

async function notifyComplaintEmail(hospital, title, description) {
  const provider = getProvider(hospital);
  const { data: rows, error } = await supabase.from("notification_emails").select("email, group_name");
  if (error || !rows?.length) return;
  const groups = new Set([provider, "Amex", "UNDP"]);
  const to = [...new Set(rows.filter((r) => groups.has(r.group_name)).map((r) => r.email).filter(Boolean))];
  if (!to.length) return;
  await fetch("/api/send-email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ to, hospital, title, description, provider }),
  });
}
async function updateComplaintFields(id, fields) {
  const { error } = await supabase.from("complaints").update(fields).eq("id", id);
  return !error;
}
async function requestResolution(id, requestedBy) {
  const update = { status: "Pending Resolution", resolution_requested_at: new Date().toISOString(), resolution_requested_by: requestedBy };
  const { error } = await supabase.from("complaints").update(update).eq("id", id);
  return !error;
}
async function resolveComplaint(id, resolvedDate, resolvedBy) {
  const { data } = await supabase.from("complaints").select("resolution_requested_at").eq("id", id).single();
  const update = { status: "Resolved", resolved_by: resolvedBy || "Admin" };
  update.resolved_at = (data?.resolution_requested_at) ? data.resolution_requested_at : (resolvedDate ? new Date(resolvedDate).toISOString() : new Date().toISOString());
  const { error } = await supabase.from("complaints").update(update).eq("id", id);
  return !error;
}
async function approveResolution(id, approvedBy) {
  const { data } = await supabase.from("complaints").select("resolution_requested_at").eq("id", id).single();
  const update = { status: "Resolved", resolved_by: approvedBy, resolved_at: data?.resolution_requested_at || new Date().toISOString() };
  const { error } = await supabase.from("complaints").update(update).eq("id", id);
  return !error;
}
async function rejectResolution(id) {
  const update = { status: "Open", resolution_requested_at: null, resolution_requested_by: null };
  const { error } = await supabase.from("complaints").update(update).eq("id", id);
  return !error;
}
async function unresolveComplaint(id) {
  const { error } = await supabase.from("complaints").update({ status: "Open", resolved_at: null, resolved_by: null, resolution_requested_at: null, resolution_requested_by: null }).eq("id", id);
  return !error;
}
async function deleteComplaint(id) {
  await supabase.from("comments").delete().eq("complaint_id", id);
  const { error } = await supabase.from("complaints").delete().eq("id", id);
  return !error;
}
async function fetchUsers() {
  const { data, error } = await supabase.from("users").select("id, name, role");
  if (error) { console.error(error); return []; }
  return data || [];
}
async function updatePassword(userId, newPassword) {
  if (!newPassword || newPassword.trim().length < 8) return false;
  const hashed = await hashPassword(newPassword);
  const { error } = await supabase.from("users").update({ password: hashed }).eq("id", userId);
  return !error;
}
async function createUser(id, name, role, password) {
  if (!password || password.trim().length < 8) return null;
  const hashed = await hashPassword(password);
  const { data, error } = await supabase.from("users").insert([{ id, name, role, password: hashed }]).select("id, name, role");
  if (error) { console.error(error); return null; }
  return data[0];
}
async function deleteUser(id) {
  const { error } = await supabase.from("users").delete().eq("id", id);
  return !error;
}
async function fetchComments(complaintId) {
  const { data, error } = await supabase.from("comments").select("*").eq("complaint_id", complaintId).order("created_at", { ascending: true });
  if (error) { console.error(error); return []; }
  return data;
}
async function insertComment(complaintId, author, authorRole, content) {
  const { data, error } = await supabase.from("comments").insert([{ complaint_id: complaintId, author, author_role: authorRole, content }]).select();
  if (error) { console.error(error); return null; }
  return data[0];
}
async function deleteComment(id) {
  const { error } = await supabase.from("comments").delete().eq("id", id);
  return !error;
}
async function updateCommentContent(id, content) {
  const { error } = await supabase.from("comments").update({ content }).eq("id", id);
  return !error;
}
async function fetchEmails() {
  const { data, error } = await supabase.from("notification_emails").select("*").order("created_at", { ascending: true });
  if (error) { console.error(error); return []; }
  return data;
}
async function addEmail(groupName, email) {
  const { data, error } = await supabase.from("notification_emails").insert([{ group_name: groupName, email }]).select();
  if (error) { console.error(error); return null; }
  return data[0];
}
async function deleteEmailRecord(id) {
  const { error } = await supabase.from("notification_emails").delete().eq("id", id);
  return !error;
}
async function fetchSiteNotes() {
  const { data, error } = await supabase.from("site_notes").select("*");
  if (error) { console.error(error); return []; }
  return data;
}
async function updateSiteNote(hospital, note) {
  const { error } = await supabase.from("site_notes").update({ equipment_note: note, updated_at: new Date().toISOString() }).eq("hospital", hospital);
  return !error;
}
async function updateSiteStatus(hospital, status) {
  const { error } = await supabase.from("site_notes").update({ site_status: status, updated_at: new Date().toISOString() }).eq("hospital", hospital);
  return !error;
}
async function sendShutdownEmail(hospital) {
  const { error } = await supabase.rpc("send_shutdown_email", { hospital_name: hospital });
  return !error;
}

/* ─── CSV Download ─── */
function downloadCSV(complaints, filename) {
  const headers = ["Date", "Hospital", "Service Provider", "Title", "Description", "Status"];
  const escape = s => '"' + String(s || "").replace(/"/g, '""') + '"';
  const rows = complaints.map(c => [
    new Date(c.created_at).toLocaleDateString("en-PK", { year: "numeric", month: "short", day: "numeric" }),
    c.hospital, getProvider(c.hospital), c.title, c.description, c.status || "Open"
  ].map(escape).join(","));
  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename + ".csv"; a.click();
  URL.revokeObjectURL(url);
}

function ComplaintTypeSelect({ value, onChange, style }) {
  return (
    <select style={{ ...style, cursor: "pointer" }} value={value} onChange={onChange}>
      <option value="">Select complaint type</option>
      {COMPLAINT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
    </select>
  );
}

function AppHeader({ user, children }) {
  const displayName = user.role === "hospital" ? user.name + " Hospital" : user.name;
  return (
    <div className="header-reveal top-bar-responsive" style={styles.topBar}>
      <div className="top-left-responsive" style={styles.topLeft}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <img src={LOGO_FLAG} alt="Pakistan" style={{ height: 60, objectFit: "contain", marginTop: -8, marginLeft: 16 }} />
          <div>
            <div className="top-title-responsive" style={styles.topTitle}>PSA Oxygen Plants</div>
            <div style={styles.topUser}>User: {displayName}</div>
          </div>
        </div>
        <div className="mobile-buttons" style={{ display: "none" }}>{children}</div>
      </div>
      <div className="top-center-responsive" style={styles.topCenter}>
        {LOGO_GLOBALFUND && <img className="gf-logo" src={LOGO_GLOBALFUND} alt="Global Fund" style={{ height: 120, objectFit: "contain" }} />}
        {LOGO_UNDP && <img src={LOGO_UNDP} alt="UNDP" style={{ height: 60, objectFit: "contain" }} />}
        {LOGO_AMEX && <img src={LOGO_AMEX} alt="Amex" style={{ height: 50, objectFit: "contain" }} />}
        {LOGO_NOXERIOR && <img src={LOGO_NOXERIOR} alt="Noxerior" style={{ height: 44, objectFit: "contain" }} />}
      </div>
      <div className="top-right-responsive" style={styles.topRight}>{children}</div>
    </div>
  );
}

/* ─── Status Logic ─── */
// Status values: "Fully Functional", "Non Functional", "Shut Down"
// Display status: if site has open complaints → "Issues" (still functional)
// Functional count = Fully Functional + Issues (has open complaints but not shut down)
// Non Functional count = Non Functional + Shut Down
function getSiteBaseStatus(hospital, siteNotes) {
  const note = siteNotes.find(s => s.hospital === hospital);
  return note?.site_status || "Fully Functional";
}

function getSiteDisplayStatus(hospital, complaints, siteNotes) {
  const base = getSiteBaseStatus(hospital, siteNotes);
  if (base === "Non Functional") return "Non Functional";
  if (base === "Shut Down") return "Shut Down";
  const hasOpen = complaints.some(c => c.hospital === hospital && c.status !== "Resolved");
  if (hasOpen) return "Issues";
  return "Fully Functional";
}

function isFunctional(hospital, complaints, siteNotes) {
  const s = getSiteDisplayStatus(hospital, complaints, siteNotes);
  return s === "Fully Functional" || s === "Issues";
}

function SiteStatusBadge({ status }) {
  let color, bg;
  if (status === "Issues") { color = "#c0392b"; bg = "transparent"; }
  else if (status === "Non Functional") { color = "#555"; bg = "#e8e8e8"; }
  else if (status === "Shut Down") { color = "#fff"; bg = "#c0392b"; }
  else { color = "#166534"; bg = "#dcfce7"; }
  const icon = status === "Issues" ? "⚠ " : status === "Shut Down" ? "✕ " : status === "Fully Functional" ? "✓ " : "";
  return <span style={{ fontSize: 11, fontWeight: 600, color, background: bg, padding: "4px 10px", borderRadius: 20, whiteSpace: "nowrap", letterSpacing: 0.3 }}>{icon}{status}</span>;
}

/* ─── App ─── */
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) return <div style={{ padding: 40, fontFamily: "monospace" }}><h2 style={{ color: "red" }}>Something went wrong</h2><pre style={{ whiteSpace: "pre-wrap", fontSize: 13 }}>{this.state.error.toString()}{"\n"}{this.state.error.stack}</pre></div>;
    return this.props.children;
  }
}
export default function App() {
  return <ErrorBoundary><AppInner /></ErrorBoundary>;
}
const SESSION_KEY = "psa_session_user";

function loadSessionUser() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const u = JSON.parse(raw);
    if (u?.id && u?.name && u?.role) return u;
  } catch {}
  return null;
}

function saveSessionUser(u) {
  if (!u) sessionStorage.removeItem(SESSION_KEY);
  else sessionStorage.setItem(SESSION_KEY, JSON.stringify({ id: u.id, name: u.name, role: u.role }));
}

function LoadingScreen() {
  return (
    <div style={styles.loadWrap}><div style={{ textAlign: "center" }}>
      <div style={{ width: 100, height: 100, borderRadius: "50%", border: "2px solid #111", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px", animation: "breathe 3s ease-in-out infinite" }}>
        <span style={{ fontSize: 32, fontWeight: 800, color: "#111", letterSpacing: -2 }}>O₂</span>
      </div>
      <div style={{ fontSize: 10, fontWeight: 600, color: "#999", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 20 }}>PSA Oxygen Plants</div>
      <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
        <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#111", animation: "pulse 1.2s ease-in-out infinite", animationDelay: "0s" }}></span>
        <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#111", animation: "pulse 1.2s ease-in-out infinite", animationDelay: "0.2s" }}></span>
        <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#111", animation: "pulse 1.2s ease-in-out infinite", animationDelay: "0.4s" }}></span>
      </div>
    </div></div>
  );
}

function AppInner() {
  const [user, setUser] = useState(() => loadSessionUser());
  const [users, setUsers] = useState([]);
  const [complaints, setComplaints] = useState([]);
  const [notifEmails, setNotifEmails] = useState([]);
  const [siteNotes, setSiteNotes] = useState([]);
  const [ready, setReady] = useState(false);
  const [dataReady, setDataReady] = useState(false);

  const reload = useCallback(async () => {
    const [c, u, e, s] = await Promise.all([fetchComplaints(), fetchUsers(), fetchEmails(), fetchSiteNotes()]);
    setComplaints(c); setUsers(u); setNotifEmails(e); setSiteNotes(s);
  }, []);

  useEffect(() => { setReady(true); }, []);

  useEffect(() => {
    if (!user) {
      setDataReady(false);
      return;
    }
    let cancelled = false;
    setDataReady(false);
    reload().then(() => { if (!cancelled) setDataReady(true); });
    return () => { cancelled = true; };
  }, [user, reload]);

  useEffect(() => {
    if (user?.role === "company" || user?.role === "admin") {
      const iv = setInterval(reload, 30000);
      return () => clearInterval(iv);
    }
  }, [user, reload]);

  const handleLogin = (u) => {
    saveSessionUser(u);
    setUser(u);
  };
  const handleLogout = () => {
    saveSessionUser(null);
    setUser(null);
    setComplaints([]);
    setUsers([]);
    setNotifEmails([]);
    setSiteNotes([]);
    setDataReady(false);
  };

  if (!ready) return <LoadingScreen />;
  if (!user) return <LoginScreen onLogin={handleLogin} />;
  if (!dataReady) return <LoadingScreen />;
  if (user.role === "hospital") return <HospitalDashboard user={user} complaints={complaints} onRefresh={reload} onLogout={handleLogout} />;
  if (user.role === "admin") return <AdminDashboard user={user} users={users} complaints={complaints} notifEmails={notifEmails} siteNotes={siteNotes} onRefresh={reload} onLogout={handleLogout} />;
  return <CompanyDashboard user={user} complaints={complaints} siteNotes={siteNotes} onRefresh={reload} onLogout={handleLogout} />;
}

/* ─── Security: Password Hashing ─── */
async function hashPassword(pw) {
  const data = new TextEncoder().encode(pw.trim().toLowerCase().replace(/\s+/g, ""));
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function isSha256Hex(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
}

async function loginWithClient(username, password) {
  const clean = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, "");
  const needle = clean(username);
  const pwHash = await hashPassword(password);

  const { data: byId, error: idErr } = await supabase
    .from("users")
    .select("id, name, role, password")
    .eq("id", needle)
    .maybeSingle();
  if (idErr) throw idErr;

  let user = byId;
  if (!user) {
    const { data: rows, error } = await supabase.from("users").select("id, name, role, password");
    if (error) throw error;
    user = (rows || []).find((u) => clean(u.name) === needle) || null;
  }
  if (!user) return null;

  if (isSha256Hex(user.password)) {
    if (user.password !== pwHash) return null;
  } else if (clean(user.password) === clean(password)) {
    // Legacy plaintext: upgrade hash when possible (ignore failure if column locked later)
    await supabase.from("users").update({ password: pwHash }).eq("id", user.id);
  } else {
    return null;
  }

  return { id: user.id, name: user.name, role: user.role };
}

async function loginUser(username, password) {
  try {
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.user) return data.user;
    }
    // Fall through to client login when API isn't configured (local vite / missing service role)
    if (res.status !== 401) {
      return loginWithClient(username, password);
    }
    return null;
  } catch {
    return loginWithClient(username, password);
  }
}

function LoginScreen({ onLogin }) {
  const [id, setId] = useState(""); const [pw, setPw] = useState(""); const [err, setErr] = useState("");
  const [attempts, setAttempts] = useState(0); const [locked, setLocked] = useState(false); const [submitting, setSubmitting] = useState(false);
  const submit = async () => {
    if (locked || submitting) return;
    setSubmitting(true);
    try {
      const found = await loginUser(id, pw);
      if (!found) {
        const newAttempts = attempts + 1;
        setAttempts(newAttempts);
        if (newAttempts >= 5) {
          setLocked(true);
          setErr("Too many attempts. Try again in 60 seconds.");
          setTimeout(() => { setLocked(false); setAttempts(0); setErr(""); }, 60000);
        } else {
          setErr(`Invalid credentials (${5 - newAttempts} attempts remaining)`);
        }
        return;
      }
      onLogin(found);
    } catch (e) {
      console.error(e);
      setErr("Login failed");
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <div style={styles.loginBg}><div className="login-card-responsive" style={styles.loginCard}>
      <div style={styles.loginBrand}><span style={styles.brandMark}>O₂</span><span style={styles.brandText}>PSA Oxygen Plant</span></div>
      <h2 style={styles.loginTitle}>Complaint Portal</h2>
      <p style={styles.loginSub}>Sign in with your credentials</p>
      <input style={styles.input} placeholder="Username" value={id} onChange={e => { setId(e.target.value); setErr(""); }} onKeyDown={e => e.key === "Enter" && submit()} autoComplete="username" />
      <input style={styles.input} type="password" placeholder="Password" value={pw} onChange={e => { setPw(e.target.value); setErr(""); }} onKeyDown={e => e.key === "Enter" && submit()} autoComplete="current-password" />
      {err && <p style={styles.err}>{err}</p>}
      <button style={{ ...styles.btnPrimary, opacity: (locked || submitting) ? 0.5 : 1 }} onClick={submit} disabled={locked || submitting}>{submitting ? "Signing in…" : locked ? "Locked" : "Sign In"}</button>
    </div></div>
  );
}

function StatusBadge({ status }) {
  const r = status === "Resolved";
  const p = status === "Pending Resolution";
  return <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 12, color: r ? "#276749" : p ? "#7c5e10" : "#9c4221", background: r ? "#c6f6d5" : p ? "#fef3c7" : "#feebc8" }}>{status}</span>;
}

/* ─── Overview Tab ─── */
function OverviewTab({ hospitals, complaints, siteNotes, notifEmails, isAdmin, onRefresh }) {
  const [editingNote, setEditingNote] = useState(null);
  const [noteText, setNoteText] = useState(""); const [saving, setSaving] = useState(false);
  const [statusEditing, setStatusEditing] = useState(null);
  const [sendingShutdown, setSendingShutdown] = useState(null);

  const getNotesMap = h => { try { const raw = siteNotes.find(s => s.hospital === h)?.equipment_note || ""; const parsed = JSON.parse(raw); return typeof parsed === "object" && parsed !== null ? parsed : { _legacy: raw }; } catch { const raw = siteNotes.find(s => s.hospital === h)?.equipment_note || ""; return raw ? { _legacy: raw } : {}; } };
  const getNoteForComplaint = (h, cid) => { const m = getNotesMap(h); return m[cid] || m._legacy || ""; };
  const openComplaints = h => complaints.filter(c => c.hospital === h && c.status !== "Resolved");
  const allOpen = hospitals.reduce((sum, h) => sum + openComplaints(h).length, 0);
  const funcCount = hospitals.filter(h => isFunctional(h, complaints, siteNotes)).length;
  const nonFuncCount = hospitals.length - funcCount;

  const attentionSites = hospitals.filter(h => getSiteDisplayStatus(h, complaints, siteNotes) === "Issues");
  const shutdownSites = hospitals.filter(h => getSiteDisplayStatus(h, complaints, siteNotes) === "Shut Down");

  const statusOrder = { "Issues": 0, "Shut Down": 1, "Fully Functional": 2, "Non Functional": 3 };
  const sortedHospitals = [...hospitals].sort((a, b) => {
    const sa = getSiteDisplayStatus(a, complaints, siteNotes);
    const sb = getSiteDisplayStatus(b, complaints, siteNotes);
    return (statusOrder[sa] ?? 2) - (statusOrder[sb] ?? 2);
  });

  const saveNote = async (h, cid) => { setSaving(true); const m = getNotesMap(h); if (cid) { m[cid] = noteText; delete m._legacy; } else { m._site = noteText; } await updateSiteNote(h, JSON.stringify(m)); setEditingNote(null); setNoteText(""); setSaving(false); await onRefresh(); };
  const handleStatusChange = async (h, s) => { await updateSiteStatus(h, s); setStatusEditing(null); await onRefresh(); };
  const handleSendShutdownEmail = async (h) => {
    setSendingShutdown(h);
    await sendShutdownEmail(h);
    setSendingShutdown(null);
    alert("Shutdown notification sent for " + h);
  };

  const [expandedRow, setExpandedRow] = useState(null);

  return (
    <>
      {shutdownSites.length > 0 && (
        <div className="fade-up" style={{ background: "#fed7d7", border: "1px solid #fc8181", borderRadius: 12, padding: "16px 20px", marginBottom: 12, animationDelay: "0s" }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#e53e3e", marginBottom: 8 }}>🚨 Plant Shut Down — Not Producing Oxygen ({shutdownSites.length})</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {shutdownSites.map(h => (
              <span key={h} style={{ fontSize: 13, fontWeight: 500, color: "#e53e3e", background: "#fff5f5", padding: "4px 12px", borderRadius: 8, display: "flex", alignItems: "center", gap: 6 }}>
                {h}
                {isAdmin && <button style={{ fontSize: 11, color: "#e53e3e", background: "none", border: "1px solid #e53e3e", borderRadius: 4, padding: "1px 6px", cursor: "pointer", marginLeft: 2 }} onClick={() => handleSendShutdownEmail(h)} disabled={sendingShutdown === h}>{sendingShutdown === h ? "…" : "📧"}</button>}
              </span>
            ))}
          </div>
          {isAdmin && <p style={{ fontSize: 11, color: "#9b2c2c", marginTop: 6 }}>Click 📧 to send shutdown notification email to stakeholders</p>}
        </div>
      )}

      <div className="fade-up stats-responsive" style={{ ...styles.statsBar, animationDelay: "0.15s" }}>
        <div className="stat-hover" style={styles.statBox}><AnimatedNumber value={hospitals.length} /><div className="stat-label-resp" style={styles.statLabel}>Total Sites</div></div>
        <div className="stat-hover" style={styles.statBox}><AnimatedNumber value={funcCount} color={C.green} /><div className="stat-label-resp" style={styles.statLabel}>Functional</div></div>
        <div className="stat-hover" style={styles.statBox}><AnimatedNumber value={nonFuncCount} color={C.textLight} /><div className="stat-label-resp" style={styles.statLabel}>Non Functional</div></div>
        <div className="stat-hover" style={styles.statBox}><AnimatedNumber value={allOpen} color={C.red} /><div className="stat-label-resp" style={styles.statLabel}>Open Complaints</div></div>
      </div>

      <div className="fade-up" style={{ borderTop: "1px solid #ddd", margin: "0 0 24px", opacity: 0.6, animationDelay: "0.3s" }}></div>

      {attentionSites.length > 0 && (
        <div className="fade-up" style={{ marginBottom: 20, animationDelay: "0.4s" }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: C.red, marginBottom: 10, letterSpacing: 1.5, textTransform: "uppercase" }}>⚠ Attention Needed ({attentionSites.length})</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {attentionSites.map(h => <span key={h} style={{ fontSize: 13, fontWeight: 500, color: C.black, background: "#e0e0e0", padding: "4px 12px", borderRadius: 0 }}>{h}</span>)}
          </div>
        </div>
      )}

      <div className="fade-up" style={{ ...styles.overviewTable, animationDelay: "0.5s" }}>
        <div style={styles.overviewHeaderRow}>
          <div style={{ ...styles.ovCellHeader, ...styles.ovCellSr }}>#</div>
          <div style={{ ...styles.ovCellHeader, ...styles.ovCellSite }}>Site</div>
          <div style={{ ...styles.ovCellHeader, ...styles.ovCellProvider }}>Service Provider</div>
          <div style={{ ...styles.ovCellHeader, ...styles.ovCellStatus }}>Status</div>
          <div style={{ ...styles.ovCellHeader, ...styles.ovCellOpen }}>Open Complaints</div>
          <div style={{ ...styles.ovCellHeader, ...styles.ovCellNote, borderRight: "none" }}>Equipment / Notes</div>
        </div>
        {sortedHospitals.map((h, i) => {
          const open = openComplaints(h);
          const siteStatus = getSiteDisplayStatus(h, complaints, siteNotes);
          const rowBg = i % 2 === 0 ? C.white : "#fafafa";
          const isShutDown = siteStatus === "Shut Down";
          return (
            <div key={h} style={{ cursor: "pointer" }} onClick={() => setExpandedRow(expandedRow === h ? null : h)}>
            <div style={{ ...styles.overviewRow, background: rowBg, borderLeft: isShutDown ? "3px solid #c0392b" : "3px solid transparent" }} onMouseEnter={e => e.currentTarget.style.background = "#f0f0f0"} onMouseLeave={e => e.currentTarget.style.background = rowBg}>
              <div style={{ ...styles.ovCell, ...styles.ovCellSr, color: C.textLight, fontWeight: 500, fontSize: 12 }}>{i + 1}</div>
              <div style={{ ...styles.ovCell, ...styles.ovCellSite }}><span style={{ color: C.black, fontWeight: 600, fontSize: 13 }}>{displayName(h)}</span></div>
              <div style={{ ...styles.ovCell, ...styles.ovCellProvider, color: C.textLight, fontWeight: 400, fontSize: 12 }}>{getProvider(h)}</div>
              <div style={{ ...styles.ovCell, ...styles.ovCellStatus }}>
                {isAdmin ? (
                  statusEditing === h ? (
                    <select style={{ fontSize: 11, padding: "4px 8px", borderRadius: 20, border: `1px solid ${C.border}`, background: C.white }} value={getSiteBaseStatus(h, siteNotes)} onChange={e => handleStatusChange(h, e.target.value)}>
                      <option value="Fully Functional">Fully Functional</option>
                      <option value="Non Functional">Non Functional</option>
                      <option value="Shut Down">Shut Down</option>
                    </select>
                  ) : (
                    <div style={{ cursor: "pointer" }} onClick={() => setStatusEditing(h)}><SiteStatusBadge status={siteStatus} /></div>
                  )
                ) : (
                  <SiteStatusBadge status={siteStatus} />
                )}
              </div>
              <div style={{ ...styles.ovCell, ...styles.ovCellOpen, padding: 0 }}>
                {open.length > 0 ? open.map((c, ci) => (
                  <div key={c.id} style={{ padding: "10px 16px", borderBottom: ci < open.length - 1 ? `1px solid ${C.borderLight}` : "none", minHeight: 42, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
                    <span style={{ fontSize: 12, color: C.red, fontWeight: 500 }}>{c.title} <span style={{ fontWeight: 400, color: C.textLight }}>({new Date(c.created_at).toLocaleDateString("en-PK", { year: "numeric", month: "short", day: "numeric" })})</span></span>
                  </div>
                )) : <div style={{ padding: "10px 16px", fontSize: 12, color: C.textLight, minHeight: 42, display: "flex", alignItems: "center", justifyContent: "center" }}></div>}
              </div>
              <div style={{ ...styles.ovCell, ...styles.ovCellNote, borderRight: "none", padding: 0 }}>
                {open.length > 0 ? open.map((c, ci) => {
                  const cNote = getNoteForComplaint(h, c.id);
                  return (
                  <div key={c.id} style={{ padding: "10px 16px", borderBottom: ci < open.length - 1 ? `1px solid ${C.borderLight}` : "none", minHeight: 42, display: "flex", alignItems: "center" }}>
                    {isAdmin ? (
                      editingNote === c.id ? (
                        <div style={{ display: "flex", gap: 4, width: "100%" }}>
                          <input style={{ ...styles.pwInput, width: "100%", fontSize: 11 }} value={noteText} onChange={e => setNoteText(e.target.value)} onKeyDown={e => e.key === "Enter" && saveNote(h, c.id)} />
                          <button style={{ ...styles.pwSaveBtn, fontSize: 10, padding: "3px 8px" }} onClick={() => saveNote(h, c.id)}>✓</button>
                          <button style={{ ...styles.pwCancelBtn, fontSize: 10 }} onClick={() => setEditingNote(null)}>✕</button>
                        </div>
                      ) : (
                        <div style={{ display: "flex", alignItems: "center", gap: 4, width: "100%" }}>
                          <span style={{ fontSize: 12, color: cNote ? C.black : C.textLight, flex: 1 }}>{cNote || ""}</span>
                          <button style={{ fontSize: 10, color: C.textMid, background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }} onClick={() => { setEditingNote(c.id); setNoteText(cNote); }}>edit</button>
                        </div>
                      )
                    ) : (
                      <span style={{ fontSize: 12, color: cNote ? C.black : C.textLight }}>{cNote || ""}</span>
                    )}
                  </div>
                  );
                }) : (
                  <div style={{ padding: "10px 16px", minHeight: 42, display: "flex", alignItems: "center" }}>
                    {isAdmin ? (
                      editingNote === h ? (
                        <div style={{ display: "flex", gap: 4, width: "100%" }}>
                          <input style={{ ...styles.pwInput, width: "100%", fontSize: 11 }} value={noteText} onChange={e => setNoteText(e.target.value)} onKeyDown={e => e.key === "Enter" && saveNote(h, null)} />
                          <button style={{ ...styles.pwSaveBtn, fontSize: 10, padding: "3px 8px" }} onClick={() => saveNote(h, null)}>✓</button>
                          <button style={{ ...styles.pwCancelBtn, fontSize: 10 }} onClick={() => setEditingNote(null)}>✕</button>
                        </div>
                      ) : (
                        <div style={{ display: "flex", alignItems: "center", gap: 4, width: "100%" }}>
                          <span style={{ fontSize: 12, color: C.textLight, flex: 1 }}></span>
                          <button style={{ fontSize: 10, color: C.textMid, background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }} onClick={() => { setEditingNote(h); setNoteText(""); }}>edit</button>
                        </div>
                      )
                    ) : (
                      <span style={{ fontSize: 12, color: C.textLight }}></span>
                    )}
                  </div>
                )}
              </div>
            </div>
            {expandedRow === h && (
              <div className="fade-in" style={{ background: "#f5f5f5", padding: "16px 24px", borderBottom: `1px solid #eee` }}>
                <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 1.5, textTransform: "uppercase", color: C.textLight, marginBottom: 10 }}>Complaint Details — {displayName(h)}</div>
                {open.length > 0 ? open.map(c => (
                  <div key={c.id} style={{ background: C.white, borderRadius: 8, padding: "12px 16px", marginBottom: 8, border: `1px solid #eee` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: C.red }}>{c.title}</span>
                      <span style={{ fontSize: 11, color: C.textLight }}>{new Date(c.created_at).toLocaleDateString("en-PK", { year: "numeric", month: "short", day: "numeric" })}</span>
                    </div>
                    <p style={{ fontSize: 12, color: C.textMid, margin: 0, lineHeight: 1.6 }}>{c.description}</p>
                    {getNoteForComplaint(h, c.id) && <div style={{ fontSize: 11, color: C.textMid, marginTop: 6, paddingTop: 6, borderTop: "1px solid #eee" }}>Note: {getNoteForComplaint(h, c.id)}</div>}
                  </div>
                )) : <p style={{ fontSize: 12, color: C.textLight }}>No open complaints for this site.</p>}
              </div>
            )}
            </div>
          );
        })}
      </div>
    </>
  );
}

/* ─── Comment Section ─── */
function CommentSection({ complaintId, currentUser, canComment, isAdmin }) {
  const [comments, setComments] = useState([]); const [text, setText] = useState(""); const [posting, setPosting] = useState(false);
  const [loaded, setLoaded] = useState(false); const [expanded, setExpanded] = useState(false);
  const [editingComment, setEditingComment] = useState(null); const [editText, setEditText] = useState("");
  const loadComments = useCallback(async () => { const data = await fetchComments(complaintId); setComments(data); setLoaded(true); }, [complaintId]);
  useEffect(() => { if (expanded) loadComments(); }, [expanded, loadComments]);
  const post = async () => {
    if (!text.trim() || posting) return; setPosting(true);
    const author = currentUser.role === "hospital" ? currentUser.name + " Hospital" : currentUser.name;
    const role = currentUser.role;
    await insertComment(complaintId, author, role, text.trim()); setText(""); setPosting(false); await loadComments();
  };
  const handleDelete = async (id) => { await deleteComment(id); await loadComments(); };
  const handleEdit = async (id) => { if (!editText.trim()) return; await updateCommentContent(id, editText.trim()); setEditingComment(null); setEditText(""); await loadComments(); };
  return (
    <div style={{ marginTop: 10 }}>
      <button style={styles.commentToggle} onClick={() => setExpanded(!expanded)}>
        {expanded ? "▾ Hide Comments" : "▸ Comments" + (loaded && comments.length ? ` (${comments.length})` : "")}
      </button>
      {expanded && (
        <div style={styles.commentBox}>
          {comments.length === 0 && <p style={{ fontSize: 13, color: "#718096", margin: "0 0 8px" }}>No comments yet.</p>}
          {comments.map(c => (
            <div key={c.id} style={styles.commentItem}>
              <div style={styles.commentHeader}>
                <strong style={{ fontSize: 13, color: "#1a2332" }}>{c.author}</strong>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 11, color: "#718096" }}>{new Date(c.created_at).toLocaleDateString("en-PK", { year: "numeric", month: "short", day: "numeric" })}</span>
                  {isAdmin && <button style={{ fontSize: 11, color: "#0e7c6b", background: "none", border: "none", cursor: "pointer" }} onClick={() => { setEditingComment(c.id); setEditText(c.content); }}>Edit</button>}
                  {isAdmin && <button style={{ fontSize: 11, color: "#e53e3e", background: "none", border: "none", cursor: "pointer" }} onClick={() => handleDelete(c.id)}>Delete</button>}
                </div>
              </div>
              {editingComment === c.id ? (
                <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                  <input style={{ ...styles.commentInput, fontSize: 12 }} value={editText} onChange={e => setEditText(e.target.value)} onKeyDown={e => e.key === "Enter" && handleEdit(c.id)} />
                  <button style={{ ...styles.pwSaveBtn, fontSize: 11 }} onClick={() => handleEdit(c.id)}>Save</button>
                  <button style={{ ...styles.pwCancelBtn, fontSize: 11 }} onClick={() => setEditingComment(null)}>✕</button>
                </div>
              ) : (<p style={{ fontSize: 13, color: "#4a5568", margin: "4px 0 0", lineHeight: 1.4 }}>{c.content}</p>)}
            </div>
          ))}
          {(canComment || isAdmin) && (
            <div style={styles.commentInputRow}>
              <input style={styles.commentInput} placeholder="Write a comment…" value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === "Enter" && post()} />
              <button style={styles.commentSendBtn} onClick={post} disabled={!text.trim() || posting}>{posting ? "…" : "Post"}</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function GroupedHospitalList({ groups, complaints, onSelect }) {
  const countFor = h => complaints.filter(c => c.hospital === h).length;
  const openCountFor = h => complaints.filter(c => c.hospital === h && c.status !== "Resolved").length;
  const groupCountFor = hs => complaints.filter(c => hs.includes(c.hospital)).length;
  const groupOpenFor = hs => complaints.filter(c => hs.includes(c.hospital) && c.status !== "Resolved").length;
  return (<>{Object.entries(groups).map(([p, hs]) => (
    <div key={p} style={styles.groupSection}>
      <div className="group-header-responsive" style={styles.groupHeader}><h3 style={styles.groupTitle}>{p}</h3><div style={{ display: "flex", gap: 8 }}><span style={styles.groupBadge}>{groupCountFor(hs)} total</span><span style={{ ...styles.groupBadge, color: "#9c4221", background: "#feebc8" }}>{groupOpenFor(hs)} open</span></div></div>
      <div className="hospital-grid-responsive" style={styles.hospitalGrid}>{hs.map((h, i) => { const open = openCountFor(h); return (<button key={h} style={styles.hospitalBtn} onClick={() => onSelect(h)}><span style={styles.hospitalName}>{h}</span><span style={styles.hospitalBadge}>{countFor(h)}</span>{open > 0 && <span style={styles.openBadge}>{open}</span>}</button>); })}</div>
    </div>
  ))}</>);
}

function ComplaintCard({ complaint, currentUser, canResolve, canComment, isAdmin, isAmex, isProvider, onResolve, onRequestResolve, onApprove, onReject, onUnresolve, onDelete, onRefresh }) {
  const [resolving, setResolving] = useState(false); const [resolveDate, setResolveDate] = useState("");
  const [editing, setEditing] = useState(false); const [editTitle, setEditTitle] = useState(complaint.title);
  const [editDesc, setEditDesc] = useState(complaint.description); const [editSaving, setEditSaving] = useState(false);
  const [rejecting, setRejecting] = useState(false); const [rejectReason, setRejectReason] = useState("");
  const c = complaint;
  const handleResolve = async () => {
    setResolving(true);
    if (isAdmin || isAmex) { await onResolve(c.id, resolveDate || null); }
    else { await onRequestResolve(c.id); }
    setResolving(false);
  };
  const handleApprove = async () => { setResolving(true); await onApprove(c.id); setResolving(false); };
  const handleReject = async () => {
    if (!rejectReason.trim()) return;
    setResolving(true);
    await onReject(c.id, rejectReason.trim());
    setRejecting(false); setRejectReason(""); setResolving(false);
  };
  const handleUnresolve = async () => { await onUnresolve(c.id); await onRefresh(); };
  const handleDelete = async () => { if (window.confirm("Delete this complaint permanently?")) { await onDelete(c.id); await onRefresh(); } };
  const handleEditSave = async () => { if (!editTitle.trim() || !editDesc.trim()) return; setEditSaving(true); await updateComplaintFields(c.id, { title: editTitle.trim(), description: editDesc.trim() }); setEditSaving(false); setEditing(false); await onRefresh(); };
  const dateFmt = { year: "numeric", month: "short", day: "numeric" };
  return (
    <div style={styles.card}>
      {editing ? (
        <>
          <ComplaintTypeSelect value={editTitle} onChange={e => setEditTitle(e.target.value)} style={{ ...styles.input, marginBottom: 8 }} />
          <textarea style={{ ...styles.input, minHeight: 80, resize: "vertical", fontFamily: "inherit" }} value={editDesc} onChange={e => setEditDesc(e.target.value)} />
          <div style={{ display: "flex", gap: 8 }}><button style={styles.pwSaveBtn} onClick={handleEditSave}>{editSaving ? "…" : "Save"}</button><button style={styles.pwCancelBtn} onClick={() => { setEditing(false); setEditTitle(c.title); setEditDesc(c.description); }}>Cancel</button></div>
        </>
      ) : (
        <>
          <div style={styles.cardTop}>
            <strong style={styles.cardTitle}>{c.title}</strong>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}><StatusBadge status={c.status} /><span style={styles.cardDate}>Submitted: {new Date(c.created_at).toLocaleDateString("en-PK", dateFmt)}</span></div>
          </div>
          <p style={styles.cardDesc}>{c.description}</p>
          {c.status === "Pending Resolution" && c.resolution_requested_by && (<p style={{ fontSize: 12, color: "#7c5e10", marginTop: 4 }}>Resolution requested by: {c.resolution_requested_by} — {new Date(c.resolution_requested_at).toLocaleDateString("en-PK", dateFmt)}</p>)}
          {c.status === "Resolved" && c.resolved_at && (<p style={{ fontSize: 12, color: "#276749", marginTop: 4 }}>Resolved: {new Date(c.resolved_at).toLocaleDateString("en-PK", dateFmt)}{c.resolved_by ? ` (Approved by: ${c.resolved_by})` : ""}</p>)}
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
            {/* Open complaints: Hospital/Provider can request, Amex/Admin can resolve directly */}
            {c.status === "Open" && canResolve && (
              <>{isAdmin && <input type="date" style={{ fontSize: 12, padding: "4px 8px", border: "1px solid #e2e8f0", borderRadius: 6 }} value={resolveDate} onChange={e => setResolveDate(e.target.value)} />}<button style={styles.resolveBtn} onClick={handleResolve} disabled={resolving}>{resolving ? "…" : (isAdmin || isAmex) ? "RESOLVE" : "MARK AS RESOLVED"}</button></>
            )}
            {/* Pending: Amex/Admin can approve or reject */}
            {c.status === "Pending Resolution" && (isAdmin || isAmex) && (
              <>
                <button style={{ ...styles.resolveBtn, background: "#27ae60" }} onClick={handleApprove} disabled={resolving}>{resolving ? "…" : "APPROVE"}</button>
                {!rejecting ? (
                  <button style={{ ...styles.deleteBtn, background: "#c0392b" }} onClick={() => setRejecting(true)}>REJECT</button>
                ) : (
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flex: 1 }}>
                    <input style={{ ...styles.pwInput, flex: 1, fontSize: 12 }} placeholder="Reason for rejection..." value={rejectReason} onChange={e => setRejectReason(e.target.value)} onKeyDown={e => e.key === "Enter" && handleReject()} />
                    <button style={{ ...styles.pwSaveBtn, fontSize: 11 }} onClick={handleReject}>Send</button>
                    <button style={styles.pwCancelBtn} onClick={() => { setRejecting(false); setRejectReason(""); }}>✕</button>
                  </div>
                )}
              </>
            )}
            {isAdmin && c.status === "Resolved" && (<button style={{ fontSize: 12, fontWeight: 600, color: "#9c4221", background: "#feebc8", border: "none", borderRadius: 0, padding: "6px 14px", cursor: "pointer", letterSpacing: 0.5, textTransform: "uppercase" }} onClick={handleUnresolve}>Unresolve</button>)}
            {isAdmin && <button style={{ fontSize: 12, fontWeight: 500, color: C.black, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 0, padding: "6px 14px", cursor: "pointer" }} onClick={() => setEditing(true)}>Edit</button>}
            {isAdmin && <button style={styles.deleteBtn} onClick={handleDelete}>Delete</button>}
          </div>
        </>
      )}
      <CommentSection complaintId={c.id} currentUser={currentUser} canComment={canComment} isAdmin={isAdmin} />
    </div>
  );
}

function ComplaintListView({ hospital, complaints, currentUser, canResolve, canComment, isAdmin, isAmex, isProvider, onBack, onResolve, onRequestResolve, onApprove, onReject, onUnresolve, onDelete, onRefresh }) {
  const hc = complaints.filter(c => c.hospital === hospital);
  return (<>
    <button style={styles.backBtn} onClick={onBack}>← BACK</button>
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}><h2 style={{ ...styles.sectionTitle, margin: 0 }}>{hospital}</h2><span style={{ fontSize: 13, color: "#999" }}>({hc.length})</span><span style={{ fontSize: 12, color: "#555", background: "#f0f0f0", padding: "2px 8px" }}>{getProvider(hospital)}</span></div>
    {hc.length === 0 && <p style={styles.empty}>No complaints from this hospital.</p>}
    {hc.map(c => (<ComplaintCard key={c.id} complaint={c} currentUser={currentUser} canResolve={canResolve} canComment={canComment} isAdmin={isAdmin} isAmex={isAmex} isProvider={isProvider} onResolve={onResolve} onRequestResolve={onRequestResolve} onApprove={onApprove} onReject={onReject} onUnresolve={onUnresolve} onDelete={onDelete} onRefresh={onRefresh} />))}
  </>);
}

/* ─── Hospital Dashboard ─── */
function HospitalDashboard({ user, complaints, onRefresh, onLogout }) {
  const [title, setTitle] = useState(""); const [desc, setDesc] = useState("");
  const [success, setSuccess] = useState(false); const [submitting, setSubmitting] = useState(false);
  const mine = complaints.filter(c => c.hospital === user.name);
  const openCount = mine.filter(c => c.status !== "Resolved").length;
  const submitComplaint = async () => { if (!title.trim() || !desc.trim() || submitting) return; setSubmitting(true); const r = await insertComplaint(user.name, title.trim(), desc.trim()); setSubmitting(false); if (r) { setTitle(""); setDesc(""); setSuccess(true); setTimeout(() => setSuccess(false), 2500); await onRefresh(); } };
  const handleResolve = async (id) => { await requestResolution(id, user.name + " Hospital"); await onRefresh(); };
  return (
    <div style={styles.shell}>
      <AppHeader user={user}><button style={styles.btnBlack} onClick={onLogout}>SIGN OUT</button></AppHeader>
      <main className="main-responsive" style={styles.main}>
        <section style={styles.formSection}>
          <h2 style={styles.sectionTitle}>Register a Complaint</h2>
          <ComplaintTypeSelect value={title} onChange={e => setTitle(e.target.value)} style={styles.input} />
          <textarea style={{ ...styles.input, minHeight: 100, resize: "vertical", fontFamily: "inherit" }} placeholder="Describe the issue in detail…" value={desc} onChange={e => setDesc(e.target.value)} />
          <button style={{ ...styles.btnPrimary, opacity: (!title.trim() || !desc.trim() || submitting) ? 0.5 : 1 }} onClick={submitComplaint}>{submitting ? "Submitting…" : "Submit Complaint"}</button>
          {success && <p style={styles.successMsg}>Complaint registered successfully.</p>}
        </section>
        <section style={styles.listSection}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}><h2 style={{ ...styles.sectionTitle, margin: 0 }}>Your Complaints ({mine.length})</h2>{openCount > 0 && <span style={{ fontSize: 13, fontWeight: 600, color: "#9c4221", background: "#feebc8", padding: "3px 10px", borderRadius: 12 }}>{openCount} open</span>}</div>
          {mine.length === 0 && <p style={styles.empty}>No complaints registered yet.</p>}
          {mine.map(c => (<ComplaintCard key={c.id} complaint={c} currentUser={user} canResolve={true} canComment={true} isAdmin={false} isAmex={false} isProvider={false} onResolve={() => {}} onRequestResolve={handleResolve} onApprove={() => {}} onReject={() => {}} onUnresolve={() => {}} onDelete={() => {}} onRefresh={onRefresh} />))}
        </section>
      </main>
    </div>
  );
}

/* ─── Admin Dashboard ─── */
function AdminDashboard({ user, users, complaints, notifEmails, siteNotes, onRefresh, onLogout }) {
  const [tab, setTab] = useState("overview"); const [selected, setSelected] = useState(null); const [refreshing, setRefreshing] = useState(false);
  const [editingUser, setEditingUser] = useState(null); const [newPw, setNewPw] = useState(""); const [pwSuccess, setPwSuccess] = useState(""); const [saving, setSaving] = useState(false);
  const [emailGroup, setEmailGroup] = useState("Novair"); const [newEmail, setNewEmail] = useState(""); const [emailSaving, setEmailSaving] = useState(false);
  const [adminHospital, setAdminHospital] = useState(ALL_HOSPITALS[0]); const [adminTitle, setAdminTitle] = useState(""); const [adminDesc, setAdminDesc] = useState(""); const [adminDate, setAdminDate] = useState("");
  const [adminSubmitting, setAdminSubmitting] = useState(false); const [adminSuccess, setAdminSuccess] = useState(false);
  const [newUserId, setNewUserId] = useState(""); const [newUserName, setNewUserName] = useState(""); const [newUserRole, setNewUserRole] = useState("company"); const [newUserPw, setNewUserPw] = useState(""); const [addingUser, setAddingUser] = useState(false);

  const totalComplaints = complaints.length; const totalOpen = complaints.filter(c => c.status !== "Resolved").length;
  const handleRefresh = async () => { setRefreshing(true); await onRefresh(); setRefreshing(false); };
  const handleResolve = async (id, date) => { await resolveComplaint(id, date, "Admin"); await onRefresh(); };
  const handleRequestResolve = async (id) => { await requestResolution(id, "Admin"); await onRefresh(); };
  const handleApprove = async (id) => { await approveResolution(id, "Admin"); await onRefresh(); };
  const handleReject = async (id, reason) => { await rejectResolution(id); await addComment(id, `Resolution rejected by Admin: ${reason}`, "Admin", "admin"); await onRefresh(); };
  const handleUnresolve = async (id) => { await unresolveComplaint(id); await onRefresh(); };
  const handleDelete = async (id) => { await deleteComplaint(id); await onRefresh(); };
  const handlePasswordChange = async (userId) => {
    if (!newPw.trim() || saving) return;
    if (newPw.trim().length < 8) { alert("Password must be at least 8 characters"); return; }
    setSaving(true);
    const ok = await updatePassword(userId, newPw.trim());
    setSaving(false);
    if (ok) { setPwSuccess(userId); setNewPw(""); setEditingUser(null); await onRefresh(); setTimeout(() => setPwSuccess(""), 2500); }
    else alert("Password update failed");
  };
  const handleAddEmail = async () => { if (!newEmail.trim() || emailSaving) return; setEmailSaving(true); await addEmail(emailGroup, newEmail.trim()); setNewEmail(""); setEmailSaving(false); await onRefresh(); };
  const handleDeleteEmail = async (id) => { await deleteEmailRecord(id); await onRefresh(); };
  const submitAdminComplaint = async () => { if (!adminTitle.trim() || !adminDesc.trim() || adminSubmitting) return; setAdminSubmitting(true); const r = await insertComplaint(adminHospital, adminTitle.trim(), adminDesc.trim(), adminDate || null); setAdminSubmitting(false); if (r) { setAdminTitle(""); setAdminDesc(""); setAdminDate(""); setAdminSuccess(true); setTimeout(() => setAdminSuccess(false), 2500); await onRefresh(); } };
  const handleAddUser = async () => {
    if (!newUserId.trim() || !newUserName.trim() || !newUserPw.trim() || addingUser) return;
    if (newUserPw.trim().length < 8) { alert("Password must be at least 8 characters"); return; }
    setAddingUser(true);
    const created = await createUser(newUserId.trim().toLowerCase().replace(/\s+/g, ""), newUserName.trim(), newUserRole, newUserPw.trim());
    setAddingUser(false);
    if (!created) { alert("Could not create user"); return; }
    setNewUserId(""); setNewUserName(""); setNewUserPw(""); await onRefresh();
  };
  const handleDeleteUser = async (id) => { if (window.confirm("Delete this user?")) { await deleteUser(id); await onRefresh(); } };

  const hospitalUsers = users.filter(u => u.role === "hospital");
  const companyUsers = users.filter(u => u.role === "company" || u.role === "admin");
  const emailGroupOptions = ["Novair", "Intexim", "Z-Corps", "Amex", "UNDP"];

  return (
    <div style={styles.shell}>
      <AppHeader user={user}>
        <button style={styles.btnText} onClick={handleRefresh}>{refreshing ? "…" : "REFRESH"}</button>
        <button style={styles.btnBlack} onClick={onLogout}>SIGN OUT</button>
      </AppHeader>
      <div className="slide-down tab-bar-responsive" style={{ ...styles.tabBar, animationDelay: "0.15s" }}>
        {["overview","complaints","submit","passwords","emails"].map(t => (<button key={t} style={tab === t ? styles.tabActive : styles.tabInactive} onClick={() => { setTab(t); setSelected(null); }}>{t === "overview" ? "Overview" : t === "complaints" ? "Complaints" : t === "submit" ? "Submit" : t === "passwords" ? "Passwords" : "Emails"}</button>))}
      </div>
      <main className="main-responsive" style={styles.main}>
        <div key={tab} className="scale-in">
        {tab === "overview" && <OverviewTab hospitals={ALL_HOSPITALS} complaints={complaints} siteNotes={siteNotes} notifEmails={notifEmails} isAdmin={true} onRefresh={onRefresh} />}
        {tab === "complaints" && !selected && (<><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}><div></div><button style={styles.btnBlack} onClick={() => downloadCSV(complaints, "all-complaints")}>DOWNLOAD DATA</button></div><div style={styles.statsBar}><div style={styles.statBox}><div style={styles.statNum}>{totalComplaints}</div><div className="stat-label-resp" style={styles.statLabel}>Total</div></div><div style={styles.statBox}><div style={{ ...styles.statNum, color: C.red }}>{totalOpen}</div><div className="stat-label-resp" style={styles.statLabel}>Open</div></div><div style={styles.statBox}><div style={{ ...styles.statNum, color: C.green }}>{totalComplaints - totalOpen}</div><div className="stat-label-resp" style={styles.statLabel}>Resolved</div></div></div><GroupedHospitalList groups={GROUPS} complaints={complaints} onSelect={setSelected} /></>)}
        {tab === "complaints" && selected && (<ComplaintListView hospital={selected} complaints={complaints} currentUser={user} canResolve={true} canComment={true} isAdmin={true} isAmex={false} isProvider={false} onBack={() => setSelected(null)} onResolve={handleResolve} onRequestResolve={handleRequestResolve} onApprove={handleApprove} onReject={handleReject} onUnresolve={handleUnresolve} onDelete={handleDelete} onRefresh={onRefresh} />)}
        {tab === "submit" && (<section style={styles.formSection}><h2 style={styles.sectionTitle}>Submit Complaint on Behalf of Hospital</h2><select style={{ ...styles.input, cursor: "pointer" }} value={adminHospital} onChange={e => setAdminHospital(e.target.value)}>{ALL_HOSPITALS.map(h => <option key={h} value={h}>{h} — {getProvider(h)}</option>)}</select><ComplaintTypeSelect value={adminTitle} onChange={e => setAdminTitle(e.target.value)} style={styles.input} /><textarea style={{ ...styles.input, minHeight: 100, resize: "vertical", fontFamily: "inherit" }} placeholder="Describe the issue…" value={adminDesc} onChange={e => setAdminDesc(e.target.value)} /><div style={{ marginBottom: 12 }}><label style={{ fontSize: 13, color: "#4a5568", marginBottom: 4, display: "block" }}>Date (leave empty for today)</label><input style={styles.input} type="date" value={adminDate} onChange={e => setAdminDate(e.target.value)} /></div><button style={{ ...styles.btnPrimary, opacity: (!adminTitle.trim() || !adminDesc.trim() || adminSubmitting) ? 0.5 : 1 }} onClick={submitAdminComplaint}>{adminSubmitting ? "Submitting…" : "Submit Complaint"}</button>{adminSuccess && <p style={styles.successMsg}>Complaint submitted for {adminHospital}.</p>}</section>)}
        {tab === "passwords" && (<>
          <div style={styles.formSection}><h2 style={styles.sectionTitle}>Add New User</h2><p style={{ fontSize: 13, color: "#718096", marginBottom: 12 }}>Passwords must be at least 8 characters. Password values are never shown in the admin list.</p><div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}><div style={{ flex: 1, minWidth: 120 }}><label style={{ fontSize: 12, color: "#718096", display: "block", marginBottom: 2 }}>ID</label><input style={{ ...styles.pwInput, width: "100%", padding: "8px 10px" }} placeholder="userid" value={newUserId} onChange={e => setNewUserId(e.target.value)} /></div><div style={{ flex: 1, minWidth: 120 }}><label style={{ fontSize: 12, color: "#718096", display: "block", marginBottom: 2 }}>Display Name</label><input style={{ ...styles.pwInput, width: "100%", padding: "8px 10px" }} placeholder="Name" value={newUserName} onChange={e => setNewUserName(e.target.value)} /></div><div style={{ minWidth: 100 }}><label style={{ fontSize: 12, color: "#718096", display: "block", marginBottom: 2 }}>Role</label><select style={{ ...styles.pwInput, width: "100%", padding: "8px 10px" }} value={newUserRole} onChange={e => setNewUserRole(e.target.value)}><option value="company">Company (view-only)</option><option value="hospital">Hospital</option></select></div><div style={{ flex: 1, minWidth: 120 }}><label style={{ fontSize: 12, color: "#718096", display: "block", marginBottom: 2 }}>Password</label><input style={{ ...styles.pwInput, width: "100%", padding: "8px 10px" }} type="password" placeholder="Min 8 characters" value={newUserPw} onChange={e => setNewUserPw(e.target.value)} /></div><button style={styles.pwSaveBtn} onClick={handleAddUser}>{addingUser ? "…" : "Add User"}</button></div></div>
          <h2 style={styles.sectionTitle}>Company & Admin Accounts</h2>
          {companyUsers.map(u => (<div key={u.id} style={styles.pwCard}><div style={styles.pwRow}><div><strong style={styles.pwName}>{u.name}</strong><span style={styles.pwRole}>{u.role === "admin" ? "Admin" : "Company"}</span></div><div style={styles.pwRight}><span style={styles.pwCurrent}>Password: <code>••••••••</code></span>{editingUser === u.id ? (<div style={styles.pwEditRow}><input style={styles.pwInput} type="password" placeholder="New password (min 8)" value={newPw} onChange={e => setNewPw(e.target.value)} onKeyDown={e => e.key === "Enter" && handlePasswordChange(u.id)} /><button style={styles.pwSaveBtn} onClick={() => handlePasswordChange(u.id)}>{saving ? "…" : "Save"}</button><button style={styles.pwCancelBtn} onClick={() => { setEditingUser(null); setNewPw(""); }}>✕</button></div>) : (<button style={styles.pwChangeBtn} onClick={() => { setEditingUser(u.id); setNewPw(""); }}>Change</button>)}{u.role !== "admin" && <button style={{ fontSize: 12, color: "#e53e3e", background: "none", border: "none", cursor: "pointer" }} onClick={() => handleDeleteUser(u.id)}>Delete</button>}</div></div>{pwSuccess === u.id && <p style={styles.successMsg}>Password updated.</p>}</div>))}
          {Object.entries(GROUPS).map(([provider, hospitals]) => (<div key={provider}><h2 style={{ ...styles.sectionTitle, marginTop: 28 }}>{provider} — Hospital Accounts</h2>{hospitalUsers.filter(u => hospitals.some(h => h.toLowerCase().replace(/\s+/g, "") === u.id.toLowerCase().replace(/\s+/g, ""))).map(u => (<div key={u.id} style={styles.pwCard}><div style={styles.pwRow}><div><strong style={styles.pwName}>{u.name}</strong></div><div style={styles.pwRight}><span style={styles.pwCurrent}>Password: <code>••••••••</code></span>{editingUser === u.id ? (<div style={styles.pwEditRow}><input style={styles.pwInput} type="password" placeholder="New password (min 8)" value={newPw} onChange={e => setNewPw(e.target.value)} onKeyDown={e => e.key === "Enter" && handlePasswordChange(u.id)} /><button style={styles.pwSaveBtn} onClick={() => handlePasswordChange(u.id)}>{saving ? "…" : "Save"}</button><button style={styles.pwCancelBtn} onClick={() => { setEditingUser(null); setNewPw(""); }}>✕</button></div>) : (<button style={styles.pwChangeBtn} onClick={() => { setEditingUser(u.id); setNewPw(""); }}>Change</button>)}<button style={{ fontSize: 12, color: "#e53e3e", background: "none", border: "none", cursor: "pointer" }} onClick={() => handleDeleteUser(u.id)}>Delete</button></div></div>{pwSuccess === u.id && <p style={styles.successMsg}>Password updated.</p>}</div>))}</div>))}
        </>)}
        {tab === "emails" && (<>
          <h2 style={styles.sectionTitle}>Email Notifications</h2><p style={{ fontSize: 14, color: "#4a5568", marginBottom: 20, lineHeight: 1.5 }}>When a complaint is submitted, emails go to that hospital&apos;s service-provider group plus Amex and UNDP (via Resend / <code>RESEND_API_KEY</code>). Shutdown emails are sent manually from the Overview tab.</p>
          <div style={styles.formSection}><h3 style={{ fontSize: 15, fontWeight: 600, color: "#1a2332", margin: "0 0 12px" }}>Add Email</h3><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><select style={{ ...styles.pwInput, width: 150, padding: "8px 10px" }} value={emailGroup} onChange={e => setEmailGroup(e.target.value)}>{emailGroupOptions.map(g => <option key={g} value={g}>{g}</option>)}</select><input style={{ ...styles.pwInput, flex: 1, minWidth: 200, padding: "8px 10px" }} type="email" placeholder="email@example.com" value={newEmail} onChange={e => setNewEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && handleAddEmail()} /><button style={styles.pwSaveBtn} onClick={handleAddEmail}>{emailSaving ? "…" : "Add"}</button></div></div>
          {emailGroupOptions.map(g => { const ge = notifEmails.filter(e => e.group_name === g); if (!ge.length) return null; return (<div key={g} style={{ marginTop: 20 }}><h3 style={{ fontSize: 15, fontWeight: 600, color: "#0e7c6b", margin: "0 0 10px" }}>{g}</h3>{ge.map(e => (<div key={e.id} style={{ ...styles.pwCard, display: "flex", justifyContent: "space-between", alignItems: "center" }}><span style={{ fontSize: 14, color: "#1a2332" }}>{e.email}</span><button style={{ ...styles.pwCancelBtn, color: "#e53e3e", fontSize: 14 }} onClick={() => handleDeleteEmail(e.id)}>Remove</button></div>))}</div>); })}
          {notifEmails.length === 0 && <p style={styles.empty}>No notification emails configured yet.</p>}
        </>)}
        </div>
      </main>
    </div>
  );
}

/* ─── Company Dashboard ─── */
function CompanyDashboard({ user, complaints, siteNotes, onRefresh, onLogout }) {
  const [tab, setTab] = useState("overview"); const [selected, setSelected] = useState(null); const [refreshing, setRefreshing] = useState(false);
  const seesAll = ["Novair", "Amex", "UNDP", "CMU"].includes(user.name);
  const isAmex = user.name === "Amex";
  const isProvider = ["Novair", "Intexim", "Z-Corps"].includes(user.name);
  const myGroups = {}; if (seesAll) { Object.assign(myGroups, GROUPS); } else if (GROUPS[user.name]) { myGroups[user.name] = GROUPS[user.name]; } else { Object.assign(myGroups, GROUPS); }
  const myHospitals = Object.values(myGroups).flat();
  const myComplaints = complaints.filter(c => myHospitals.includes(c.hospital));
  const totalComplaints = myComplaints.length; const totalOpen = myComplaints.filter(c => c.status !== "Resolved").length;
  const canCommentOnHospital = (hospital) => { if (["Novair", "Amex"].includes(user.name)) return true; return getProvider(hospital) === user.name; };
  const canResolveHospital = isAmex || isProvider;
  const handleRefresh = async () => { setRefreshing(true); await onRefresh(); setRefreshing(false); };
  const handleResolve = async (id) => { await resolveComplaint(id, null, user.name); await onRefresh(); };
  const handleRequestResolve = async (id) => { await requestResolution(id, user.name); await onRefresh(); };
  const handleApprove = async (id) => { await approveResolution(id, user.name); await onRefresh(); };
  const handleReject = async (id, reason) => { await rejectResolution(id); await addComment(id, `Resolution rejected by ${user.name}: ${reason}`, user.name, "company"); await onRefresh(); };
  return (
    <div style={styles.shell}>
      <AppHeader user={user}>
        <button style={styles.btnText} onClick={handleRefresh}>{refreshing ? "…" : "REFRESH"}</button>
        <button style={styles.btnBlack} onClick={onLogout}>SIGN OUT</button>
      </AppHeader>
      <div className="slide-down tab-bar-responsive" style={{ ...styles.tabBar, animationDelay: "0.15s" }}>
        <button className="tab-btn" style={tab === "overview" ? styles.tabActive : styles.tabInactive} onClick={() => { setTab("overview"); setSelected(null); }}>Overview</button>
        <button className="tab-btn" style={tab === "complaints" ? styles.tabActive : styles.tabInactive} onClick={() => { setTab("complaints"); setSelected(null); }}>Complaints</button>
      </div>
      <main className="main-responsive" style={styles.main}>
        <div key={tab} className="scale-in">
        {tab === "overview" && <OverviewTab hospitals={myHospitals} complaints={complaints} siteNotes={siteNotes} notifEmails={[]} isAdmin={false} onRefresh={onRefresh} />}
        {tab === "complaints" && !selected && (<><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}><div></div><button style={styles.btnBlack} onClick={() => downloadCSV(myComplaints, user.name.toLowerCase() + "-complaints")}>DOWNLOAD DATA</button></div><div style={styles.statsBar}><div style={styles.statBox}><div style={styles.statNum}>{totalComplaints}</div><div className="stat-label-resp" style={styles.statLabel}>Total</div></div><div style={styles.statBox}><div style={{ ...styles.statNum, color: C.red }}>{totalOpen}</div><div className="stat-label-resp" style={styles.statLabel}>Open</div></div><div style={styles.statBox}><div style={{ ...styles.statNum, color: C.green }}>{totalComplaints - totalOpen}</div><div className="stat-label-resp" style={styles.statLabel}>Resolved</div></div></div><GroupedHospitalList groups={myGroups} complaints={complaints} onSelect={setSelected} /></>)}
        {tab === "complaints" && selected && (<ComplaintListView hospital={selected} complaints={complaints} currentUser={user} canResolve={canResolveHospital} canComment={canCommentOnHospital(selected)} isAdmin={false} isAmex={isAmex} isProvider={isProvider} onBack={() => setSelected(null)} onResolve={handleResolve} onRequestResolve={handleRequestResolve} onApprove={handleApprove} onReject={handleReject} onUnresolve={() => {}} onDelete={() => {}} onRefresh={onRefresh} />)}
        </div>
      </main>
    </div>
  );
}

/* ─── Styles ─── */
const C = { bg: "#f0f0f0", white: "#ffffff", black: "#111111", text: "#111111", textMid: "#555555", textLight: "#999999", border: "#d0d0d0", borderLight: "#e0e0e0", red: "#c0392b", green: "#27ae60" };
const styles = {
  loadWrap: { minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: C.bg, fontFamily: "'DM Sans', system-ui, sans-serif" },
  loadLogo: { fontSize: 56, fontWeight: 800, color: C.black, letterSpacing: -3 },
  loginBg: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: `linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0.55)), url('https://raw.githubusercontent.com/mujtaba1119/PSA-Oxygen-Plants/main/grok-56ef8c23-e008-43f3-b316-fdf79b7fe10b.jpg') center/cover no-repeat`, fontFamily: "'DM Sans', system-ui, sans-serif", padding: 20 },
  loginCard: { background: C.white, borderRadius: 2, padding: "48px 40px", width: "100%", maxWidth: 420, border: `1px solid ${C.border}` },
  loginBrand: { display: "flex", alignItems: "center", gap: 10, marginBottom: 32 },
  brandMark: { fontSize: 32, fontWeight: 800, color: C.black, letterSpacing: -2 },
  brandText: { fontSize: 14, fontWeight: 400, color: C.textMid, letterSpacing: 1, textTransform: "uppercase" },
  loginTitle: { fontSize: 28, fontWeight: 300, color: C.black, margin: "0 0 4px", letterSpacing: -0.5 },
  loginSub: { fontSize: 14, color: C.textLight, margin: "0 0 28px" },
  input: { display: "block", width: "100%", padding: "14px 16px", fontSize: 14, border: `1px solid ${C.border}`, borderRadius: 0, marginBottom: 14, outline: "none", boxSizing: "border-box", color: C.text, background: C.white, fontFamily: "'DM Sans', system-ui, sans-serif" },
  btnPrimary: { display: "block", width: "100%", padding: "14px 0", fontSize: 14, fontWeight: 600, color: C.white, background: C.black, border: "none", borderRadius: 0, cursor: "pointer", letterSpacing: 1.5, textTransform: "uppercase" },
  err: { color: C.red, fontSize: 13, margin: "0 0 10px", textAlign: "center", fontWeight: 500 },
  shell: { minHeight: "100vh", background: C.bg, fontFamily: "'DM Sans', system-ui, sans-serif" },
  topBar: { background: C.bg, padding: "24px 28px 20px 60px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, minHeight: 100 },
  topLeft: { display: "flex", flexDirection: "column", alignItems: "center", gap: 4, width: 180, flexShrink: 0 },
  topCenter: { display: "flex", alignItems: "center", gap: 28, flexWrap: "wrap", flex: 1, justifyContent: "center", minHeight: 90 },
  topRight: { display: "flex", gap: 8, alignItems: "center", width: 180, flexShrink: 0, justifyContent: "flex-end" },
  topTitle: { fontSize: 14, fontWeight: 600, color: C.black, letterSpacing: 0.5, whiteSpace: "nowrap", textAlign: "center" },
  topUser: { fontSize: 11, color: C.textLight, marginTop: 2, letterSpacing: 0.5, textTransform: "uppercase" },
  btnBlack: { fontSize: 11, fontWeight: 600, color: C.white, background: C.black, border: "none", borderRadius: 0, padding: "8px 18px", cursor: "pointer", letterSpacing: 1, textTransform: "uppercase", whiteSpace: "nowrap" },
  btnText: { fontSize: 11, fontWeight: 600, color: C.black, background: "transparent", border: "none", borderRadius: 0, padding: "8px 12px", cursor: "pointer", letterSpacing: 1, textTransform: "uppercase", whiteSpace: "nowrap" },
  btnOutline: { fontSize: 11, fontWeight: 500, color: C.black, background: "transparent", border: `1px solid ${C.black}`, borderRadius: 0, padding: "7px 18px", cursor: "pointer", letterSpacing: 1, textTransform: "uppercase" },
  main: { maxWidth: 980, margin: "0 auto", padding: "24px 24px" },
  formSection: { background: C.white, borderRadius: 0, padding: 32, marginBottom: 28, border: `1px solid ${C.borderLight}` },
  listSection: { marginBottom: 28 },
  sectionTitle: { fontSize: 18, fontWeight: 600, color: C.black, margin: "0 0 20px", letterSpacing: -0.3 },
  card: { background: C.white, borderRadius: 0, padding: "20px 24px", marginBottom: 12, border: `1px solid ${C.borderLight}` },
  cardTop: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 8, flexWrap: "wrap" },
  cardTitle: { fontSize: 15, fontWeight: 600, color: C.black },
  cardDate: { fontSize: 12, color: C.textLight, whiteSpace: "nowrap", marginTop: 2 },
  cardDesc: { fontSize: 14, color: C.textMid, margin: 0, lineHeight: 1.7 },
  empty: { fontSize: 14, color: C.textLight, fontStyle: "italic" },
  successMsg: { color: C.green, fontSize: 14, fontWeight: 600, marginTop: 12, textAlign: "center" },
  statsBar: { display: "flex", gap: 32, marginBottom: 28, flexWrap: "wrap", justifyContent: "center" },
  statBox: { textAlign: "center" },
  statNum: { fontSize: 40, fontWeight: 300, color: C.black, letterSpacing: -1 },
  statLabel: { fontSize: 10, color: C.textLight, marginTop: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1.5 },
  hospitalGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 },
  hospitalBtn: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, width: "100%", padding: "14px 16px", background: C.white, border: `1px solid ${C.borderLight}`, borderRadius: 0, cursor: "pointer", textAlign: "left" },
  hospitalName: { flex: 1, fontSize: 14, fontWeight: 500, color: C.black },
  hospitalBadge: { fontSize: 12, fontWeight: 600, color: C.textMid, background: C.bg, borderRadius: 0, padding: "2px 10px" },
  openBadge: { fontSize: 11, fontWeight: 700, color: C.red, background: "#fdeaea", borderRadius: 0, padding: "2px 8px" },
  backBtn: { fontSize: 13, fontWeight: 500, color: C.black, background: "none", border: "none", cursor: "pointer", padding: "0 0 16px", display: "block", letterSpacing: 0.5, textTransform: "uppercase" },
  resolveBtn: { fontSize: 12, fontWeight: 600, color: C.white, background: C.green, border: "none", borderRadius: 0, padding: "8px 20px", cursor: "pointer", letterSpacing: 0.5, textTransform: "uppercase" },
  deleteBtn: { fontSize: 12, fontWeight: 600, color: C.white, background: C.red, border: "none", borderRadius: 0, padding: "8px 20px", cursor: "pointer", letterSpacing: 0.5, textTransform: "uppercase" },
  groupSection: { marginBottom: 36 },
  groupHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 8, paddingBottom: 12, borderBottom: `2px solid ${C.black}` },
  groupTitle: { fontSize: 16, fontWeight: 600, color: C.black, margin: 0, letterSpacing: 0.5, textTransform: "uppercase" },
  groupBadge: { fontSize: 12, fontWeight: 500, color: C.textMid, background: C.white, borderRadius: 0, padding: "4px 14px", border: `1px solid ${C.borderLight}` },
  tabBar: { display: "flex", gap: 8, maxWidth: 980, margin: "0 auto", padding: "12px 24px 24px", flexWrap: "wrap", justifyContent: "center" },
  tabActive: { padding: "10px 22px", fontSize: 12, fontWeight: 600, color: C.white, background: C.black, border: "none", borderRadius: 0, cursor: "pointer", letterSpacing: 1, textTransform: "uppercase" },
  tabInactive: { padding: "10px 22px", fontSize: 12, fontWeight: 500, color: C.black, background: "transparent", border: `1px solid ${C.black}`, borderRadius: 0, cursor: "pointer", letterSpacing: 1, textTransform: "uppercase" },
  pwCard: { background: C.white, borderRadius: 0, padding: "14px 18px", marginBottom: 8, border: `1px solid ${C.borderLight}` },
  pwRow: { display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 },
  pwName: { fontSize: 15, fontWeight: 600, color: C.black, marginRight: 8 },
  pwRole: { fontSize: 10, fontWeight: 600, color: C.white, background: C.black, borderRadius: 0, padding: "3px 10px", letterSpacing: 1, textTransform: "uppercase" },
  pwRight: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" },
  pwCurrent: { fontSize: 13, color: C.textLight },
  pwChangeBtn: { fontSize: 12, fontWeight: 500, color: C.black, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 0, padding: "6px 16px", cursor: "pointer" },
  pwEditRow: { display: "flex", gap: 6, alignItems: "center" },
  pwInput: { padding: "8px 12px", fontSize: 13, border: `1px solid ${C.border}`, borderRadius: 0, width: 140, outline: "none", fontFamily: "'DM Sans', system-ui, sans-serif" },
  pwSaveBtn: { fontSize: 12, fontWeight: 600, color: C.white, background: C.black, border: "none", borderRadius: 0, padding: "8px 16px", cursor: "pointer", letterSpacing: 0.5, textTransform: "uppercase" },
  pwCancelBtn: { fontSize: 13, color: C.textLight, background: "none", border: "none", cursor: "pointer", padding: "6px" },
  commentToggle: { fontSize: 12, fontWeight: 600, color: C.black, background: "none", border: "none", cursor: "pointer", padding: 0, letterSpacing: 0.5, textTransform: "uppercase" },
  commentBox: { marginTop: 10, padding: "16px 18px", background: C.bg, borderRadius: 0, border: `1px solid ${C.borderLight}` },
  commentItem: { padding: "10px 0", borderBottom: `1px solid ${C.borderLight}` },
  commentHeader: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  commentInputRow: { display: "flex", gap: 8, marginTop: 12 },
  commentInput: { flex: 1, padding: "10px 14px", fontSize: 13, border: `1px solid ${C.border}`, borderRadius: 0, outline: "none", fontFamily: "'DM Sans', system-ui, sans-serif" },
  commentSendBtn: { fontSize: 12, fontWeight: 600, color: C.white, background: C.black, border: "none", borderRadius: 0, padding: "10px 22px", cursor: "pointer", letterSpacing: 0.5, textTransform: "uppercase" },
  overviewTable: { background: C.white, borderRadius: 12, border: `1px solid ${C.borderLight}`, overflow: "auto", WebkitOverflowScrolling: "touch" },
  overviewHeaderRow: { display: "flex", padding: "0", background: "#1a1a1a", fontWeight: 600, fontSize: 10, color: "#fff", gap: 0, minWidth: 900, letterSpacing: 1.5, textTransform: "uppercase", position: "sticky", top: 0, zIndex: 2 },
  overviewRow: { display: "flex", padding: "0", borderBottom: `1px solid #eee`, gap: 0, alignItems: "stretch", minWidth: 900, transition: "background 0.15s" },
  ovCell: { padding: "14px 16px", borderRight: `1px solid #eee`, fontSize: 13, display: "flex", flexDirection: "column", justifyContent: "center" },
  ovCellHeader: { padding: "14px 16px", borderRight: "1px solid #333", fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center" },
  ovCellSr: { width: 40, flexShrink: 0, justifyContent: "center", alignItems: "center" },
  ovCellSite: { width: 160, flexShrink: 0 },
  ovCellProvider: { width: 100, flexShrink: 0 },
  ovCellStatus: { width: 120, flexShrink: 0, alignItems: "center", justifyContent: "center" },
  ovCellOpen: { flex: 1, minWidth: 170 },
  ovCellNote: { flex: 1, minWidth: 170, borderRight: "none" },
};
