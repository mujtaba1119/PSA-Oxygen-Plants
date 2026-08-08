import { useState, useEffect, useCallback } from "react";
import { supabase } from "./supabase";

/* ─── Data ─── */
const HOSPITALS = [
  "Rawalpindi","Bhakkar","Sahiwal","Toba Tek Singh","Kohat","Swat","Larkana","Jamshoro",
  "Quetta SZ","DM Jamali","Khuzdar","Sibbi","Timergara","Malakand","Bannu","Neelum",
  "Jhelum","Haveli","Nawabshah","Zhob","Sargodha","Rahim Yar Khan","Nagar","Ghizer",
  "Khaplu","Astore","Jhang","Quetta Sandeman","Loralai","Islamabad","Faisalabad",
  "Bhimber","Multan","Pangjur","Kharan","Karachi"
];

/* ─── Supabase helpers ─── */
async function fetchComplaints() {
  const { data, error } = await supabase.from("complaints").select("*").order("created_at", { ascending: false });
  if (error) { console.error(error); return []; }
  return data;
}

async function insertComplaint(hospital, title, description) {
  const { data, error } = await supabase.from("complaints").insert([{ hospital, title, description }]).select();
  if (error) { console.error(error); return null; }
  return data[0];
}

async function fetchUsers() {
  const { data, error } = await supabase.from("users").select("*");
  if (error) { console.error(error); return []; }
  return data;
}

async function updatePassword(userId, newPassword) {
  const { error } = await supabase.from("users").update({ password: newPassword }).eq("id", userId);
  return !error;
}

