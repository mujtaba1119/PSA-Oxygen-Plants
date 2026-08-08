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

async function deleteEmail(id) {
  const { error } = await supabase.from("notification_emails").delete().eq("id", id);
  return !error;
}

const RESEND_KEY = "re_KBcPovEP_MYNRjWF5KMMqhcGxWBx9Wnrc";

async function sendNotificationEmails(hospital, title, description, provider, emails) {
  if (!emails.length) return;
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
      <div style="background:#0e7c6b;color:white;padding:16px 24px;border-radius:8px 8px 0 0;">
        <h2 style="margin:0;font-size:18px;">O₂ PSA Oxygen Plant — New Complaint</h2>
      </div>
      <div style="border:1px solid #e2e8f0;border-top:none;padding:24px;border-radius:0 0 8px 8px;">
        <p style="margin:0 0 8px;"><strong>Hospital:</strong> ${hospital}</p>
        <p style="margin:0 0 8px;"><strong>Service Provider:</strong> ${provider}</p>
        <p style="margin:0 0 8px;"><strong>Complaint:</strong> ${title}</p>
        <p style="margin:0 0 16px;"><strong>Description:</strong></p>
        <p style="margin:0;padding:12px;background:#f0f4f8;border-radius:6px;">${description}</p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0;" />
        <p style="margin:0;font-size:13px;color:#718096;">Visit <a href="https://psacomplaints.com">psacomplaints.com</a> to view details.</p>
      </div>
    </div>`;
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + RESEND_KEY },
      body: JSON.stringify({
        from: "PSA Oxygen Plant <alerts@psacomplaints.com>",
        to: emails,
        subject: "New Complaint: " + hospital + " — " + title,
        html,
      }),
    });
  } catch (e) { console.error("Email send failed:", e); }
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

/* ─── App ─── */
export default function App() {
  const [user, setUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [complaints, setComplaints] = useState([]);
  const [notifEmails, setNotifEmails] = useState([]);
  const [ready, setReady] = useState(false);

  const reload = useCallback(async () => {
    const [c, u, e] = await Promise.all([fetchComplaints(), fetchUsers(), fetchEmails()]);
    setComplaints(c); setUsers(u); setNotifEmails(e);
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
  if (user.role === "hospital") return <HospitalDashboard user={user} complaints={complaints} notifEmails={notifEmails} onRefresh={reload} onLogout={() => setUser(null)} />;
  if (user.role === "admin") return <AdminDashboard user={user} users={users} complaints={complaints} notifEmails={notifEmails} onRefresh={reload} onLogout={() => setUser(null)} />;
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

/* ─── Status Badge ─── */
function StatusBadge({ status }) {
  const isResolved = status === "Resolved";
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 12,
      color: isResolved ? "#276749" : "#9c4221",
      background: isResolved ? "#c6f6d5" : "#feebc8",
    }}>
      {isResolved ? "Resolved" : "Open"}
    </span>
  );
}

/* ─── Comment Section ─── */
function CommentSection({ complaintId, currentUser, canComment }) {
  const [comments, setComments] = useState([]);
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const loadComments = useCallback(async () => {
    const data = await fetchComments(complaintId);
    setComments(data);
    setLoaded(true);
  }, [complaintId]);

  useEffect(() => { if (expanded) loadComments(); }, [expanded, loadComments]);

  const post = async () => {
    if (!text.trim() || posting) return;
    setPosting(true);
    const label = currentUser.role === "hospital" ? currentUser.name + " Hospital" : currentUser.name;
    await insertComment(complaintId, label, currentUser.role, text.trim());
    setText("");
    setPosting(false);
    await loadComments();
  };

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
                <span style={{ fontSize: 11, color: "#718096" }}>{new Date(c.created_at).toLocaleDateString("en-PK", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
              </div>
              <p style={{ fontSize: 13, color: "#4a5568", margin: "4px 0 0", lineHeight: 1.4 }}>{c.content}</p>
            </div>
          ))}
          {canComment && (
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
function ComplaintCard({ complaint, currentUser, canResolve, canComment, onResolve }) {
  const [resolving, setResolving] = useState(false);
  const c = complaint;

  const handleResolve = async () => {
    setResolving(true);
    await onResolve(c.id);
    setResolving(false);
  };

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
      {canResolve && c.status !== "Resolved" && (
        <button style={styles.resolveBtn} onClick={handleResolve} disabled={resolving}>
          {resolving ? "Resolving…" : "Mark as Resolved"}
        </button>
      )}
      <CommentSection complaintId={c.id} currentUser={currentUser} canComment={canComment} />
    </div>
  );
}

/* ─── Complaint List View ─── */
function ComplaintListView({ hospital, complaints, currentUser, canResolve, canComment, onBack, onResolve }) {
  const hospitalComplaints = complaints.filter(c => c.hospital === hospital);

  return (
    <>
      <button style={styles.backBtn} onClick={onBack}>← Back</button>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <h2 style={{ ...styles.sectionTitle, margin: 0 }}>{hospital}</h2>
        <span style={{ fontSize: 13, color: "#718096" }}>({hospitalComplaints.length} complaints)</span>
        <span style={{ fontSize: 12, color: "#0e7c6b", background: "#e6f5f2", padding: "2px 8px", borderRadius: 8 }}>{getProvider(hospital)}</span>
      </div>
      {hospitalComplaints.length === 0 && <p style={styles.empty}>No complaints from this hospital.</p>}
      {hospitalComplaints.map(c => (
        <ComplaintCard key={c.id} complaint={c} currentUser={currentUser} canResolve={canResolve} canComment={canComment} onResolve={onResolve} />
      ))}
    </>
  );
}

/* ─── Hospital Dashboard ─── */
function HospitalDashboard({ user, complaints, notifEmails, onRefresh, onLogout }) {
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const mine = complaints.filter(c => c.hospital === user.name);
  const openCount = mine.filter(c => c.status !== "Resolved").length;

  const submitComplaint = async () => {
    if (!title.trim() || !desc.trim() || submitting) return;
    setSubmitting(true);
    const result = await insertComplaint(user.name, title.trim(), desc.trim());
    if (result) {
      // Send email notifications
      const provider = getProvider(user.name);
      const recipientGroups = new Set([provider, "Novair", "Amex"]);
      const emails = notifEmails.filter(e => recipientGroups.has(e.group_name)).map(e => e.email);
      const uniqueEmails = [...new Set(emails)];
      if (uniqueEmails.length) {
        sendNotificationEmails(user.name, title.trim(), desc.trim(), provider, uniqueEmails);
      }
      setTitle(""); setDesc("");
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2500);
      await onRefresh();
    }
    setSubmitting(false);
  };

  const handleResolve = async (id) => {
    const ok = await resolveComplaint(id);
    if (ok) await onRefresh();
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
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h2 style={{ ...styles.sectionTitle, margin: 0 }}>Your Complaints ({mine.length})</h2>
            {openCount > 0 && <span style={{ fontSize: 13, fontWeight: 600, color: "#9c4221", background: "#feebc8", padding: "3px 10px", borderRadius: 12 }}>{openCount} open</span>}
          </div>
          {mine.length === 0 && <p style={styles.empty}>No complaints registered yet.</p>}
          {mine.map(c => (
            <ComplaintCard key={c.id} complaint={c} currentUser={user} canResolve={true} canComment={true} onResolve={handleResolve} />
          ))}
        </section>
      </main>
    </div>
  );
}

/* ─── Admin Dashboard ─── */
function AdminDashboard({ user, users, complaints, notifEmails, onRefresh, onLogout }) {
  const [tab, setTab] = useState("complaints");
  const [selected, setSelected] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [newPw, setNewPw] = useState("");
  const [pwSuccess, setPwSuccess] = useState("");
  const [saving, setSaving] = useState(false);
  const [emailGroup, setEmailGroup] = useState("Novair");
  const [newEmail, setNewEmail] = useState("");
  const [emailSaving, setEmailSaving] = useState(false);

  const totalComplaints = complaints.length;
  const totalOpen = complaints.filter(c => c.status !== "Resolved").length;
  const handleRefresh = async () => { setRefreshing(true); await onRefresh(); setRefreshing(false); };

  const handleResolve = async (id) => {
    const ok = await resolveComplaint(id);
    if (ok) await onRefresh();
  };

  const handlePasswordChange = async (userId) => {
    if (!newPw.trim() || saving) return;
    setSaving(true);
    const ok = await updatePassword(userId, newPw.trim());
    setSaving(false);
    if (ok) {
      setPwSuccess(userId); setNewPw(""); setEditingUser(null);
      await onRefresh(); setTimeout(() => setPwSuccess(""), 2500);
    }
  };

  const handleAddEmail = async () => {
    if (!newEmail.trim() || emailSaving) return;
    setEmailSaving(true);
    await addEmail(emailGroup, newEmail.trim());
    setNewEmail("");
    setEmailSaving(false);
    await onRefresh();
  };

  const handleDeleteEmail = async (id) => {
    await deleteEmail(id);
    await onRefresh();
  };

  const hospitalUsers = users.filter(u => u.role === "hospital");
  const companyUsers = users.filter(u => u.role === "company" || u.role === "admin");
  const emailGroupOptions = ["Novair", "Intexim", "Z-Corps", "Amex", "UNDP"];

  return (
    <div style={styles.shell}>
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={styles.headerMark}>O₂</span>
          <span style={styles.headerName}>Admin</span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button style={styles.downloadBtn} onClick={() => downloadCSV(complaints, "all-complaints")}>⬇ CSV</button>
          <button style={styles.btnLogout} onClick={handleRefresh}>{refreshing ? "…" : "Refresh"}</button>
          <button style={styles.btnLogout} onClick={onLogout}>Sign Out</button>
        </div>
      </header>

      <div style={styles.tabBar}>
        <button style={tab === "complaints" ? styles.tabActive : styles.tabInactive} onClick={() => { setTab("complaints"); setSelected(null); }}>Complaints</button>
        <button style={tab === "passwords" ? styles.tabActive : styles.tabInactive} onClick={() => setTab("passwords")}>Passwords</button>
        <button style={tab === "emails" ? styles.tabActive : styles.tabInactive} onClick={() => setTab("emails")}>Emails</button>
      </div>

      <main style={styles.main}>
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
          <ComplaintListView hospital={selected} complaints={complaints} currentUser={user} canResolve={true} canComment={true} onBack={() => setSelected(null)} onResolve={handleResolve} />
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
            <p style={{ fontSize: 14, color: "#4a5568", marginBottom: 20, lineHeight: 1.5 }}>
              When a hospital submits a complaint, emails are sent to the relevant service provider's list, Novair's list, and Amex's list.
            </p>
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
              const groupEmails = notifEmails.filter(e => e.group_name === g);
              if (!groupEmails.length) return null;
              return (
                <div key={g} style={{ marginTop: 20 }}>
                  <h3 style={{ fontSize: 15, fontWeight: 600, color: "#0e7c6b", margin: "0 0 10px" }}>{g}</h3>
                  {groupEmails.map(e => (
                    <div key={e.id} style={{ ...styles.pwCard, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 14, color: "#1a2332" }}>{e.email}</span>
                      <button style={{ ...styles.pwCancelBtn, color: "#e53e3e", fontSize: 14 }} onClick={() => handleDeleteEmail(e.id)}>Remove</button>
                    </div>
                  ))}
                </div>
              );
            })}

            {notifEmails.length === 0 && <p style={styles.empty}>No notification emails configured yet.</p>}
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

  // Novair, Amex, UNDP see all. Intexim, Z-Corps see only theirs.
  const seesAll = ["Novair", "Amex", "UNDP"].includes(user.name);
  const myGroups = {};
  if (seesAll) {
    Object.assign(myGroups, GROUPS);
  } else if (GROUPS[user.name]) {
    myGroups[user.name] = GROUPS[user.name];
  } else {
    Object.assign(myGroups, GROUPS);
  }
  const myHospitals = Object.values(myGroups).flat();
  const myComplaints = complaints.filter(c => myHospitals.includes(c.hospital));
  const totalComplaints = myComplaints.length;
  const totalOpen = myComplaints.filter(c => c.status !== "Resolved").length;

  // Comment permissions: can comment on complaints of own group, Novair on all, Amex on all
  const canCommentOnHospital = (hospital) => {
    if (["Novair", "Amex"].includes(user.name)) return true;
    const provider = getProvider(hospital);
    return provider === user.name;
  };

  const handleRefresh = async () => { setRefreshing(true); await onRefresh(); setRefreshing(false); };

  return (
    <div style={styles.shell}>
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={styles.headerMark}>O₂</span>
          <span style={styles.headerName}>{user.name}</span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button style={styles.downloadBtn} onClick={() => downloadCSV(myComplaints, user.name.toLowerCase() + "-complaints")}>⬇ CSV</button>
          <button style={styles.btnLogout} onClick={handleRefresh}>{refreshing ? "…" : "Refresh"}</button>
          <button style={styles.btnLogout} onClick={onLogout}>Sign Out</button>
        </div>
      </header>
      <main style={styles.main}>
        {!selected ? (
          <>
            <div style={styles.statsBar}>
              <div style={styles.statBox}><div style={styles.statNum}>{totalComplaints}</div><div style={styles.statLabel}>Total</div></div>
              <div style={styles.statBox}><div style={{ ...styles.statNum, color: "#9c4221" }}>{totalOpen}</div><div style={styles.statLabel}>Open</div></div>
              <div style={styles.statBox}><div style={{ ...styles.statNum, color: "#276749" }}>{totalComplaints - totalOpen}</div><div style={styles.statLabel}>Resolved</div></div>
            </div>
            <GroupedHospitalList groups={myGroups} complaints={complaints} onSelect={setSelected} />
          </>
        ) : (
          <ComplaintListView hospital={selected} complaints={complaints} currentUser={user} canResolve={false} canComment={canCommentOnHospital(selected)} onBack={() => setSelected(null)} onResolve={() => {}} />
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
  downloadBtn: { fontSize: 13, fontWeight: 500, color: C.brand, background: C.brandLight, border: `1px solid ${C.brand}22`, borderRadius: 6, padding: "6px 14px", cursor: "pointer" },
  main: { maxWidth: 800, margin: "0 auto", padding: "24px 20px" },
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
  statsBar: { display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap" },
  statBox: { flex: 1, minWidth: 100, background: C.white, borderRadius: 10, padding: "18px 20px", border: `1px solid ${C.border}`, textAlign: "center" },
  statNum: { fontSize: 28, fontWeight: 800, color: C.brand },
  statLabel: { fontSize: 13, color: C.textLight, marginTop: 4 },
  hospitalGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 8 },
  hospitalBtn: { display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "12px 14px", background: C.white, border: `1px solid ${C.border}`, borderRadius: 8, cursor: "pointer", textAlign: "left" },
  hospitalIndex: { fontSize: 12, fontWeight: 600, color: C.textLight, minWidth: 20 },
  hospitalName: { flex: 1, fontSize: 14, fontWeight: 500, color: C.text },
  hospitalBadge: { fontSize: 12, fontWeight: 700, color: C.brand, background: C.brandLight, borderRadius: 12, padding: "2px 9px", minWidth: 22, textAlign: "center" },
  openBadge: { fontSize: 11, fontWeight: 700, color: "#9c4221", background: "#feebc8", borderRadius: 12, padding: "2px 8px", minWidth: 18, textAlign: "center" },
  backBtn: { fontSize: 14, fontWeight: 500, color: C.brand, background: "none", border: "none", cursor: "pointer", padding: "0 0 16px", display: "block" },
  resolveBtn: { marginTop: 10, fontSize: 13, fontWeight: 600, color: "#276749", background: "#c6f6d5", border: "none", borderRadius: 6, padding: "6px 16px", cursor: "pointer" },
  groupSection: { marginBottom: 28 },
  groupHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 },
  groupTitle: { fontSize: 16, fontWeight: 700, color: C.brand, margin: 0 },
  groupBadge: { fontSize: 13, fontWeight: 600, color: C.textMid, background: C.bg, borderRadius: 12, padding: "4px 12px" },
  tabBar: { display: "flex", gap: 0, maxWidth: 800, margin: "0 auto", padding: "16px 20px 0", borderBottom: `1px solid ${C.border}` },
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
  // Comments
  commentToggle: { fontSize: 13, fontWeight: 500, color: C.brand, background: "none", border: "none", cursor: "pointer", padding: 0 },
  commentBox: { marginTop: 8, padding: "12px 14px", background: "#f7fafc", borderRadius: 8, border: `1px solid ${C.border}` },
  commentItem: { padding: "8px 0", borderBottom: `1px solid ${C.border}` },
  commentHeader: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  commentInputRow: { display: "flex", gap: 8, marginTop: 10 },
  commentInput: { flex: 1, padding: "8px 10px", fontSize: 13, border: `1px solid ${C.border}`, borderRadius: 6, outline: "none" },
  commentSendBtn: { fontSize: 13, fontWeight: 600, color: C.white, background: C.brand, border: "none", borderRadius: 6, padding: "8px 16px", cursor: "pointer" },
};
