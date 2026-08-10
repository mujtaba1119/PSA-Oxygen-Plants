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
  return data[0];
}
async function updateComplaintFields(id, fields) {
  const { error } = await supabase.from("complaints").update(fields).eq("id", id);
  return !error;
}
async function resolveComplaint(id, resolvedDate) {
  const update = { status: "Resolved" };
  if (resolvedDate) update.resolved_at = new Date(resolvedDate).toISOString();
  const { error } = await supabase.from("complaints").update(update).eq("id", id);
  return !error;
}
async function unresolveComplaint(id) {
  const { error } = await supabase.from("complaints").update({ status: "Open", resolved_at: null }).eq("id", id);
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
async function createUser(id, name, role, password) {
  const { data, error } = await supabase.from("users").insert([{ id, name, role, password }]).select();
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
    new Date(c.created_at).toLocaleDateString("en-PK", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
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
    <header style={styles.header}>
      <div style={styles.headerLeft}><div>
        <div style={styles.headerBrand}><span style={styles.headerMark}>O₂</span> PSA Oxygen Plants - Pakistan</div>
        <div style={styles.headerUser}>User: {displayName}</div>
      </div></div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>{children}</div>
    </header>
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
  let color, bg, icon;
  if (status === "Issues") { color = "#9c4221"; bg = "#feebc8"; icon = "⚠"; }
  else if (status === "Non Functional") { color = "#718096"; bg = "#e2e8f0"; icon = "○"; }
  else if (status === "Shut Down") { color = "#e53e3e"; bg = "#fed7d7"; icon = "✕"; }
  else { color = "#276749"; bg = "#c6f6d5"; icon = "✓"; }
  return <span style={{ fontSize: 12, fontWeight: 600, color, background: bg, padding: "2px 8px", borderRadius: 6 }}>{icon} {status}</span>;
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
      const iv = setInterval(reload, 30000); return () => clearInterval(iv);
    }
  }, [user, reload]);

  if (!ready) return <div style={styles.loadWrap}><div style={styles.loadLogo}>O₂</div><p style={{ color: "#6b7280", marginTop: 12 }}>Loading portal…</p></div>;
  if (!user) return <LoginScreen users={users} onLogin={setUser} />;
  if (user.role === "hospital") return <HospitalDashboard user={user} complaints={complaints} onRefresh={reload} onLogout={() => setUser(null)} />;
  if (user.role === "admin") return <AdminDashboard user={user} users={users} complaints={complaints} notifEmails={notifEmails} siteNotes={siteNotes} onRefresh={reload} onLogout={() => setUser(null)} />;
  return <CompanyDashboard user={user} complaints={complaints} siteNotes={siteNotes} onRefresh={reload} onLogout={() => setUser(null)} />;
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

