import { useState, useEffect, useCallback } from "react";
import { supabase } from "./supabase";

/* ─── Data ─── */
const GROUPS = {
  "Novair": ["Rawalpindi","Kohat","Swat","Timergara","Malakand","Bannu","Neelum","Jhelum","Haveli","Nagar","Ghizer","Astore","Khaplu","Islamabad"],
  "Intexim": ["Bhakkar","Sahiwal","Toba Tek Singh","Sargodha","Rahim Yar Khan","Jhang","Faisalabad","Bhimber","Multan"],
  "Z-Corps": ["Larkana","Jamshoro","Quetta SZ","DM Jamali","Khuzdar","Sibbi","Nawabshah","Zhob","Quetta Sandeman","Loralai","Pangjur","Kharan","Karachi"],
};
const ALL_HOSPITALS = Object.values(GROUPS).flat();
const getProvider = h => Object.entries(GROUPS).find(([, list]) => list.includes(h))?.[0] || "Unknown";

/* ─── Supabase helpers ─── */
async function fetchComplaints() {
  const { data, error } = await supabase.from("complaints").select("*").order("created_at", { ascending: false });
  if (error) { console.error(error); return []; }
  return data;
}
async function insertComplaint(hospital, title, description) {
  const { data, error } = await supabase.from("complaints").insert([{ hospital, title, description, status: "Open" }]).select();
  if (error) { console.error(error); return null; }
  return data[0];
}
async function resolveComplaint(id) {
  const { error } = await supabase.from("complaints").update({ status: "Resolved" }).eq("id", id);
  return !error;
}
async function deleteComplaint(id) {
  await supabase.from("comments").delete().eq("complaint_id", id);
  const { error } = await supabase.from("complaints").delete().eq("id", id);
  return !error;
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

/* ─── CSV Download ─── */
function downloadCSV(complaints, filename) {
  const headers = ["Date", "Hospital", "Service Provider", "Title", "Description", "Status"];
  const escape = s => '"' + String(s || "").replace(/"/g, '""') + '"';
  const rows = complaints.map(c => [
    new Date(c.created_at).toLocaleDateString("en-PK", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
    c.hospital, getProvider(c.hospital), c.title, c.description, c.status || "Open"
  ].map(escape).join(","));
  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename + ".csv"; a.click();
  URL.revokeObjectURL(url);
}

/* ─── Header Component ─── */
function AppHeader({ user, children }) {
  const displayName = user.role === "hospital" ? user.name + " Hospital" : user.name;
  return (
    <header style={styles.header}>
      <div style={styles.headerLeft}>
        <div>
          <div style={styles.headerBrand}><span style={styles.headerMark}>O₂</span> PSA Oxygen Plants - Pakistan</div>
          <div style={styles.headerUser}>User: {displayName}</div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>{children}</div>
    </header>
  );
}

/* ─── App ─── */
export default function App() {
  const [user, setUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [complaints, setComplaints] = useState([]);
  const [notifEmails, setNotifEmails] = useState([]);
  const [siteNotes, setSiteNotes] = useState([]);
  const [ready, setReady] = useState(false);

  const reload = useCallback(async () => {
    const [c, u, e, s] = await Promise.all([fetchComplaints(), fetchUsers(), fetchEmails(), fetchSiteNotes()]);
    setComplaints(c); setUsers(u); setNotifEmails(e); setSiteNotes(s);
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
  if (user.role === "admin") return <AdminDashboard user={user} users={users} complaints={complaints} notifEmails={notifEmails} siteNotes={siteNotes} onRefresh={reload} onLogout={() => setUser(null)} />;
  return <CompanyDashboard user={user} complaints={complaints} siteNotes={siteNotes} onRefresh={reload} onLogout={() => setUser(null)} />;
}

function LoadingScreen() {
  return (<div style={styles.loadWrap}><div style={styles.loadLogo}>O₂</div><p style={{ color: "#6b7280", marginTop: 12 }}>Loading portal…</p></div>);
}

function LoginScreen({ users, onLogin }) {
  const [id, setId] = useState(""); const [pw, setPw] = useState(""); const [err, setErr] = useState("");
  const submit = () => {
    const clean = s => s.trim().toLowerCase().replace(/\s+/g, "");
    const found = users.find(u => (clean(u.name) === clean(id) || clean(u.id) === clean(id)) && clean(u.password) === clean(pw));
    if (!found) { setErr("Invalid credentials"); return; }
    onLogin(found);
  };
  return (
    <div style={styles.loginBg}><div style={styles.loginCard}>
      <div style={styles.loginBrand}><span style={styles.brandMark}>O₂</span><span style={styles.brandText}>PSA Oxygen Plant</span></div>
      <h2 style={styles.loginTitle}>Complaint Portal</h2>
      <p style={styles.loginSub}>Sign in with your credentials</p>
      <input style={styles.input} placeholder="Username" value={id} onChange={e => { setId(e.target.value); setErr(""); }} onKeyDown={e => e.key === "Enter" && submit()} />
      <input style={styles.input} type="password" placeholder="Password" value={pw} onChange={e => { setPw(e.target.value); setErr(""); }} onKeyDown={e => e.key === "Enter" && submit()} />
      {err && <p style={styles.err}>{err}</p>}
      <button style={styles.btnPrimary} onClick={submit}>Sign In</button>
    </div></div>
  );
}

function StatusBadge({ status }) {
  const r = status === "Resolved";
  return <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 12, color: r ? "#276749" : "#9c4221", background: r ? "#c6f6d5" : "#feebc8" }}>{r ? "Resolved" : "Open"}</span>;
}

/* ─── Site Status Logic ─── */
function getSiteDisplayStatus(hospital, complaints, siteNotes) {
  const hasOpen = complaints.some(c => c.hospital === hospital && c.status !== "Resolved");
  if (hasOpen) return "Issues";
  const note = siteNotes.find(s => s.hospital === hospital);
  return note?.site_status || "Fully Functional";
}

function SiteStatusBadge({ status }) {
  let color, bg, icon;
  if (status === "Issues") { color = "#9c4221"; bg = "#feebc8"; icon = "⚠"; }
  else if (status === "Non Functional") { color = "#e53e3e"; bg = "#fed7d7"; icon = "✕"; }
  else { color = "#276749"; bg = "#c6f6d5"; icon = "✓"; }
  return <span style={{ fontSize: 12, fontWeight: 600, color, background: bg, padding: "2px 8px", borderRadius: 6 }}>{icon} {status}</span>;
}

/* ─── Overview Tab ─── */
function OverviewTab({ hospitals, complaints, siteNotes, isAdmin, onRefresh }) {
  const [editingHospital, setEditingHospital] = useState(null);
  const [noteText, setNoteText] = useState("");
  const [saving, setSaving] = useState(false);
  const [statusEditing, setStatusEditing] = useState(null);

  const getNote = h => siteNotes.find(s => s.hospital === h)?.equipment_note || "";
  const openComplaints = h => complaints.filter(c => c.hospital === h && c.status !== "Resolved");
  const allOpen = hospitals.reduce((sum, h) => sum + openComplaints(h).length, 0);
  const issueCount = hospitals.filter(h => getSiteDisplayStatus(h, complaints, siteNotes) === "Issues").length;
  const funcCount = hospitals.filter(h => getSiteDisplayStatus(h, complaints, siteNotes) === "Fully Functional").length;
  const nonFuncCount = hospitals.filter(h => getSiteDisplayStatus(h, complaints, siteNotes) === "Non Functional").length;

  const saveNote = async (h) => {
    setSaving(true); await updateSiteNote(h, noteText);
    setEditingHospital(null); setNoteText(""); setSaving(false); await onRefresh();
  };

  const handleStatusChange = async (h, newStatus) => {
    await updateSiteStatus(h, newStatus);
    setStatusEditing(null); await onRefresh();
  };

  const statusOrder = { "Issues": 0, "Fully Functional": 1, "Non Functional": 2 };
  const sortedHospitals = [...hospitals].sort((a, b) => {
    const sa = getSiteDisplayStatus(a, complaints, siteNotes);
    const sb = getSiteDisplayStatus(b, complaints, siteNotes);
    return (statusOrder[sa] ?? 1) - (statusOrder[sb] ?? 1);
  });

  const attentionSites = hospitals.filter(h => {
    const s = getSiteDisplayStatus(h, complaints, siteNotes);
    return s === "Issues" || s === "Non Functional";
  });

  return (
    <>
      {attentionSites.length > 0 && (
        <div style={{ background: "#fff5f5", border: "1px solid #fed7d7", borderRadius: 12, padding: "16px 20px", marginBottom: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#9c4221", marginBottom: 8 }}>⚠ Attention Needed ({attentionSites.length})</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {attentionSites.map(h => (
              <span key={h} style={{ fontSize: 13, fontWeight: 500, color: getSiteDisplayStatus(h, complaints, siteNotes) === "Issues" ? "#9c4221" : "#e53e3e", background: getSiteDisplayStatus(h, complaints, siteNotes) === "Issues" ? "#feebc8" : "#fed7d7", padding: "4px 12px", borderRadius: 8 }}>{h}</span>
            ))}
          </div>
        </div>
      )}

      <div style={styles.statsBar}>
        <div style={styles.statBox}><div style={styles.statNum}>{hospitals.length}</div><div style={styles.statLabel}>Sites</div></div>
        <div style={styles.statBox}><div style={{ ...styles.statNum, color: "#276749" }}>{funcCount}</div><div style={styles.statLabel}>Functional</div></div>
        <div style={styles.statBox}><div style={{ ...styles.statNum, color: "#e53e3e" }}>{nonFuncCount}</div><div style={styles.statLabel}>Non Functional</div></div>
        <div style={styles.statBox}><div style={{ ...styles.statNum, color: "#9c4221" }}>{allOpen}</div><div style={styles.statLabel}>Open Complaints</div></div>
      </div>

      <div style={styles.overviewTable}>
        <div style={styles.overviewHeaderRow}>
          <div style={styles.ovCellSr}>#</div>
          <div style={styles.ovCellSite}>Site</div>
          <div style={styles.ovCellProvider}>Service Provider</div>
          <div style={styles.ovCellStatus}>Status</div>
          <div style={styles.ovCellOpen}>Open Complaints</div>
          <div style={styles.ovCellNote}>Equipment / Notes</div>
        </div>
        {sortedHospitals.map((h, i) => {
          const open = openComplaints(h);
          const siteStatus = getSiteDisplayStatus(h, complaints, siteNotes);
          const hasOpen = open.length > 0;
          const note = getNote(h);
          const rowBg = siteStatus === "Issues" ? "#fff5f5" : siteStatus === "Non Functional" ? "#fff5f5" : "#f0fff4";
          return (
            <div key={h} style={{ ...styles.overviewRow, background: rowBg }}>
              <div style={styles.ovCellSr}>{i + 1}</div>
              <div style={styles.ovCellSite}><strong>{h}</strong></div>
              <div style={styles.ovCellProvider}><span style={{ fontSize: 12, color: "#0e7c6b", background: "#e6f5f2", padding: "2px 8px", borderRadius: 6 }}>{getProvider(h)}</span></div>
              <div style={styles.ovCellStatus}>
                {isAdmin && !hasOpen ? (
                  statusEditing === h ? (
                    <select style={{ fontSize: 11, padding: "2px 4px", borderRadius: 4, border: "1px solid #e2e8f0" }} value={siteStatus} onChange={e => handleStatusChange(h, e.target.value)}>
                      <option value="Fully Functional">Fully Functional</option>
                      <option value="Non Functional">Non Functional</option>
                    </select>
                  ) : (
                    <div style={{ cursor: "pointer" }} onClick={() => setStatusEditing(h)}><SiteStatusBadge status={siteStatus} /></div>
                  )
                ) : (
                  <SiteStatusBadge status={siteStatus} />
                )}
              </div>
              <div style={styles.ovCellOpen}>
                {open.length > 0 ? open.map(c => (
                  <div key={c.id} style={{ fontSize: 12, color: "#9c4221", marginBottom: 2 }}>
                    • {c.title} <span style={{ color: "#a0aec0", fontSize: 11 }}>({new Date(c.created_at).toLocaleDateString("en-PK", { month: "short", day: "numeric" })})</span>
                  </div>
                )) : <span style={{ fontSize: 12, color: "#a0aec0" }}>—</span>}
              </div>
              <div style={styles.ovCellNote}>
                {editingHospital === h ? (
                  <div style={{ display: "flex", gap: 4 }}>
                    <input style={{ ...styles.pwInput, width: "100%", fontSize: 12 }} value={noteText} onChange={e => setNoteText(e.target.value)} onKeyDown={e => e.key === "Enter" && saveNote(h)} />
                    <button style={{ ...styles.pwSaveBtn, fontSize: 11, padding: "4px 8px" }} onClick={() => saveNote(h)}>{saving ? "…" : "✓"}</button>
                    <button style={{ ...styles.pwCancelBtn, fontSize: 11 }} onClick={() => setEditingHospital(null)}>✕</button>
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 12, color: note ? "#1a2332" : "#a0aec0", flex: 1 }}>{note || "—"}</span>
                    {isAdmin && <button style={{ fontSize: 11, color: "#0e7c6b", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }} onClick={() => { setEditingHospital(h); setNoteText(note); }}>edit</button>}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

/* ─── Comment Section ─── */
function CommentSection({ complaintId, currentUser, canComment, isAdmin }) {
  const [comments, setComments] = useState([]);
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [asHospital, setAsHospital] = useState("");

  const loadComments = useCallback(async () => {
    const data = await fetchComments(complaintId);
    setComments(data); setLoaded(true);
  }, [complaintId]);

  useEffect(() => { if (expanded) loadComments(); }, [expanded, loadComments]);

  const post = async () => {
    if (!text.trim() || posting) return;
    setPosting(true);
    let author, role;
    if (isAdmin && asHospital) { author = asHospital + " Hospital"; role = "hospital"; }
    else { author = currentUser.role === "hospital" ? currentUser.name + " Hospital" : currentUser.name; role = currentUser.role; }
    await insertComment(complaintId, author, role, text.trim());
    setText(""); setPosting(false); await loadComments();
  };

  const handleDelete = async (id) => { await deleteComment(id); await loadComments(); };

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
                  <span style={{ fontSize: 11, color: "#718096" }}>{new Date(c.created_at).toLocaleDateString("en-PK", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                  {isAdmin && <button style={{ fontSize: 11, color: "#e53e3e", background: "none", border: "none", cursor: "pointer" }} onClick={() => handleDelete(c.id)}>Delete</button>}
                </div>
              </div>
              <p style={{ fontSize: 13, color: "#4a5568", margin: "4px 0 0", lineHeight: 1.4 }}>{c.content}</p>
            </div>
          ))}
          {(canComment || isAdmin) && (
            <>
              {isAdmin && (
                <div style={{ marginBottom: 6 }}>
                  <select style={{ ...styles.pwInput, width: "auto", fontSize: 12, padding: "4px 8px" }} value={asHospital} onChange={e => setAsHospital(e.target.value)}>
                    <option value="">Comment as Admin</option>
                    {ALL_HOSPITALS.map(h => <option key={h} value={h}>Comment as {h} Hospital</option>)}
                  </select>
                </div>
              )}
              <div style={styles.commentInputRow}>
                <input style={styles.commentInput} placeholder="Write a comment…" value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === "Enter" && post()} />
                <button style={styles.commentSendBtn} onClick={post} disabled={!text.trim() || posting}>{posting ? "…" : "Post"}</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Grouped Hospital List ─── */
function GroupedHospitalList({ groups, complaints, onSelect }) {
  const countFor = h => complaints.filter(c => c.hospital === h).length;
  const openCountFor = h => complaints.filter(c => c.hospital === h && c.status !== "Resolved").length;
  const groupCountFor = hospitals => complaints.filter(c => hospitals.includes(c.hospital)).length;
  const groupOpenFor = hospitals => complaints.filter(c => hospitals.includes(c.hospital) && c.status !== "Resolved").length;
  return (
    <>
      {Object.entries(groups).map(([provider, hospitals]) => (
        <div key={provider} style={styles.groupSection}>
          <div style={styles.groupHeader}>
            <h3 style={styles.groupTitle}>{provider}</h3>
            <div style={{ display: "flex", gap: 8 }}>
              <span style={styles.groupBadge}>{groupCountFor(hospitals)} total</span>
              <span style={{ ...styles.groupBadge, color: "#9c4221", background: "#feebc8" }}>{groupOpenFor(hospitals)} open</span>
            </div>
          </div>
          <div style={styles.hospitalGrid}>
            {hospitals.map((h, i) => {
              const open = openCountFor(h);
              return (
                <button key={h} style={styles.hospitalBtn} onClick={() => onSelect(h)}>
                  <span style={styles.hospitalIndex}>{i + 1}</span>
                  <span style={styles.hospitalName}>{h}</span>
                  <span style={styles.hospitalBadge}>{countFor(h)}</span>
                  {open > 0 && <span style={styles.openBadge}>{open}</span>}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}

/* ─── Complaint Card ─── */
function ComplaintCard({ complaint, currentUser, canResolve, canComment, isAdmin, onResolve, onDelete, onRefresh }) {
  const [resolving, setResolving] = useState(false);
  const c = complaint;
  const handleResolve = async () => { setResolving(true); await onResolve(c.id); setResolving(false); };
  const handleDelete = async () => { if (window.confirm("Delete this complaint permanently?")) { await onDelete(c.id); await onRefresh(); } };
  return (
    <div style={styles.card}>
      <div style={styles.cardTop}>
        <strong style={styles.cardTitle}>{c.title}</strong>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <StatusBadge status={c.status} />
          <span style={styles.cardDate}>{new Date(c.created_at).toLocaleDateString("en-PK", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
        </div>
      </div>
      <p style={styles.cardDesc}>{c.description}</p>
      <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
        {canResolve && c.status !== "Resolved" && (
          <button style={styles.resolveBtn} onClick={handleResolve} disabled={resolving}>{resolving ? "Resolving…" : "Mark as Resolved"}</button>
        )}
        {isAdmin && <button style={styles.deleteBtn} onClick={handleDelete}>Delete</button>}
      </div>
      <CommentSection complaintId={c.id} currentUser={currentUser} canComment={canComment} isAdmin={isAdmin} />
    </div>
  );
}

/* ─── Complaint List View ─── */
function ComplaintListView({ hospital, complaints, currentUser, canResolve, canComment, isAdmin, onBack, onResolve, onDelete, onRefresh }) {
  const hospitalComplaints = complaints.filter(c => c.hospital === hospital);
  return (
    <>
      <button style={styles.backBtn} onClick={onBack}>← Back</button>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <h2 style={{ ...styles.sectionTitle, margin: 0 }}>{hospital}</h2>
        <span style={{ fontSize: 13, color: "#718096" }}>({hospitalComplaints.length})</span>
        <span style={{ fontSize: 12, color: "#0e7c6b", background: "#e6f5f2", padding: "2px 8px", borderRadius: 8 }}>{getProvider(hospital)}</span>
      </div>
      {hospitalComplaints.length === 0 && <p style={styles.empty}>No complaints from this hospital.</p>}
      {hospitalComplaints.map(c => (
        <ComplaintCard key={c.id} complaint={c} currentUser={currentUser} canResolve={canResolve} canComment={canComment} isAdmin={isAdmin} onResolve={onResolve} onDelete={onDelete} onRefresh={onRefresh} />
      ))}
    </>
  );
}

/* ─── Hospital Dashboard ─── */
function HospitalDashboard({ user, complaints, onRefresh, onLogout }) {
  const [title, setTitle] = useState(""); const [desc, setDesc] = useState("");
  const [success, setSuccess] = useState(false); const [submitting, setSubmitting] = useState(false);
  const mine = complaints.filter(c => c.hospital === user.name);
  const openCount = mine.filter(c => c.status !== "Resolved").length;
  const submitComplaint = async () => {
    if (!title.trim() || !desc.trim() || submitting) return;
    setSubmitting(true);
    const result = await insertComplaint(user.name, title.trim(), desc.trim());
    setSubmitting(false);
    if (result) { setTitle(""); setDesc(""); setSuccess(true); setTimeout(() => setSuccess(false), 2500); await onRefresh(); }
  };
  const handleResolve = async (id) => { await resolveComplaint(id); await onRefresh(); };
  return (
    <div style={styles.shell}>
      <AppHeader user={user}>
        <button style={styles.btnLogout} onClick={onLogout}>Sign Out</button>
      </AppHeader>
      <main style={styles.main}>
        <section style={styles.formSection}>
          <h2 style={styles.sectionTitle}>Register a Complaint</h2>
          <select style={{ ...styles.input, cursor: "pointer" }} value={title} onChange={e => setTitle(e.target.value)}>
            <option value="">Select complaint type</option>
            <option value="Compressor Issue">Compressor Issue</option>
            <option value="Dryer Issue">Dryer Issue</option>
            <option value="Booster Filling System Issue">Booster Filling System Issue</option>
            <option value="Purity Issue">Purity Issue</option>
            <option value="Other Issue">Other Issue</option>
          </select>
          <textarea style={{ ...styles.input, minHeight: 100, resize: "vertical", fontFamily: "inherit" }} placeholder="Describe the issue in detail…" value={desc} onChange={e => setDesc(e.target.value)} />
          <button style={{ ...styles.btnPrimary, opacity: (!title.trim() || !desc.trim() || submitting) ? 0.5 : 1 }} onClick={submitComplaint}>{submitting ? "Submitting…" : "Submit Complaint"}</button>
          {success && <p style={styles.successMsg}>Complaint registered successfully.</p>}
        </section>
        <section style={styles.listSection}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h2 style={{ ...styles.sectionTitle, margin: 0 }}>Your Complaints ({mine.length})</h2>
            {openCount > 0 && <span style={{ fontSize: 13, fontWeight: 600, color: "#9c4221", background: "#feebc8", padding: "3px 10px", borderRadius: 12 }}>{openCount} open</span>}
          </div>
          {mine.length === 0 && <p style={styles.empty}>No complaints registered yet.</p>}
          {mine.map(c => (
            <ComplaintCard key={c.id} complaint={c} currentUser={user} canResolve={true} canComment={true} isAdmin={false} onResolve={handleResolve} onDelete={() => {}} onRefresh={onRefresh} />
          ))}
        </section>
      </main>
    </div>
  );
}

/* ─── Admin Dashboard ─── */
function AdminDashboard({ user, users, complaints, notifEmails, siteNotes, onRefresh, onLogout }) {
  const [tab, setTab] = useState("overview");
  const [selected, setSelected] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [newPw, setNewPw] = useState(""); const [pwSuccess, setPwSuccess] = useState(""); const [saving, setSaving] = useState(false);
  const [emailGroup, setEmailGroup] = useState("Novair"); const [newEmail, setNewEmail] = useState(""); const [emailSaving, setEmailSaving] = useState(false);
  const [adminHospital, setAdminHospital] = useState(ALL_HOSPITALS[0]);
  const [adminTitle, setAdminTitle] = useState(""); const [adminDesc, setAdminDesc] = useState("");
  const [adminSubmitting, setAdminSubmitting] = useState(false); const [adminSuccess, setAdminSuccess] = useState(false);

  const totalComplaints = complaints.length;
  const totalOpen = complaints.filter(c => c.status !== "Resolved").length;
  const handleRefresh = async () => { setRefreshing(true); await onRefresh(); setRefreshing(false); };
  const handleResolve = async (id) => { await resolveComplaint(id); await onRefresh(); };
  const handleDelete = async (id) => { await deleteComplaint(id); await onRefresh(); };
  const handlePasswordChange = async (userId) => {
    if (!newPw.trim() || saving) return;
    setSaving(true); const ok = await updatePassword(userId, newPw.trim()); setSaving(false);
    if (ok) { setPwSuccess(userId); setNewPw(""); setEditingUser(null); await onRefresh(); setTimeout(() => setPwSuccess(""), 2500); }
  };
  const handleAddEmail = async () => {
    if (!newEmail.trim() || emailSaving) return;
    setEmailSaving(true); await addEmail(emailGroup, newEmail.trim()); setNewEmail(""); setEmailSaving(false); await onRefresh();
  };
  const handleDeleteEmail = async (id) => { await deleteEmailRecord(id); await onRefresh(); };
  const submitAdminComplaint = async () => {
    if (!adminTitle.trim() || !adminDesc.trim() || adminSubmitting) return;
    setAdminSubmitting(true);
    const result = await insertComplaint(adminHospital, adminTitle.trim(), adminDesc.trim());
    setAdminSubmitting(false);
    if (result) { setAdminTitle(""); setAdminDesc(""); setAdminSuccess(true); setTimeout(() => setAdminSuccess(false), 2500); await onRefresh(); }
  };

  const hospitalUsers = users.filter(u => u.role === "hospital");
  const companyUsers = users.filter(u => u.role === "company" || u.role === "admin");
  const emailGroupOptions = ["Novair", "Intexim", "Z-Corps", "Amex", "UNDP"];

  return (
    <div style={styles.shell}>
      <AppHeader user={user}>
        <button style={styles.downloadBtn} onClick={() => downloadCSV(complaints, "all-complaints")}>⬇ CSV</button>
        <button style={styles.btnLogout} onClick={handleRefresh}>{refreshing ? "…" : "Refresh"}</button>
        <button style={styles.btnLogout} onClick={onLogout}>Sign Out</button>
      </AppHeader>

      <div style={styles.tabBar}>
        {["overview","complaints","submit","passwords","emails"].map(t => (
          <button key={t} style={tab === t ? styles.tabActive : styles.tabInactive} onClick={() => { setTab(t); setSelected(null); }}>
            {t === "overview" ? "Overview" : t === "complaints" ? "Complaints" : t === "submit" ? "Submit" : t === "passwords" ? "Passwords" : "Emails"}
          </button>
        ))}
      </div>

      <main style={styles.main}>
        {tab === "overview" && <OverviewTab hospitals={ALL_HOSPITALS} complaints={complaints} siteNotes={siteNotes} isAdmin={true} onRefresh={onRefresh} />}

        {tab === "complaints" && !selected && (
          <>
            <div style={styles.statsBar}>
              <div style={styles.statBox}><div style={styles.statNum}>{totalComplaints}</div><div style={styles.statLabel}>Total</div></div>
              <div style={styles.statBox}><div style={{ ...styles.statNum, color: "#9c4221" }}>{totalOpen}</div><div style={styles.statLabel}>Open</div></div>
              <div style={styles.statBox}><div style={{ ...styles.statNum, color: "#276749" }}>{totalComplaints - totalOpen}</div><div style={styles.statLabel}>Resolved</div></div>
            </div>
            <GroupedHospitalList groups={GROUPS} complaints={complaints} onSelect={setSelected} />
          </>
        )}
        {tab === "complaints" && selected && (
          <ComplaintListView hospital={selected} complaints={complaints} currentUser={user} canResolve={true} canComment={true} isAdmin={true} onBack={() => setSelected(null)} onResolve={handleResolve} onDelete={handleDelete} onRefresh={onRefresh} />
        )}

        {tab === "submit" && (
          <section style={styles.formSection}>
            <h2 style={styles.sectionTitle}>Submit Complaint on Behalf of Hospital</h2>
            <select style={{ ...styles.input, cursor: "pointer" }} value={adminHospital} onChange={e => setAdminHospital(e.target.value)}>
              {ALL_HOSPITALS.map(h => <option key={h} value={h}>{h} — {getProvider(h)}</option>)}
            </select>
            <select style={{ ...styles.input, cursor: "pointer" }} value={adminTitle} onChange={e => setAdminTitle(e.target.value)}>
              <option value="">Select complaint type</option>
              <option value="Compressor Issue">Compressor Issue</option>
              <option value="Dryer Issue">Dryer Issue</option>
              <option value="Booster Filling System Issue">Booster Filling System Issue</option>
              <option value="Purity Issue">Purity Issue</option>
              <option value="Other Issue">Other Issue</option>
            </select>
            <textarea style={{ ...styles.input, minHeight: 100, resize: "vertical", fontFamily: "inherit" }} placeholder="Describe the issue…" value={adminDesc} onChange={e => setAdminDesc(e.target.value)} />
            <button style={{ ...styles.btnPrimary, opacity: (!adminTitle.trim() || !adminDesc.trim() || adminSubmitting) ? 0.5 : 1 }} onClick={submitAdminComplaint}>{adminSubmitting ? "Submitting…" : "Submit Complaint"}</button>
            {adminSuccess && <p style={styles.successMsg}>Complaint submitted for {adminHospital}.</p>}
          </section>
        )}

        {tab === "passwords" && (
          <>
            <h2 style={styles.sectionTitle}>Company & Admin Passwords</h2>
            {companyUsers.map(u => (
              <div key={u.id} style={styles.pwCard}>
                <div style={styles.pwRow}>
                  <div><strong style={styles.pwName}>{u.name}</strong><span style={styles.pwRole}>{u.role === "admin" ? "Admin" : "Company"}</span></div>
                  <div style={styles.pwRight}>
                    <span style={styles.pwCurrent}>Current: <code>{u.password}</code></span>
                    {editingUser === u.id ? (
                      <div style={styles.pwEditRow}>
                        <input style={styles.pwInput} placeholder="New password" value={newPw} onChange={e => setNewPw(e.target.value)} onKeyDown={e => e.key === "Enter" && handlePasswordChange(u.id)} />
                        <button style={styles.pwSaveBtn} onClick={() => handlePasswordChange(u.id)}>{saving ? "…" : "Save"}</button>
                        <button style={styles.pwCancelBtn} onClick={() => { setEditingUser(null); setNewPw(""); }}>✕</button>
                      </div>
                    ) : (<button style={styles.pwChangeBtn} onClick={() => { setEditingUser(u.id); setNewPw(""); }}>Change</button>)}
                  </div>
                </div>
                {pwSuccess === u.id && <p style={styles.successMsg}>Password updated.</p>}
              </div>
            ))}
            {Object.entries(GROUPS).map(([provider, hospitals]) => (
              <div key={provider}>
                <h2 style={{ ...styles.sectionTitle, marginTop: 28 }}>{provider} — Hospital Passwords</h2>
                {hospitalUsers.filter(u => hospitals.some(h => h.toLowerCase().replace(/\s+/g, "") === u.id.toLowerCase().replace(/\s+/g, ""))).map(u => (
                  <div key={u.id} style={styles.pwCard}>
                    <div style={styles.pwRow}>
                      <div><strong style={styles.pwName}>{u.name}</strong></div>
                      <div style={styles.pwRight}>
                        <span style={styles.pwCurrent}>Current: <code>{u.password}</code></span>
                        {editingUser === u.id ? (
                          <div style={styles.pwEditRow}>
                            <input style={styles.pwInput} placeholder="New password" value={newPw} onChange={e => setNewPw(e.target.value)} onKeyDown={e => e.key === "Enter" && handlePasswordChange(u.id)} />
                            <button style={styles.pwSaveBtn} onClick={() => handlePasswordChange(u.id)}>{saving ? "…" : "Save"}</button>
                            <button style={styles.pwCancelBtn} onClick={() => { setEditingUser(null); setNewPw(""); }}>✕</button>
                          </div>
                        ) : (<button style={styles.pwChangeBtn} onClick={() => { setEditingUser(u.id); setNewPw(""); }}>Change</button>)}
                      </div>
                    </div>
                    {pwSuccess === u.id && <p style={styles.successMsg}>Password updated.</p>}
                  </div>
                ))}
              </div>
            ))}
          </>
        )}

        {tab === "emails" && (
          <>
            <h2 style={styles.sectionTitle}>Email Notifications</h2>
            <p style={{ fontSize: 14, color: "#4a5568", marginBottom: 20, lineHeight: 1.5 }}>When a hospital submits a complaint, emails go to the relevant service provider + Novair + Amex lists.</p>
            <div style={styles.formSection}>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: "#1a2332", margin: "0 0 12px" }}>Add Email</h3>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <select style={{ ...styles.pwInput, width: 150, padding: "8px 10px" }} value={emailGroup} onChange={e => setEmailGroup(e.target.value)}>
                  {emailGroupOptions.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
                <input style={{ ...styles.pwInput, flex: 1, minWidth: 200, padding: "8px 10px" }} type="email" placeholder="email@example.com" value={newEmail} onChange={e => setNewEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && handleAddEmail()} />
                <button style={styles.pwSaveBtn} onClick={handleAddEmail}>{emailSaving ? "…" : "Add"}</button>
              </div>
            </div>
            {emailGroupOptions.map(g => {
              const ge = notifEmails.filter(e => e.group_name === g);
              if (!ge.length) return null;
              return (<div key={g} style={{ marginTop: 20 }}>
                <h3 style={{ fontSize: 15, fontWeight: 600, color: "#0e7c6b", margin: "0 0 10px" }}>{g}</h3>
                {ge.map(e => (
                  <div key={e.id} style={{ ...styles.pwCard, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 14, color: "#1a2332" }}>{e.email}</span>
                    <button style={{ ...styles.pwCancelBtn, color: "#e53e3e", fontSize: 14 }} onClick={() => handleDeleteEmail(e.id)}>Remove</button>
                  </div>
                ))}
              </div>);
            })}
            {notifEmails.length === 0 && <p style={styles.empty}>No notification emails configured yet.</p>}
          </>
        )}
      </main>
    </div>
  );
}

/* ─── Company Dashboard ─── */
function CompanyDashboard({ user, complaints, siteNotes, onRefresh, onLogout }) {
  const [tab, setTab] = useState("overview");
  const [selected, setSelected] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const seesAll = ["Novair", "Amex", "UNDP", "CMU"].includes(user.name);
  const myGroups = {};
  if (seesAll) { Object.assign(myGroups, GROUPS); } else if (GROUPS[user.name]) { myGroups[user.name] = GROUPS[user.name]; } else { Object.assign(myGroups, GROUPS); }
  const myHospitals = Object.values(myGroups).flat();
  const myComplaints = complaints.filter(c => myHospitals.includes(c.hospital));
  const totalComplaints = myComplaints.length;
  const totalOpen = myComplaints.filter(c => c.status !== "Resolved").length;

  const canCommentOnHospital = (hospital) => {
    if (["Novair", "Amex"].includes(user.name)) return true;
    return getProvider(hospital) === user.name;
  };

  const handleRefresh = async () => { setRefreshing(true); await onRefresh(); setRefreshing(false); };

  return (
    <div style={styles.shell}>
      <AppHeader user={user}>
        <button style={styles.downloadBtn} onClick={() => downloadCSV(myComplaints, user.name.toLowerCase() + "-complaints")}>⬇ CSV</button>
        <button style={styles.btnLogout} onClick={handleRefresh}>{refreshing ? "…" : "Refresh"}</button>
        <button style={styles.btnLogout} onClick={onLogout}>Sign Out</button>
      </AppHeader>

      <div style={styles.tabBar}>
        <button style={tab === "overview" ? styles.tabActive : styles.tabInactive} onClick={() => { setTab("overview"); setSelected(null); }}>Overview</button>
        <button style={tab === "complaints" ? styles.tabActive : styles.tabInactive} onClick={() => { setTab("complaints"); setSelected(null); }}>Complaints</button>
      </div>

      <main style={styles.main}>
        {tab === "overview" && <OverviewTab hospitals={myHospitals} complaints={complaints} siteNotes={siteNotes} isAdmin={false} onRefresh={onRefresh} />}

        {tab === "complaints" && !selected && (
          <>
            <div style={styles.statsBar}>
              <div style={styles.statBox}><div style={styles.statNum}>{totalComplaints}</div><div style={styles.statLabel}>Total</div></div>
              <div style={styles.statBox}><div style={{ ...styles.statNum, color: "#9c4221" }}>{totalOpen}</div><div style={styles.statLabel}>Open</div></div>
              <div style={styles.statBox}><div style={{ ...styles.statNum, color: "#276749" }}>{totalComplaints - totalOpen}</div><div style={styles.statLabel}>Resolved</div></div>
            </div>
            <GroupedHospitalList groups={myGroups} complaints={complaints} onSelect={setSelected} />
          </>
        )}
        {tab === "complaints" && selected && (
          <ComplaintListView hospital={selected} complaints={complaints} currentUser={user} canResolve={false} canComment={canCommentOnHospital(selected)} isAdmin={false} onBack={() => setSelected(null)} onResolve={() => {}} onDelete={() => {}} onRefresh={onRefresh} />
        )}
      </main>
    </div>
  );
}

/* ─── Styles ─── */
const C = { bg: "#f0f4f8", white: "#ffffff", brand: "#0e7c6b", brandDark: "#095e52", brandLight: "#e6f5f2", text: "#1a2332", textMid: "#4a5568", textLight: "#718096", border: "#e2e8f0", red: "#e53e3e", green: "#38a169" };

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
  input: { display: "block", width: "100%", padding: "12px 14px", fontSize: 14, border: `1px solid ${C.border}`, borderRadius: 8, marginBottom: 12, outline: "none", boxSizing: "border-box", color: C.text, background: C.bg },
  btnPrimary: { display: "block", width: "100%", padding: "12px 0", fontSize: 15, fontWeight: 600, color: "#fff", background: C.brand, border: "none", borderRadius: 8, cursor: "pointer" },
  err: { color: C.red, fontSize: 13, margin: "0 0 10px", textAlign: "center" },
  shell: { minHeight: "100vh", background: C.bg, fontFamily: "'Inter', system-ui, sans-serif" },
  header: { background: C.white, borderBottom: `1px solid ${C.border}`, padding: "12px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 10 },
  headerLeft: { display: "flex", alignItems: "center", gap: 10 },
  headerBrand: { fontSize: 15, fontWeight: 700, color: C.text, display: "flex", alignItems: "center", gap: 6 },
  headerMark: { fontSize: 20, fontWeight: 800, color: C.brand, letterSpacing: -1 },
  headerUser: { fontSize: 13, color: C.textLight, marginTop: 2 },
  btnLogout: { fontSize: 13, fontWeight: 500, color: C.textMid, background: "none", border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 14px", cursor: "pointer" },
  downloadBtn: { fontSize: 13, fontWeight: 500, color: C.brand, background: C.brandLight, border: `1px solid ${C.brand}22`, borderRadius: 6, padding: "6px 14px", cursor: "pointer" },
  main: { maxWidth: 900, margin: "0 auto", padding: "24px 20px" },
  formSection: { background: C.white, borderRadius: 12, padding: 24, marginBottom: 24, border: `1px solid ${C.border}` },
  listSection: { marginBottom: 24 },
  sectionTitle: { fontSize: 17, fontWeight: 700, color: C.text, margin: "0 0 16px" },
  card: { background: C.white, borderRadius: 10, padding: "16px 18px", marginBottom: 10, border: `1px solid ${C.border}` },
  cardTop: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 6, flexWrap: "wrap" },
  cardTitle: { fontSize: 15, fontWeight: 600, color: C.text },
  cardDate: { fontSize: 12, color: C.textLight, whiteSpace: "nowrap", marginTop: 2 },
  cardDesc: { fontSize: 14, color: C.textMid, margin: 0, lineHeight: 1.55 },
  empty: { fontSize: 14, color: C.textLight, fontStyle: "italic" },
  successMsg: { color: C.green, fontSize: 14, fontWeight: 500, marginTop: 10, textAlign: "center" },
  statsBar: { display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" },
  statBox: { flex: 1, minWidth: 80, background: C.white, borderRadius: 10, padding: "14px 16px", border: `1px solid ${C.border}`, textAlign: "center" },
  statNum: { fontSize: 24, fontWeight: 800, color: C.brand },
  statLabel: { fontSize: 12, color: C.textLight, marginTop: 4 },
  hospitalGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 8 },
  hospitalBtn: { display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "12px 14px", background: C.white, border: `1px solid ${C.border}`, borderRadius: 8, cursor: "pointer", textAlign: "left" },
  hospitalIndex: { fontSize: 12, fontWeight: 600, color: C.textLight, minWidth: 20 },
  hospitalName: { flex: 1, fontSize: 14, fontWeight: 500, color: C.text },
  hospitalBadge: { fontSize: 12, fontWeight: 700, color: C.brand, background: C.brandLight, borderRadius: 12, padding: "2px 9px", minWidth: 22, textAlign: "center" },
  openBadge: { fontSize: 11, fontWeight: 700, color: "#9c4221", background: "#feebc8", borderRadius: 12, padding: "2px 8px", minWidth: 18, textAlign: "center" },
  backBtn: { fontSize: 14, fontWeight: 500, color: C.brand, background: "none", border: "none", cursor: "pointer", padding: "0 0 16px", display: "block" },
  resolveBtn: { fontSize: 13, fontWeight: 600, color: "#276749", background: "#c6f6d5", border: "none", borderRadius: 6, padding: "6px 16px", cursor: "pointer" },
  deleteBtn: { fontSize: 13, fontWeight: 600, color: "#e53e3e", background: "#fed7d7", border: "none", borderRadius: 6, padding: "6px 16px", cursor: "pointer" },
  groupSection: { marginBottom: 28 },
  groupHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 },
  groupTitle: { fontSize: 16, fontWeight: 700, color: C.brand, margin: 0 },
  groupBadge: { fontSize: 13, fontWeight: 600, color: C.textMid, background: C.bg, borderRadius: 12, padding: "4px 12px" },
  tabBar: { display: "flex", gap: 0, maxWidth: 900, margin: "0 auto", padding: "16px 20px 0", borderBottom: `1px solid ${C.border}`, flexWrap: "wrap" },
  tabActive: { padding: "10px 20px", fontSize: 14, fontWeight: 600, color: C.brand, background: "none", border: "none", borderBottom: `2px solid ${C.brand}`, cursor: "pointer", marginBottom: -1 },
  tabInactive: { padding: "10px 20px", fontSize: 14, fontWeight: 500, color: C.textLight, background: "none", border: "none", borderBottom: "2px solid transparent", cursor: "pointer", marginBottom: -1 },
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
  commentToggle: { fontSize: 13, fontWeight: 500, color: C.brand, background: "none", border: "none", cursor: "pointer", padding: 0 },
  commentBox: { marginTop: 8, padding: "12px 14px", background: "#f7fafc", borderRadius: 8, border: `1px solid ${C.border}` },
  commentItem: { padding: "8px 0", borderBottom: `1px solid ${C.border}` },
  commentHeader: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  commentInputRow: { display: "flex", gap: 8, marginTop: 10 },
  commentInput: { flex: 1, padding: "8px 10px", fontSize: 13, border: `1px solid ${C.border}`, borderRadius: 6, outline: "none" },
  commentSendBtn: { fontSize: 13, fontWeight: 600, color: C.white, background: C.brand, border: "none", borderRadius: 6, padding: "8px 16px", cursor: "pointer" },
  overviewTable: { background: C.white, borderRadius: 12, border: `1px solid ${C.border}`, overflow: "auto" },
  overviewHeaderRow: { display: "flex", padding: "12px 16px", background: "#edf2f7", fontWeight: 600, fontSize: 12, color: C.textMid, borderBottom: `1px solid ${C.border}`, gap: 8, minWidth: 800 },
  overviewRow: { display: "flex", padding: "12px 16px", borderBottom: `1px solid ${C.border}`, gap: 8, alignItems: "flex-start", minWidth: 800 },
  ovCellSr: { width: 30, flexShrink: 0, fontSize: 12, color: C.textLight },
  ovCellSite: { width: 120, flexShrink: 0, fontSize: 13 },
  ovCellProvider: { width: 100, flexShrink: 0 },
  ovCellStatus: { width: 110, flexShrink: 0 },
  ovCellOpen: { flex: 1, minWidth: 150 },
  ovCellNote: { flex: 1, minWidth: 150 },
};