/* ─── App ─── */
export default function App() {
  const [user, setUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [complaints, setComplaints] = useState([]);
  const [ready, setReady] = useState(false);

  const reload = useCallback(async () => {
    const [c, u] = await Promise.all([fetchComplaints(), fetchUsers()]);
    setComplaints(c);
    setUsers(u);
  }, []);

  useEffect(() => { reload().then(() => setReady(true)); }, [reload]);

  useEffect(() => {
    if (user?.role === "company" || user?.role === "admin") {
      const iv = setInterval(reload, 30000);
      return () => clearInterval(iv);
    }
  }, [user, reload]);

  if (!ready) return <LoadingScreen />;
  if (!user) return <LoginScreen users={users} onLogin={setUser} />;
  if (user.role === "hospital") return <HospitalDashboard user={user} complaints={complaints} onRefresh={reload} onLogout={() => setUser(null)} />;
  if (user.role === "admin") return <AdminDashboard user={user} users={users} complaints={complaints} onRefresh={reload} onLogout={() => setUser(null)} />;
  return <CompanyDashboard user={user} complaints={complaints} onRefresh={reload} onLogout={() => setUser(null)} />;
}

/* ─── Loading ─── */
function LoadingScreen() {
  return (
    <div style={styles.loadWrap}>
      <div style={styles.loadLogo}>O₂</div>
      <p style={{ color: "#6b7280", marginTop: 12 }}>Loading portal…</p>
    </div>
  );
}

/* ─── Login ─── */
function LoginScreen({ users, onLogin }) {
  const [id, setId] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");

  const submit = () => {
    const clean = s => s.trim().toLowerCase().replace(/\s+/g, "");
    const found = users.find(u => (clean(u.name) === clean(id) || clean(u.id) === clean(id)) && clean(u.password) === clean(pw));
    if (!found) { setErr("Invalid credentials"); return; }
    onLogin(found);
  };

  return (
    <div style={styles.loginBg}>
      <div style={styles.loginCard}>
        <div style={styles.loginBrand}>
          <span style={styles.brandMark}>O₂</span>
          <span style={styles.brandText}>PSA Oxygen Plant</span>
        </div>
        <h2 style={styles.loginTitle}>Complaint Portal</h2>
        <p style={styles.loginSub}>Sign in with your credentials</p>
        <input style={styles.input} placeholder="Username" value={id} onChange={e => { setId(e.target.value); setErr(""); }} onKeyDown={e => e.key === "Enter" && submit()} />
        <input style={styles.input} type="password" placeholder="Password" value={pw} onChange={e => { setPw(e.target.value); setErr(""); }} onKeyDown={e => e.key === "Enter" && submit()} />
        {err && <p style={styles.err}>{err}</p>}
        <button style={styles.btnPrimary} onClick={submit}>Sign In</button>
      </div>
    </div>
  );
}

/* ─── Hospital Dashboard ─── */
function HospitalDashboard({ user, complaints, onRefresh, onLogout }) {
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const mine = complaints.filter(c => c.hospital === user.name);

  const submitComplaint = async () => {
    if (!title.trim() || !desc.trim() || submitting) return;
    setSubmitting(true);
    const result = await insertComplaint(user.name, title.trim(), desc.trim());
    setSubmitting(false);
    if (result) {
      setTitle(""); setDesc("");
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2500);
      await onRefresh();
    }
  };

  return (
    <div style={styles.shell}>
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={styles.headerMark}>O₂</span>
          <span style={styles.headerName}>{user.name} Hospital</span>
        </div>
        <button style={styles.btnLogout} onClick={onLogout}>Sign Out</button>
      </header>
      <main style={styles.main}>
        <section style={styles.formSection}>
          <h2 style={styles.sectionTitle}>Register a Complaint</h2>
          <input style={styles.input} placeholder="Complaint title" value={title} onChange={e => setTitle(e.target.value)} />
          <textarea style={{ ...styles.input, minHeight: 100, resize: "vertical", fontFamily: "inherit" }} placeholder="Describe the issue in detail…" value={desc} onChange={e => setDesc(e.target.value)} />
          <button style={{ ...styles.btnPrimary, opacity: (!title.trim() || !desc.trim() || submitting) ? 0.5 : 1 }} onClick={submitComplaint}>
            {submitting ? "Submitting…" : "Submit Complaint"}
          </button>
          {success && <p style={styles.successMsg}>Complaint registered successfully.</p>}
        </section>
        <section style={styles.listSection}>
          <h2 style={styles.sectionTitle}>Your Complaints ({mine.length})</h2>
          {mine.length === 0 && <p style={styles.empty}>No complaints registered yet.</p>}
          {mine.map(c => (
            <div key={c.id} style={styles.card}>
              <div style={styles.cardTop}>
                <strong style={styles.cardTitle}>{c.title}</strong>
                <span style={styles.cardDate}>{new Date(c.created_at).toLocaleDateString("en-PK", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
              </div>
              <p style={styles.cardDesc}>{c.description}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}

/* ─── Admin Dashboard (Amex) ─── */
function AdminDashboard({ user, users, complaints, onRefresh, onLogout }) {
  const [tab, setTab] = useState("complaints"); // "complaints" or "passwords"
  const [selected, setSelected] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [newPw, setNewPw] = useState("");
  const [pwSuccess, setPwSuccess] = useState("");
  const [saving, setSaving] = useState(false);

  const hospitalComplaints = selected ? complaints.filter(c => c.hospital === selected) : [];
  const countFor = h => complaints.filter(c => c.hospital === h).length;
  const totalComplaints = complaints.length;

  const handleRefresh = async () => { setRefreshing(true); await onRefresh(); setRefreshing(false); };

  const handlePasswordChange = async (userId) => {
    if (!newPw.trim() || saving) return;
    setSaving(true);
    const ok = await updatePassword(userId, newPw.trim());
    setSaving(false);
    if (ok) {
      setPwSuccess(userId);
      setNewPw("");
      setEditingUser(null);
      await onRefresh();
      setTimeout(() => setPwSuccess(""), 2500);
    }
  };

  const hospitalUsers = users.filter(u => u.role === "hospital");
  const companyUsers = users.filter(u => u.role === "company" || u.role === "admin");

  return (
    <div style={styles.shell}>
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={styles.headerMark}>O₂</span>
          <span style={styles.headerName}>{user.name} — Admin</span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button style={styles.btnLogout} onClick={handleRefresh}>{refreshing ? "Refreshing…" : "Refresh"}</button>
          <button style={styles.btnLogout} onClick={onLogout}>Sign Out</button>
        </div>
      </header>

      {/* Tabs */}
      <div style={styles.tabBar}>
        <button style={tab === "complaints" ? styles.tabActive : styles.tabInactive} onClick={() => { setTab("complaints"); setSelected(null); }}>Complaints</button>
        <button style={tab === "passwords" ? styles.tabActive : styles.tabInactive} onClick={() => setTab("passwords")}>Manage Passwords</button>
      </div>

      <main style={styles.main}>
        {tab === "complaints" && !selected && (
          <>
            <div style={styles.statsBar}>
              <div style={styles.statBox}>
                <div style={styles.statNum}>{totalComplaints}</div>
                <div style={styles.statLabel}>Total Complaints</div>
              </div>
              <div style={styles.statBox}>
                <div style={styles.statNum}>36</div>
                <div style={styles.statLabel}>Hospitals</div>
              </div>
            </div>
            <h2 style={styles.sectionTitle}>Hospitals</h2>
            <div style={styles.hospitalGrid}>
              {HOSPITALS.map((h, i) => (
                <button key={h} style={styles.hospitalBtn} onClick={() => setSelected(h)}>
                  <span style={styles.hospitalIndex}>{i + 1}</span>
                  <span style={styles.hospitalName}>{h}</span>
                  <span style={styles.hospitalBadge}>{countFor(h)}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {tab === "complaints" && selected && (
          <>
            <button style={styles.backBtn} onClick={() => setSelected(null)}>← All Hospitals</button>
            <h2 style={styles.sectionTitle}>{selected} — Complaints ({hospitalComplaints.length})</h2>
            {hospitalComplaints.length === 0 && <p style={styles.empty}>No complaints from this hospital.</p>}
            {hospitalComplaints.map(c => (
              <div key={c.id} style={styles.card}>
                <div style={styles.cardTop}>
                  <strong style={styles.cardTitle}>{c.title}</strong>
                  <span style={styles.cardDate}>{new Date(c.created_at).toLocaleDateString("en-PK", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                </div>
                <p style={styles.cardDesc}>{c.description}</p>
              </div>
            ))}
          </>
        )}

        {tab === "passwords" && (
          <>
            <h2 style={styles.sectionTitle}>Company & Admin Passwords</h2>
            {companyUsers.map(u => (
              <div key={u.id} style={styles.pwCard}>
                <div style={styles.pwRow}>
                  <div>
                    <strong style={styles.pwName}>{u.name}</strong>
                    <span style={styles.pwRole}>{u.role === "admin" ? "Admin" : "Company"}</span>
                  </div>
                  <div style={styles.pwRight}>
                    <span style={styles.pwCurrent}>Current: <code>{u.password}</code></span>
                    {editingUser === u.id ? (
                      <div style={styles.pwEditRow}>
                        <input style={styles.pwInput} placeholder="New password" value={newPw} onChange={e => setNewPw(e.target.value)} onKeyDown={e => e.key === "Enter" && handlePasswordChange(u.id)} />
                        <button style={styles.pwSaveBtn} onClick={() => handlePasswordChange(u.id)}>{saving ? "…" : "Save"}</button>
                        <button style={styles.pwCancelBtn} onClick={() => { setEditingUser(null); setNewPw(""); }}>✕</button>
                      </div>
                    ) : (
                      <button style={styles.pwChangeBtn} onClick={() => { setEditingUser(u.id); setNewPw(""); }}>Change</button>
                    )}
                  </div>
                </div>
                {pwSuccess === u.id && <p style={styles.successMsg}>Password updated.</p>}
              </div>
            ))}

            <h2 style={{ ...styles.sectionTitle, marginTop: 28 }}>Hospital Passwords</h2>
            {hospitalUsers.map(u => (
              <div key={u.id} style={styles.pwCard}>
                <div style={styles.pwRow}>
                  <div>
                    <strong style={styles.pwName}>{u.name}</strong>
                  </div>
                  <div style={styles.pwRight}>
                    <span style={styles.pwCurrent}>Current: <code>{u.password}</code></span>
                    {editingUser === u.id ? (
                      <div style={styles.pwEditRow}>
                        <input style={styles.pwInput} placeholder="New password" value={newPw} onChange={e => setNewPw(e.target.value)} onKeyDown={e => e.key === "Enter" && handlePasswordChange(u.id)} />
                        <button style={styles.pwSaveBtn} onClick={() => handlePasswordChange(u.id)}>{saving ? "…" : "Save"}</button>
                        <button style={styles.pwCancelBtn} onClick={() => { setEditingUser(null); setNewPw(""); }}>✕</button>
                      </div>
                    ) : (
                      <button style={styles.pwChangeBtn} onClick={() => { setEditingUser(u.id); setNewPw(""); }}>Change</button>
                    )}
                  </div>
                </div>
                {pwSuccess === u.id && <p style={styles.successMsg}>Password updated.</p>}
              </div>
            ))}
          </>
        )}
      </main>
    </div>
  );
}

/* ─── Company Dashboard ─── */
function CompanyDashboard({ user, complaints, onRefresh, onLogout }) {
  const [selected, setSelected] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const hospitalComplaints = selected ? complaints.filter(c => c.hospital === selected) : [];
  const countFor = h => complaints.filter(c => c.hospital === h).length;
  const totalComplaints = complaints.length;

  const handleRefresh = async () => { setRefreshing(true); await onRefresh(); setRefreshing(false); };

  return (
    <div style={styles.shell}>
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={styles.headerMark}>O₂</span>
          <span style={styles.headerName}>{user.name}</span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button style={styles.btnLogout} onClick={handleRefresh}>{refreshing ? "Refreshing…" : "Refresh"}</button>
          <button style={styles.btnLogout} onClick={onLogout}>Sign Out</button>
        </div>
      </header>
      <main style={styles.main}>
        {!selected ? (
          <>
            <div style={styles.statsBar}>
              <div style={styles.statBox}>
                <div style={styles.statNum}>{totalComplaints}</div>
                <div style={styles.statLabel}>Total Complaints</div>
              </div>
              <div style={styles.statBox}>
                <div style={styles.statNum}>36</div>
                <div style={styles.statLabel}>Hospitals</div>
              </div>
            </div>
            <h2 style={styles.sectionTitle}>Hospitals</h2>
            <div style={styles.hospitalGrid}>
              {HOSPITALS.map((h, i) => (
                <button key={h} style={styles.hospitalBtn} onClick={() => setSelected(h)}>
                  <span style={styles.hospitalIndex}>{i + 1}</span>
                  <span style={styles.hospitalName}>{h}</span>
                  <span style={styles.hospitalBadge}>{countFor(h)}</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <button style={styles.backBtn} onClick={() => setSelected(null)}>← All Hospitals</button>
            <h2 style={styles.sectionTitle}>{selected} — Complaints ({hospitalComplaints.length})</h2>
            {hospitalComplaints.length === 0 && <p style={styles.empty}>No complaints from this hospital.</p>}
            {hospitalComplaints.map(c => (
              <div key={c.id} style={styles.card}>
                <div style={styles.cardTop}>
                  <strong style={styles.cardTitle}>{c.title}</strong>
                  <span style={styles.cardDate}>{new Date(c.created_at).toLocaleDateString("en-PK", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                </div>
                <p style={styles.cardDesc}>{c.description}</p>
              </div>
            ))}
          </>
        )}
      </main>
    </div>
  );
}

/* ─── Styles ─── */
const C = {
  bg: "#f0f4f8", white: "#ffffff", brand: "#0e7c6b", brandDark: "#095e52", brandLight: "#e6f5f2",
  text: "#1a2332", textMid: "#4a5568", textLight: "#718096", border: "#e2e8f0", red: "#e53e3e", green: "#38a169",
};

const styles = {
  loadWrap: { minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: C.bg, fontFamily: "'Inter', system-ui, sans-serif" },
  loadLogo: { fontSize: 48, fontWeight: 800, color: C.brand, letterSpacing: -2 },
  loginBg: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: `linear-gradient(135deg, ${C.brand} 0%, ${C.brandDark} 100%)`, fontFamily: "'Inter', system-ui, sans-serif", padding: 20 },
  loginCard: { background: C.white, borderRadius: 16, padding: "40px 32px", width: "100%", maxWidth: 400, boxShadow: "0 20px 60px rgba(0,0,0,0.2)" },
  loginBrand: { display: "flex", alignItems: "center", gap: 10, marginBottom: 24 },
  brandMark: { fontSize: 28, fontWeight: 800, color: C.brand, letterSpacing: -1 },
  brandText: { fontSize: 16, fontWeight: 600, color: C.textMid },
  loginTitle: { fontSize: 22, fontWeight: 700, color: C.text, margin: "0 0 4px" },
  loginSub: { fontSize: 14, color: C.textLight, margin: "0 0 20px" },
  input: { display: "block", width: "100%", padding: "12px 14px", fontSize: 14, border: `1px solid ${C.border}`, borderRadius: 8, marginBottom: 12, outline: "none", boxSizing: "border-box", color: C.text, background: C.bg, transition: "border 0.15s" },
  btnPrimary: { display: "block", width: "100%", padding: "12px 0", fontSize: 15, fontWeight: 600, color: "#fff", background: C.brand, border: "none", borderRadius: 8, cursor: "pointer", transition: "background 0.15s" },
  err: { color: C.red, fontSize: 13, margin: "0 0 10px", textAlign: "center" },
  shell: { minHeight: "100vh", background: C.bg, fontFamily: "'Inter', system-ui, sans-serif" },
  header: { background: C.white, borderBottom: `1px solid ${C.border}`, padding: "0 24px", height: 56, display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 10 },
  headerLeft: { display: "flex", alignItems: "center", gap: 10 },
  headerMark: { fontSize: 22, fontWeight: 800, color: C.brand, letterSpacing: -1 },
  headerName: { fontSize: 15, fontWeight: 600, color: C.text },
  btnLogout: { fontSize: 13, fontWeight: 500, color: C.textMid, background: "none", border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 14px", cursor: "pointer" },
  main: { maxWidth: 800, margin: "0 auto", padding: "24px 20px" },
  formSection: { background: C.white, borderRadius: 12, padding: 24, marginBottom: 24, border: `1px solid ${C.border}` },
  listSection: { marginBottom: 24 },
  sectionTitle: { fontSize: 17, fontWeight: 700, color: C.text, margin: "0 0 16px" },
  card: { background: C.white, borderRadius: 10, padding: "16px 18px", marginBottom: 10, border: `1px solid ${C.border}` },
  cardTop: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 6 },
  cardTitle: { fontSize: 15, fontWeight: 600, color: C.text },
  cardDate: { fontSize: 12, color: C.textLight, whiteSpace: "nowrap", marginTop: 2 },
  cardDesc: { fontSize: 14, color: C.textMid, margin: 0, lineHeight: 1.55 },
  empty: { fontSize: 14, color: C.textLight, fontStyle: "italic" },
  successMsg: { color: C.green, fontSize: 14, fontWeight: 500, marginTop: 10, textAlign: "center" },
  statsBar: { display: "flex", gap: 16, marginBottom: 24 },
  statBox: { flex: 1, background: C.white, borderRadius: 10, padding: "18px 20px", border: `1px solid ${C.border}`, textAlign: "center" },
  statNum: { fontSize: 28, fontWeight: 800, color: C.brand },
  statLabel: { fontSize: 13, color: C.textLight, marginTop: 4 },
  hospitalGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 8 },
  hospitalBtn: { display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "12px 14px", background: C.white, border: `1px solid ${C.border}`, borderRadius: 8, cursor: "pointer", textAlign: "left", transition: "border-color 0.15s, box-shadow 0.15s" },
  hospitalIndex: { fontSize: 12, fontWeight: 600, color: C.textLight, minWidth: 20 },
  hospitalName: { flex: 1, fontSize: 14, fontWeight: 500, color: C.text },
  hospitalBadge: { fontSize: 12, fontWeight: 700, color: C.brand, background: C.brandLight, borderRadius: 12, padding: "2px 9px", minWidth: 22, textAlign: "center" },
  backBtn: { fontSize: 14, fontWeight: 500, color: C.brand, background: "none", border: "none", cursor: "pointer", padding: "0 0 16px", display: "block" },

  // Tabs
  tabBar: { display: "flex", gap: 0, maxWidth: 800, margin: "0 auto", padding: "16px 20px 0", borderBottom: `1px solid ${C.border}` },
  tabActive: { padding: "10px 20px", fontSize: 14, fontWeight: 600, color: C.brand, background: "none", border: "none", borderBottom: `2px solid ${C.brand}`, cursor: "pointer", marginBottom: -1 },
  tabInactive: { padding: "10px 20px", fontSize: 14, fontWeight: 500, color: C.textLight, background: "none", border: "none", borderBottom: "2px solid transparent", cursor: "pointer", marginBottom: -1 },

  // Password management
  pwCard: { background: C.white, borderRadius: 10, padding: "14px 18px", marginBottom: 8, border: `1px solid ${C.border}` },
  pwRow: { display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 },
  pwName: { fontSize: 15, fontWeight: 600, color: C.text, marginRight: 8 },
  pwRole: { fontSize: 12, fontWeight: 500, color: C.white, background: C.brand, borderRadius: 4, padding: "2px 8px" },
  pwRight: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" },
  pwCurrent: { fontSize: 13, color: C.textLight },
  pwChangeBtn: { fontSize: 13, fontWeight: 500, color: C.brand, background: C.brandLight, border: "none", borderRadius: 6, padding: "6px 14px", cursor: "pointer" },
  pwEditRow: { display: "flex", gap: 6, alignItems: "center" },
  pwInput: { padding: "6px 10px", fontSize: 13, border: `1px solid ${C.border}`, borderRadius: 6, width: 140, outline: "none" },
  pwSaveBtn: { fontSize: 13, fontWeight: 600, color: C.white, background: C.brand, border: "none", borderRadius: 6, padding: "6px 12px", cursor: "pointer" },
  pwCancelBtn: { fontSize: 13, color: C.textLight, background: "none", border: "none", cursor: "pointer", padding: "6px" },
};