/* ─── Overview Tab ─── */
function OverviewTab({ hospitals, complaints, siteNotes, notifEmails, isAdmin, onRefresh }) {
  const [editingHospital, setEditingHospital] = useState(null);
  const [noteText, setNoteText] = useState(""); const [saving, setSaving] = useState(false);
  const [statusEditing, setStatusEditing] = useState(null);
  const [sendingShutdown, setSendingShutdown] = useState(null);

  const getNote = h => siteNotes.find(s => s.hospital === h)?.equipment_note || "";
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

  const saveNote = async (h) => { setSaving(true); await updateSiteNote(h, noteText); setEditingHospital(null); setNoteText(""); setSaving(false); await onRefresh(); };
  const handleStatusChange = async (h, s) => { await updateSiteStatus(h, s); setStatusEditing(null); await onRefresh(); };
  const handleSendShutdownEmail = async (h) => {
    setSendingShutdown(h);
    await sendShutdownEmail(h);
    setSendingShutdown(null);
    alert("Shutdown notification sent for " + h);
  };

  return (
    <>
      {shutdownSites.length > 0 && (
        <div style={{ background: "#fed7d7", border: "1px solid #fc8181", borderRadius: 12, padding: "16px 20px", marginBottom: 12 }}>
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

      {attentionSites.length > 0 && (
        <div style={{ background: "#fff5f5", border: "1px solid #fed7d7", borderRadius: 12, padding: "16px 20px", marginBottom: 12 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#9c4221", marginBottom: 8 }}>⚠ Attention Needed ({attentionSites.length})</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {attentionSites.map(h => <span key={h} style={{ fontSize: 13, fontWeight: 500, color: "#9c4221", background: "#feebc8", padding: "4px 12px", borderRadius: 8 }}>{h}</span>)}
          </div>
        </div>
      )}

      <div style={styles.statsBar}>
        <div style={styles.statBox}><div style={styles.statNum}>{hospitals.length}</div><div style={styles.statLabel}>Total Sites</div></div>
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
          const note = getNote(h);
          const rowBg = siteStatus === "Issues" ? "#fff5f5" : siteStatus === "Shut Down" ? "#fed7d7" : siteStatus === "Non Functional" ? "#f7fafc" : "#f0fff4";
          return (
            <div key={h} style={{ ...styles.overviewRow, background: rowBg }}>
              <div style={styles.ovCellSr}>{i + 1}</div>
              <div style={styles.ovCellSite}><strong>{h}</strong></div>
              <div style={styles.ovCellProvider}><span style={{ fontSize: 12, color: "#0e7c6b", background: "#e6f5f2", padding: "2px 8px", borderRadius: 6 }}>{getProvider(h)}</span></div>
              <div style={styles.ovCellStatus}>
                {isAdmin ? (
                  statusEditing === h ? (
                    <select style={{ fontSize: 11, padding: "2px 4px", borderRadius: 4, border: "1px solid #e2e8f0" }} value={getSiteBaseStatus(h, siteNotes)} onChange={e => handleStatusChange(h, e.target.value)}>
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
              <div style={styles.ovCellOpen}>
                {open.length > 0 ? open.map(c => (
                  <div key={c.id} style={{ fontSize: 12, color: "#9c4221", marginBottom: 2 }}>
                    • {c.title} <span style={{ color: "#a0aec0", fontSize: 11 }}>({new Date(c.created_at).toLocaleDateString("en-PK", { year: "numeric", month: "short", day: "numeric" })})</span>
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
  const [comments, setComments] = useState([]); const [text, setText] = useState(""); const [posting, setPosting] = useState(false);
  const [loaded, setLoaded] = useState(false); const [expanded, setExpanded] = useState(false);
  const [asHospital, setAsHospital] = useState("");
  const [editingComment, setEditingComment] = useState(null); const [editText, setEditText] = useState("");
  const loadComments = useCallback(async () => { const data = await fetchComments(complaintId); setComments(data); setLoaded(true); }, [complaintId]);
  useEffect(() => { if (expanded) loadComments(); }, [expanded, loadComments]);
  const post = async () => {
    if (!text.trim() || posting) return; setPosting(true);
    let author, role;
    if (isAdmin && asHospital) { author = asHospital + " Hospital"; role = "hospital"; }
    else { author = currentUser.role === "hospital" ? currentUser.name + " Hospital" : currentUser.name; role = currentUser.role; }
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
                  <span style={{ fontSize: 11, color: "#718096" }}>{new Date(c.created_at).toLocaleDateString("en-PK", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
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
            <>
              {isAdmin && (<div style={{ marginBottom: 6 }}><select style={{ ...styles.pwInput, width: "auto", fontSize: 12, padding: "4px 8px" }} value={asHospital} onChange={e => setAsHospital(e.target.value)}><option value="">Comment as Admin</option>{ALL_HOSPITALS.map(h => <option key={h} value={h}>Comment as {h} Hospital</option>)}</select></div>)}
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

function GroupedHospitalList({ groups, complaints, onSelect }) {
  const countFor = h => complaints.filter(c => c.hospital === h).length;
  const openCountFor = h => complaints.filter(c => c.hospital === h && c.status !== "Resolved").length;
  const groupCountFor = hs => complaints.filter(c => hs.includes(c.hospital)).length;
  const groupOpenFor = hs => complaints.filter(c => hs.includes(c.hospital) && c.status !== "Resolved").length;
  return (<>{Object.entries(groups).map(([p, hs]) => (
    <div key={p} style={styles.groupSection}>
      <div style={styles.groupHeader}><h3 style={styles.groupTitle}>{p}</h3><div style={{ display: "flex", gap: 8 }}><span style={styles.groupBadge}>{groupCountFor(hs)} total</span><span style={{ ...styles.groupBadge, color: "#9c4221", background: "#feebc8" }}>{groupOpenFor(hs)} open</span></div></div>
      <div style={styles.hospitalGrid}>{hs.map((h, i) => { const open = openCountFor(h); return (<button key={h} style={styles.hospitalBtn} onClick={() => onSelect(h)}><span style={styles.hospitalIndex}>{i + 1}</span><span style={styles.hospitalName}>{h}</span><span style={styles.hospitalBadge}>{countFor(h)}</span>{open > 0 && <span style={styles.openBadge}>{open}</span>}</button>); })}</div>
    </div>
  ))}</>);
}

function ComplaintCard({ complaint, currentUser, canResolve, canComment, isAdmin, onResolve, onUnresolve, onDelete, onRefresh }) {
  const [resolving, setResolving] = useState(false); const [resolveDate, setResolveDate] = useState("");
  const [editing, setEditing] = useState(false); const [editTitle, setEditTitle] = useState(complaint.title);
  const [editDesc, setEditDesc] = useState(complaint.description); const [editSaving, setEditSaving] = useState(false);
  const c = complaint;
  const handleResolve = async () => { setResolving(true); await onResolve(c.id, resolveDate || null); setResolving(false); };
  const handleUnresolve = async () => { await onUnresolve(c.id); await onRefresh(); };
  const handleDelete = async () => { if (window.confirm("Delete this complaint permanently?")) { await onDelete(c.id); await onRefresh(); } };
  const handleEditSave = async () => { if (!editTitle.trim() || !editDesc.trim()) return; setEditSaving(true); await updateComplaintFields(c.id, { title: editTitle.trim(), description: editDesc.trim() }); setEditSaving(false); setEditing(false); await onRefresh(); };
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
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}><StatusBadge status={c.status} /><span style={styles.cardDate}>{new Date(c.created_at).toLocaleDateString("en-PK", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span></div>
          </div>
          <p style={styles.cardDesc}>{c.description}</p>
          {c.status === "Resolved" && c.resolved_at && (<p style={{ fontSize: 12, color: "#276749", marginTop: 4 }}>Resolved: {new Date(c.resolved_at).toLocaleDateString("en-PK", { year: "numeric", month: "short", day: "numeric" })}</p>)}
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
            {canResolve && c.status !== "Resolved" && (
              <>{isAdmin && <input type="date" style={{ fontSize: 12, padding: "4px 8px", border: "1px solid #e2e8f0", borderRadius: 6 }} value={resolveDate} onChange={e => setResolveDate(e.target.value)} />}<button style={styles.resolveBtn} onClick={handleResolve} disabled={resolving}>{resolving ? "Resolving…" : "Mark as Resolved"}</button></>
            )}
            {isAdmin && c.status === "Resolved" && (<button style={{ fontSize: 13, fontWeight: 600, color: "#9c4221", background: "#feebc8", border: "none", borderRadius: 6, padding: "6px 14px", cursor: "pointer" }} onClick={handleUnresolve}>Unresolve</button>)}
            {isAdmin && <button style={{ fontSize: 13, fontWeight: 500, color: "#0e7c6b", background: "#e6f5f2", border: "none", borderRadius: 6, padding: "6px 14px", cursor: "pointer" }} onClick={() => setEditing(true)}>Edit</button>}
            {isAdmin && <button style={styles.deleteBtn} onClick={handleDelete}>Delete</button>}
          </div>
        </>
      )}
      <CommentSection complaintId={c.id} currentUser={currentUser} canComment={canComment} isAdmin={isAdmin} />
    </div>
  );
}

function ComplaintListView({ hospital, complaints, currentUser, canResolve, canComment, isAdmin, onBack, onResolve, onUnresolve, onDelete, onRefresh }) {
  const hc = complaints.filter(c => c.hospital === hospital);
  return (<>
    <button style={styles.backBtn} onClick={onBack}>← Back</button>
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}><h2 style={{ ...styles.sectionTitle, margin: 0 }}>{hospital}</h2><span style={{ fontSize: 13, color: "#718096" }}>({hc.length})</span><span style={{ fontSize: 12, color: "#0e7c6b", background: "#e6f5f2", padding: "2px 8px", borderRadius: 8 }}>{getProvider(hospital)}</span></div>
    {hc.length === 0 && <p style={styles.empty}>No complaints from this hospital.</p>}
    {hc.map(c => (<ComplaintCard key={c.id} complaint={c} currentUser={currentUser} canResolve={canResolve} canComment={canComment} isAdmin={isAdmin} onResolve={onResolve} onUnresolve={onUnresolve} onDelete={onDelete} onRefresh={onRefresh} />))}
  </>);
}

/* ─── Hospital Dashboard ─── */
function HospitalDashboard({ user, complaints, onRefresh, onLogout }) {
  const [title, setTitle] = useState(""); const [desc, setDesc] = useState("");
  const [success, setSuccess] = useState(false); const [submitting, setSubmitting] = useState(false);
  const mine = complaints.filter(c => c.hospital === user.name);
  const openCount = mine.filter(c => c.status !== "Resolved").length;
  const submitComplaint = async () => { if (!title.trim() || !desc.trim() || submitting) return; setSubmitting(true); const r = await insertComplaint(user.name, title.trim(), desc.trim()); setSubmitting(false); if (r) { setTitle(""); setDesc(""); setSuccess(true); setTimeout(() => setSuccess(false), 2500); await onRefresh(); } };
  const handleResolve = async (id) => { await resolveComplaint(id); await onRefresh(); };
  return (
    <div style={styles.shell}>
      <AppHeader user={user}><button style={styles.btnLogout} onClick={onLogout}>Sign Out</button></AppHeader>
      <main style={styles.main}>
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
          {mine.map(c => (<ComplaintCard key={c.id} complaint={c} currentUser={user} canResolve={true} canComment={true} isAdmin={false} onResolve={handleResolve} onUnresolve={() => {}} onDelete={() => {}} onRefresh={onRefresh} />))}
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
  const handleResolve = async (id, date) => { await resolveComplaint(id, date); await onRefresh(); };
  const handleUnresolve = async (id) => { await unresolveComplaint(id); await onRefresh(); };
  const handleDelete = async (id) => { await deleteComplaint(id); await onRefresh(); };
  const handlePasswordChange = async (userId) => { if (!newPw.trim() || saving) return; setSaving(true); const ok = await updatePassword(userId, newPw.trim()); setSaving(false); if (ok) { setPwSuccess(userId); setNewPw(""); setEditingUser(null); await onRefresh(); setTimeout(() => setPwSuccess(""), 2500); } };
  const handleAddEmail = async () => { if (!newEmail.trim() || emailSaving) return; setEmailSaving(true); await addEmail(emailGroup, newEmail.trim()); setNewEmail(""); setEmailSaving(false); await onRefresh(); };
  const handleDeleteEmail = async (id) => { await deleteEmailRecord(id); await onRefresh(); };
  const submitAdminComplaint = async () => { if (!adminTitle.trim() || !adminDesc.trim() || adminSubmitting) return; setAdminSubmitting(true); const r = await insertComplaint(adminHospital, adminTitle.trim(), adminDesc.trim(), adminDate || null); setAdminSubmitting(false); if (r) { setAdminTitle(""); setAdminDesc(""); setAdminDate(""); setAdminSuccess(true); setTimeout(() => setAdminSuccess(false), 2500); await onRefresh(); } };
  const handleAddUser = async () => { if (!newUserId.trim() || !newUserName.trim() || !newUserPw.trim() || addingUser) return; setAddingUser(true); await createUser(newUserId.trim().toLowerCase().replace(/\s+/g, ""), newUserName.trim(), newUserRole, newUserPw.trim()); setNewUserId(""); setNewUserName(""); setNewUserPw(""); setAddingUser(false); await onRefresh(); };
  const handleDeleteUser = async (id) => { if (window.confirm("Delete this user?")) { await deleteUser(id); await onRefresh(); } };

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
        {["overview","complaints","submit","passwords","emails"].map(t => (<button key={t} style={tab === t ? styles.tabActive : styles.tabInactive} onClick={() => { setTab(t); setSelected(null); }}>{t === "overview" ? "Overview" : t === "complaints" ? "Complaints" : t === "submit" ? "Submit" : t === "passwords" ? "Passwords" : "Emails"}</button>))}
      </div>
      <main style={styles.main}>
        {tab === "overview" && <OverviewTab hospitals={ALL_HOSPITALS} complaints={complaints} siteNotes={siteNotes} notifEmails={notifEmails} isAdmin={true} onRefresh={onRefresh} />}
        {tab === "complaints" && !selected && (<><div style={styles.statsBar}><div style={styles.statBox}><div style={styles.statNum}>{totalComplaints}</div><div style={styles.statLabel}>Total</div></div><div style={styles.statBox}><div style={{ ...styles.statNum, color: "#9c4221" }}>{totalOpen}</div><div style={styles.statLabel}>Open</div></div><div style={styles.statBox}><div style={{ ...styles.statNum, color: "#276749" }}>{totalComplaints - totalOpen}</div><div style={styles.statLabel}>Resolved</div></div></div><GroupedHospitalList groups={GROUPS} complaints={complaints} onSelect={setSelected} /></>)}
        {tab === "complaints" && selected && (<ComplaintListView hospital={selected} complaints={complaints} currentUser={user} canResolve={true} canComment={true} isAdmin={true} onBack={() => setSelected(null)} onResolve={handleResolve} onUnresolve={handleUnresolve} onDelete={handleDelete} onRefresh={onRefresh} />)}
        {tab === "submit" && (<section style={styles.formSection}><h2 style={styles.sectionTitle}>Submit Complaint on Behalf of Hospital</h2><select style={{ ...styles.input, cursor: "pointer" }} value={adminHospital} onChange={e => setAdminHospital(e.target.value)}>{ALL_HOSPITALS.map(h => <option key={h} value={h}>{h} — {getProvider(h)}</option>)}</select><ComplaintTypeSelect value={adminTitle} onChange={e => setAdminTitle(e.target.value)} style={styles.input} /><textarea style={{ ...styles.input, minHeight: 100, resize: "vertical", fontFamily: "inherit" }} placeholder="Describe the issue…" value={adminDesc} onChange={e => setAdminDesc(e.target.value)} /><div style={{ marginBottom: 12 }}><label style={{ fontSize: 13, color: "#4a5568", marginBottom: 4, display: "block" }}>Date (leave empty for today)</label><input style={styles.input} type="date" value={adminDate} onChange={e => setAdminDate(e.target.value)} /></div><button style={{ ...styles.btnPrimary, opacity: (!adminTitle.trim() || !adminDesc.trim() || adminSubmitting) ? 0.5 : 1 }} onClick={submitAdminComplaint}>{adminSubmitting ? "Submitting…" : "Submit Complaint"}</button>{adminSuccess && <p style={styles.successMsg}>Complaint submitted for {adminHospital}.</p>}</section>)}
        {tab === "passwords" && (<>
          <div style={styles.formSection}><h2 style={styles.sectionTitle}>Add New User</h2><div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}><div style={{ flex: 1, minWidth: 120 }}><label style={{ fontSize: 12, color: "#718096", display: "block", marginBottom: 2 }}>ID</label><input style={{ ...styles.pwInput, width: "100%", padding: "8px 10px" }} placeholder="userid" value={newUserId} onChange={e => setNewUserId(e.target.value)} /></div><div style={{ flex: 1, minWidth: 120 }}><label style={{ fontSize: 12, color: "#718096", display: "block", marginBottom: 2 }}>Display Name</label><input style={{ ...styles.pwInput, width: "100%", padding: "8px 10px" }} placeholder="Name" value={newUserName} onChange={e => setNewUserName(e.target.value)} /></div><div style={{ minWidth: 100 }}><label style={{ fontSize: 12, color: "#718096", display: "block", marginBottom: 2 }}>Role</label><select style={{ ...styles.pwInput, width: "100%", padding: "8px 10px" }} value={newUserRole} onChange={e => setNewUserRole(e.target.value)}><option value="company">Company (view-only)</option><option value="hospital">Hospital</option></select></div><div style={{ flex: 1, minWidth: 120 }}><label style={{ fontSize: 12, color: "#718096", display: "block", marginBottom: 2 }}>Password</label><input style={{ ...styles.pwInput, width: "100%", padding: "8px 10px" }} placeholder="Password" value={newUserPw} onChange={e => setNewUserPw(e.target.value)} /></div><button style={styles.pwSaveBtn} onClick={handleAddUser}>{addingUser ? "…" : "Add User"}</button></div></div>
          <h2 style={styles.sectionTitle}>Company & Admin Accounts</h2>
          {companyUsers.map(u => (<div key={u.id} style={styles.pwCard}><div style={styles.pwRow}><div><strong style={styles.pwName}>{u.name}</strong><span style={styles.pwRole}>{u.role === "admin" ? "Admin" : "Company"}</span></div><div style={styles.pwRight}><span style={styles.pwCurrent}>Current: <code>{u.password}</code></span>{editingUser === u.id ? (<div style={styles.pwEditRow}><input style={styles.pwInput} placeholder="New password" value={newPw} onChange={e => setNewPw(e.target.value)} onKeyDown={e => e.key === "Enter" && handlePasswordChange(u.id)} /><button style={styles.pwSaveBtn} onClick={() => handlePasswordChange(u.id)}>{saving ? "…" : "Save"}</button><button style={styles.pwCancelBtn} onClick={() => { setEditingUser(null); setNewPw(""); }}>✕</button></div>) : (<button style={styles.pwChangeBtn} onClick={() => { setEditingUser(u.id); setNewPw(""); }}>Change</button>)}{u.role !== "admin" && <button style={{ fontSize: 12, color: "#e53e3e", background: "none", border: "none", cursor: "pointer" }} onClick={() => handleDeleteUser(u.id)}>Delete</button>}</div></div>{pwSuccess === u.id && <p style={styles.successMsg}>Password updated.</p>}</div>))}
          {Object.entries(GROUPS).map(([provider, hospitals]) => (<div key={provider}><h2 style={{ ...styles.sectionTitle, marginTop: 28 }}>{provider} — Hospital Accounts</h2>{hospitalUsers.filter(u => hospitals.some(h => h.toLowerCase().replace(/\s+/g, "") === u.id.toLowerCase().replace(/\s+/g, ""))).map(u => (<div key={u.id} style={styles.pwCard}><div style={styles.pwRow}><div><strong style={styles.pwName}>{u.name}</strong></div><div style={styles.pwRight}><span style={styles.pwCurrent}>Current: <code>{u.password}</code></span>{editingUser === u.id ? (<div style={styles.pwEditRow}><input style={styles.pwInput} placeholder="New password" value={newPw} onChange={e => setNewPw(e.target.value)} onKeyDown={e => e.key === "Enter" && handlePasswordChange(u.id)} /><button style={styles.pwSaveBtn} onClick={() => handlePasswordChange(u.id)}>{saving ? "…" : "Save"}</button><button style={styles.pwCancelBtn} onClick={() => { setEditingUser(null); setNewPw(""); }}>✕</button></div>) : (<button style={styles.pwChangeBtn} onClick={() => { setEditingUser(u.id); setNewPw(""); }}>Change</button>)}<button style={{ fontSize: 12, color: "#e53e3e", background: "none", border: "none", cursor: "pointer" }} onClick={() => handleDeleteUser(u.id)}>Delete</button></div></div>{pwSuccess === u.id && <p style={styles.successMsg}>Password updated.</p>}</div>))}</div>))}
        </>)}
        {tab === "emails" && (<>
          <h2 style={styles.sectionTitle}>Email Notifications</h2><p style={{ fontSize: 14, color: "#4a5568", marginBottom: 20, lineHeight: 1.5 }}>Emails are sent when a complaint is submitted and when resolved. Shutdown emails are sent manually from Overview tab.</p>
          <div style={styles.formSection}><h3 style={{ fontSize: 15, fontWeight: 600, color: "#1a2332", margin: "0 0 12px" }}>Add Email</h3><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><select style={{ ...styles.pwInput, width: 150, padding: "8px 10px" }} value={emailGroup} onChange={e => setEmailGroup(e.target.value)}>{emailGroupOptions.map(g => <option key={g} value={g}>{g}</option>)}</select><input style={{ ...styles.pwInput, flex: 1, minWidth: 200, padding: "8px 10px" }} type="email" placeholder="email@example.com" value={newEmail} onChange={e => setNewEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && handleAddEmail()} /><button style={styles.pwSaveBtn} onClick={handleAddEmail}>{emailSaving ? "…" : "Add"}</button></div></div>
          {emailGroupOptions.map(g => { const ge = notifEmails.filter(e => e.group_name === g); if (!ge.length) return null; return (<div key={g} style={{ marginTop: 20 }}><h3 style={{ fontSize: 15, fontWeight: 600, color: "#0e7c6b", margin: "0 0 10px" }}>{g}</h3>{ge.map(e => (<div key={e.id} style={{ ...styles.pwCard, display: "flex", justifyContent: "space-between", alignItems: "center" }}><span style={{ fontSize: 14, color: "#1a2332" }}>{e.email}</span><button style={{ ...styles.pwCancelBtn, color: "#e53e3e", fontSize: 14 }} onClick={() => handleDeleteEmail(e.id)}>Remove</button></div>))}</div>); })}
          {notifEmails.length === 0 && <p style={styles.empty}>No notification emails configured yet.</p>}
        </>)}
      </main>
    </div>
  );
}

/* ─── Company Dashboard ─── */
function CompanyDashboard({ user, complaints, siteNotes, onRefresh, onLogout }) {
  const [tab, setTab] = useState("overview"); const [selected, setSelected] = useState(null); const [refreshing, setRefreshing] = useState(false);
  const seesAll = ["Novair", "Amex", "UNDP", "CMU"].includes(user.name);
  const myGroups = {}; if (seesAll) { Object.assign(myGroups, GROUPS); } else if (GROUPS[user.name]) { myGroups[user.name] = GROUPS[user.name]; } else { Object.assign(myGroups, GROUPS); }
  const myHospitals = Object.values(myGroups).flat();
  const myComplaints = complaints.filter(c => myHospitals.includes(c.hospital));
  const totalComplaints = myComplaints.length; const totalOpen = myComplaints.filter(c => c.status !== "Resolved").length;
  const canCommentOnHospital = (hospital) => { if (["Novair", "Amex"].includes(user.name)) return true; return getProvider(hospital) === user.name; };
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
        {tab === "overview" && <OverviewTab hospitals={myHospitals} complaints={complaints} siteNotes={siteNotes} notifEmails={[]} isAdmin={false} onRefresh={onRefresh} />}
        {tab === "complaints" && !selected && (<><div style={styles.statsBar}><div style={styles.statBox}><div style={styles.statNum}>{totalComplaints}</div><div style={styles.statLabel}>Total</div></div><div style={styles.statBox}><div style={{ ...styles.statNum, color: "#9c4221" }}>{totalOpen}</div><div style={styles.statLabel}>Open</div></div><div style={styles.statBox}><div style={{ ...styles.statNum, color: "#276749" }}>{totalComplaints - totalOpen}</div><div style={styles.statLabel}>Resolved</div></div></div><GroupedHospitalList groups={myGroups} complaints={complaints} onSelect={setSelected} /></>)}
        {tab === "complaints" && selected && (<ComplaintListView hospital={selected} complaints={complaints} currentUser={user} canResolve={false} canComment={canCommentOnHospital(selected)} isAdmin={false} onBack={() => setSelected(null)} onResolve={() => {}} onUnresolve={() => {}} onDelete={() => {}} onRefresh={onRefresh} />)}
      </main>
    </div>
  );
}

/* ─── Styles ─── */
const C = { bg: "#f5f6fa", white: "#ffffff", navy: "#1a2744", navyLight: "#2d3e5f", gold: "#c9a84c", goldLight: "#fdf8ed", brand: "#1a2744", brandLight: "#e8ebf0", text: "#1a2744", textMid: "#4a5068", textLight: "#8890a4", border: "#dfe3ec", red: "#d32f2f", green: "#2e7d32", accent: "#c9a84c" };
const styles = {
  loadWrap: { minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: C.bg, fontFamily: "'Inter', system-ui, sans-serif" },
  loadLogo: { fontSize: 52, fontWeight: 800, color: C.navy, letterSpacing: -2 },
  loginBg: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: `linear-gradient(160deg, ${C.navy} 0%, ${C.navyLight} 50%, #3a506b 100%)`, fontFamily: "'Inter', system-ui, sans-serif", padding: 20 },
  loginCard: { background: C.white, borderRadius: 12, padding: "44px 36px", width: "100%", maxWidth: 420, boxShadow: "0 24px 80px rgba(0,0,0,0.25)", borderTop: `4px solid ${C.gold}` },
  loginBrand: { display: "flex", alignItems: "center", gap: 10, marginBottom: 28 },
  brandMark: { fontSize: 30, fontWeight: 800, color: C.navy, letterSpacing: -1 },
  brandText: { fontSize: 15, fontWeight: 600, color: C.textMid, letterSpacing: 0.3 },
  loginTitle: { fontSize: 24, fontWeight: 700, color: C.navy, margin: "0 0 4px", letterSpacing: -0.5 },
  loginSub: { fontSize: 14, color: C.textLight, margin: "0 0 24px" },
  input: { display: "block", width: "100%", padding: "13px 16px", fontSize: 14, border: `1.5px solid ${C.border}`, borderRadius: 8, marginBottom: 14, outline: "none", boxSizing: "border-box", color: C.text, background: "#fafbfd", transition: "border 0.2s", fontFamily: "'Inter', system-ui, sans-serif" },
  btnPrimary: { display: "block", width: "100%", padding: "14px 0", fontSize: 15, fontWeight: 700, color: "#fff", background: C.navy, border: "none", borderRadius: 8, cursor: "pointer", letterSpacing: 0.5, transition: "background 0.2s" },
  err: { color: C.red, fontSize: 13, margin: "0 0 10px", textAlign: "center", fontWeight: 500 },
  shell: { minHeight: "100vh", background: C.bg, fontFamily: "'Inter', system-ui, sans-serif" },
  header: { background: C.navy, padding: "14px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 10, boxShadow: "0 2px 12px rgba(0,0,0,0.15)" },
  headerLeft: { display: "flex", alignItems: "center", gap: 10 },
  headerBrand: { fontSize: 15, fontWeight: 700, color: "#fff", display: "flex", alignItems: "center", gap: 8 },
  headerMark: { fontSize: 22, fontWeight: 800, color: C.gold, letterSpacing: -1 },
  headerUser: { fontSize: 12, color: "#a8b4cc", marginTop: 3, letterSpacing: 0.3 },
  btnLogout: { fontSize: 12, fontWeight: 500, color: "#c8d0e0", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 6, padding: "6px 14px", cursor: "pointer", transition: "background 0.2s" },
  downloadBtn: { fontSize: 12, fontWeight: 600, color: C.navy, background: C.gold, border: "none", borderRadius: 6, padding: "6px 14px", cursor: "pointer", letterSpacing: 0.3 },
  main: { maxWidth: 960, margin: "0 auto", padding: "28px 24px" },
  formSection: { background: C.white, borderRadius: 10, padding: 28, marginBottom: 24, border: `1px solid ${C.border}`, boxShadow: "0 2px 8px rgba(0,0,0,0.04)" },
  listSection: { marginBottom: 24 },
  sectionTitle: { fontSize: 18, fontWeight: 700, color: C.navy, margin: "0 0 18px", letterSpacing: -0.3 },
  card: { background: C.white, borderRadius: 10, padding: "18px 20px", marginBottom: 12, border: `1px solid ${C.border}`, boxShadow: "0 1px 4px rgba(0,0,0,0.04)", transition: "box-shadow 0.2s" },
  cardTop: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 8, flexWrap: "wrap" },
  cardTitle: { fontSize: 15, fontWeight: 700, color: C.navy },
  cardDate: { fontSize: 12, color: C.textLight, whiteSpace: "nowrap", marginTop: 2, fontWeight: 500 },
  cardDesc: { fontSize: 14, color: C.textMid, margin: 0, lineHeight: 1.6 },
  empty: { fontSize: 14, color: C.textLight, fontStyle: "italic" },
  successMsg: { color: C.green, fontSize: 14, fontWeight: 600, marginTop: 12, textAlign: "center" },
  statsBar: { display: "flex", gap: 14, marginBottom: 28, flexWrap: "wrap" },
  statBox: { flex: 1, minWidth: 90, background: C.white, borderRadius: 10, padding: "18px 16px", border: `1px solid ${C.border}`, textAlign: "center", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" },
  statNum: { fontSize: 28, fontWeight: 800, color: C.navy },
  statLabel: { fontSize: 11, color: C.textLight, marginTop: 4, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 },
  hospitalGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 },
  hospitalBtn: { display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "14px 16px", background: C.white, border: `1px solid ${C.border}`, borderRadius: 8, cursor: "pointer", textAlign: "left", boxShadow: "0 1px 3px rgba(0,0,0,0.03)", transition: "box-shadow 0.2s, border-color 0.2s" },
  hospitalIndex: { fontSize: 11, fontWeight: 700, color: C.textLight, minWidth: 22, background: C.bg, borderRadius: 4, textAlign: "center", padding: "2px 0" },
  hospitalName: { flex: 1, fontSize: 14, fontWeight: 600, color: C.navy },
  hospitalBadge: { fontSize: 12, fontWeight: 700, color: C.navy, background: C.brandLight, borderRadius: 12, padding: "2px 10px", minWidth: 22, textAlign: "center" },
  openBadge: { fontSize: 11, fontWeight: 700, color: "#9c4221", background: "#feebc8", borderRadius: 12, padding: "2px 8px", minWidth: 18, textAlign: "center" },
  backBtn: { fontSize: 14, fontWeight: 600, color: C.navy, background: "none", border: "none", cursor: "pointer", padding: "0 0 16px", display: "block", letterSpacing: 0.2 },
  resolveBtn: { fontSize: 13, fontWeight: 700, color: "#fff", background: C.green, border: "none", borderRadius: 6, padding: "7px 18px", cursor: "pointer", letterSpacing: 0.3 },
  deleteBtn: { fontSize: 13, fontWeight: 600, color: "#fff", background: C.red, border: "none", borderRadius: 6, padding: "7px 18px", cursor: "pointer" },
  groupSection: { marginBottom: 32 },
  groupHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 8, paddingBottom: 10, borderBottom: `2px solid ${C.gold}44` },
  groupTitle: { fontSize: 17, fontWeight: 700, color: C.navy, margin: 0, letterSpacing: -0.2 },
  groupBadge: { fontSize: 12, fontWeight: 600, color: C.textMid, background: C.bg, borderRadius: 12, padding: "4px 14px", border: `1px solid ${C.border}` },
  tabBar: { display: "flex", gap: 0, maxWidth: 960, margin: "0 auto", padding: "0 24px", background: C.white, borderBottom: `2px solid ${C.border}`, flexWrap: "wrap" },
  tabActive: { padding: "14px 22px", fontSize: 14, fontWeight: 700, color: C.navy, background: "none", border: "none", borderBottom: `3px solid ${C.gold}`, cursor: "pointer", marginBottom: -2, letterSpacing: 0.2 },
  tabInactive: { padding: "14px 22px", fontSize: 14, fontWeight: 500, color: C.textLight, background: "none", border: "none", borderBottom: "3px solid transparent", cursor: "pointer", marginBottom: -2, transition: "color 0.2s" },
  pwCard: { background: C.white, borderRadius: 8, padding: "14px 18px", marginBottom: 8, border: `1px solid ${C.border}`, boxShadow: "0 1px 3px rgba(0,0,0,0.03)" },
  pwRow: { display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 },
  pwName: { fontSize: 15, fontWeight: 700, color: C.navy, marginRight: 8 },
  pwRole: { fontSize: 11, fontWeight: 600, color: C.white, background: C.navy, borderRadius: 4, padding: "2px 10px", letterSpacing: 0.5, textTransform: "uppercase" },
  pwRight: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" },
  pwCurrent: { fontSize: 13, color: C.textLight },
  pwChangeBtn: { fontSize: 13, fontWeight: 600, color: C.navy, background: C.brandLight, border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 14px", cursor: "pointer" },
  pwEditRow: { display: "flex", gap: 6, alignItems: "center" },
  pwInput: { padding: "7px 12px", fontSize: 13, border: `1.5px solid ${C.border}`, borderRadius: 6, width: 140, outline: "none", fontFamily: "'Inter', system-ui, sans-serif" },
  pwSaveBtn: { fontSize: 13, fontWeight: 700, color: C.white, background: C.navy, border: "none", borderRadius: 6, padding: "7px 14px", cursor: "pointer" },
  pwCancelBtn: { fontSize: 13, color: C.textLight, background: "none", border: "none", cursor: "pointer", padding: "6px" },
  commentToggle: { fontSize: 13, fontWeight: 600, color: C.navy, background: "none", border: "none", cursor: "pointer", padding: 0, letterSpacing: 0.2 },
  commentBox: { marginTop: 10, padding: "14px 16px", background: "#f8f9fc", borderRadius: 8, border: `1px solid ${C.border}` },
  commentItem: { padding: "10px 0", borderBottom: `1px solid ${C.border}` },
  commentHeader: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  commentInputRow: { display: "flex", gap: 8, marginTop: 12 },
  commentInput: { flex: 1, padding: "10px 14px", fontSize: 13, border: `1.5px solid ${C.border}`, borderRadius: 6, outline: "none", fontFamily: "'Inter', system-ui, sans-serif" },
  commentSendBtn: { fontSize: 13, fontWeight: 700, color: C.white, background: C.navy, border: "none", borderRadius: 6, padding: "10px 20px", cursor: "pointer" },
  overviewTable: { background: C.white, borderRadius: 10, border: `1px solid ${C.border}`, overflow: "auto", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" },
  overviewHeaderRow: { display: "flex", padding: "14px 18px", background: C.navy, fontWeight: 700, fontSize: 12, color: "#c8d0e0", borderBottom: `1px solid ${C.border}`, gap: 8, minWidth: 800, letterSpacing: 0.5, textTransform: "uppercase" },
  overviewRow: { display: "flex", padding: "14px 18px", borderBottom: `1px solid ${C.border}`, gap: 8, alignItems: "flex-start", minWidth: 800, transition: "background 0.15s" },
  ovCellSr: { width: 30, flexShrink: 0, fontSize: 12, color: C.textLight, fontWeight: 600 },
  ovCellSite: { width: 120, flexShrink: 0, fontSize: 13 },
  ovCellProvider: { width: 100, flexShrink: 0 },
  ovCellStatus: { width: 120, flexShrink: 0 },
  ovCellOpen: { flex: 1, minWidth: 150 },
  ovCellNote: { flex: 1, minWidth: 150 },
};
