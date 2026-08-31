import React, { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { supabase } from "./supabase";
import { MapContainer, TileLayer, Marker, GeoJSON, Popup, Tooltip } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

/* ─── Write helper: routes all DB writes through the service-role API ─── */
async function dbWrite(payload) {
  try {
    const res = await fetch("/api/db", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) { console.error("dbWrite error:", data.error); return { error: data.error }; }
    return data;
  } catch (e) {
    console.error("dbWrite failed:", e);
    return { error: e.message };
  }
}

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
const LOGO_FLAG = "/logos/flag.png";
const LOGO_GLOBALFUND = "/logos/GF.svg";
const LOGO_GOVT = "/logos/govt.png";
const LOGO_UNDP = "/logos/UNDP.png";
const LOGO_AMEX = "/logos/Amex.png";
const LOGO_NOXERIOR = "/logos/Noxerior.png";
const LOGO_CMU = "/logos/CMU.png";

/* ─── Data ─── */
const GROUPS = {
  "Novair": ["Rawalpindi","Kohat","Swat","Timergara","Malakand","Bannu","Neelum","Jhelum","Haveli","Nagar","Ghizer","Astore","Khaplu","Islamabad"],
  "Intexim": ["Bhakkar","Sahiwal","Toba Tek Singh","Sargodha","Rahim Yar Khan","Jhang","Faisalabad","Bhimber","Multan"],
  "Z-Corps": ["Larkana","Jamshoro","Quetta SZ","DM Jamali","Khuzdar","Sibbi","Nawabshah","Zhob","Quetta Sandeman","Loralai","Panjgur","Kharan","Karachi"],
};
const ALL_HOSPITALS = Object.values(GROUPS).flat();
const getProvider = h => Object.entries(GROUPS).find(([, list]) => list.includes(h))?.[0] || "Unknown";
const DISPLAY_NAMES = { "Timergara": "Lower Dir - Timergara", "Malakand": "Batkhela - Malakand", "Neelum": "Neelum - AJK", "Jhelum": "Jhelum - AJK", "Haveli": "Haveli - AJK", "Ghizer": "Gahkuch - Ghizer", "Khaplu": "Khaplu - Ghanche", "Quetta SZ": "Quetta Sheikh Zayed", "Panjgur": "Panjgur", "Bhimber": "Bhimber" };
const displayName = h => DISPLAY_NAMES[h] || h;
// Full hospital names — used ONLY on the hospital account's own dashboard heading.
const FULL_HOSPITAL_NAMES = { "Rawalpindi": "Rawalpindi - Holy Family Hospital", "Kohat": "DHQ Hospital Kohat", "Swat": "Saidu Teaching Hospital", "Timergara": "DHQ Hospital Timergara", "Malakand": "Batkhela - DHQ Hospital", "Bannu": "Khalifa Gul Nawaz Hospital", "Neelum": "DHQ Hospital Neelum", "Jhelum": "DHQ Hospital Jehlum Valley", "Haveli": "DHQ Hospital Haveli", "Nagar": "DHQ Hospital Nagar", "Ghizer": "DHQ Hospital Gahkuch", "Astore": "DHQ Hospital Eidgah - Astore", "Khaplu": "DHQ Hospital Khaplu - Ghanche", "Islamabad": "PIMS Hospital Islamabad", "Bhakkar": "DHQ Hospital Bhakkar", "Sahiwal": "Sahiwal Teaching Hospital", "Toba Tek Singh": "DHQ Hospital Toba Tek Singh", "Sargodha": "DHQ Hospital Sargodha", "Rahim Yar Khan": "Sheikh Zayed Hospital - Rahim Yar Khan", "Jhang": "DHQ Hospital Jhang", "Faisalabad": "Allied Hospital Faisalabad", "Bhimber": "DHQ Hospital Bhimber", "Multan": "Nishtar Hospital Multan", "Larkana": "Chandka Medical College Hospital", "Jamshoro": "Liaqat University Hospital Jamshoro", "Quetta SZ": "Sheikh Zayed Hospital Quetta", "DM Jamali": "DHQ Hospital Dera Murad Jamali", "Khuzdar": "DHQ Hospital Khuzdar", "Sibbi": "DHQ Hospital Sibbi", "Nawabshah": "DHQ Hospital Benazirabad", "Zhob": "DHQ Teaching Hospital Zhob", "Quetta Sandeman": "Sandman Provincial Hospital Quetta", "Loralai": "DHQ Teaching Hospital Loralai", "Panjgur": "DHQ Hospital Panjgur", "Kharan": "Divisional Hospital Kharan", "Karachi": "Sindh Govt. Hospital Korangi" };
const fullHospitalName = h => FULL_HOSPITAL_NAMES[h] || h;

// Internal-only site abbreviations for ticket numbering (never shown as labels, only in ticket IDs)
const SITE_CODES = {
  "Rawalpindi": "RA", "Kohat": "KO", "Swat": "SW", "Timergara": "TI", "Malakand": "ML",
  "Bannu": "BA", "Neelum": "NE", "Jhelum": "JH", "Haveli": "HA", "Nagar": "NG",
  "Ghizer": "GH", "Astore": "AS", "Khaplu": "KH", "Islamabad": "IS",
  "Bhakkar": "BH", "Sahiwal": "SA", "Toba Tek Singh": "TT", "Sargodha": "SG",
  "Rahim Yar Khan": "RY", "Jhang": "JG", "Faisalabad": "FA", "Bhimber": "BM", "Multan": "MU",
  "Larkana": "LA", "Jamshoro": "JA", "Quetta SZ": "QS", "DM Jamali": "DM", "Khuzdar": "KZ",
  "Sibbi": "SI", "Nawabshah": "NA", "Zhob": "ZH", "Quetta Sandeman": "QN", "Loralai": "LO",
  "Panjgur": "PA", "Kharan": "KR", "Karachi": "KA"
};

// Compute the ticket number (e.g. "RA3") for a given complaint, derived from its site's
// tickets sorted by creation order. This naturally renumbers/fills gaps when a ticket is deleted.
function getTicketNumber(complaint, allComplaints) {
  if (!complaint || !complaint.hospital) return "";
  const code = SITE_CODES[complaint.hospital];
  if (!code) return "";
  const siteTickets = allComplaints
    .filter(c => hospitalMatches(c.hospital, complaint.hospital))
    .sort((a, b) => {
      const dt = new Date(a.created_at) - new Date(b.created_at);
      if (dt !== 0) return dt;
      return String(a.id).localeCompare(String(b.id)); // stable tiebreak
    });
  const idx = siteTickets.findIndex(c => c.id === complaint.id);
  return idx === -1 ? "" : `${code}${idx + 1}`;
}


// Site coordinates for the homepage map, keyed by the EXACT site name used in GROUPS above
// (not the fuller facility names they were given as — e.g. GROUPS uses "Kharan", not "DHQ Kharan").
// All 36 sites collected.
const SITE_COORDS = {
  // Novair
  "Rawalpindi": [33.640750, 73.058472],
  "Kohat": [33.613417, 71.471972],
  "Swat": [34.758225, 72.358705],
  "Timergara": [34.829583, 71.845083],
  "Malakand": [34.611468, 71.961025],
  "Bannu": [33.015528, 70.708639],
  "Neelum": [34.587936, 73.913451],
  "Jhelum": [34.175732, 73.729491],
  "Haveli": [33.884000, 74.108583],
  "Nagar": [36.243205, 74.363185],
  "Ghizer": [36.184048, 73.766230],
  "Astore": [35.346944, 74.856111],
  "Khaplu": [35.153222, 76.344028],
  "Islamabad": [33.703597, 73.053875],
  // Intexim
  "Faisalabad": [31.450472, 73.081028],
  "Multan": [30.201417, 71.442889],
  "Bhakkar": [31.626586, 71.088862],
  "Sahiwal": [30.683182, 73.100251],
  "Toba Tek Singh": [30.952000, 72.495583],
  "Sargodha": [32.081682, 72.663702],
  "Rahim Yar Khan": [28.418035, 70.315110],
  "Jhang": [31.262636, 72.334968],
  "Bhimber": [32.969555, 74.053143],
  // Z-Corps
  "Larkana": [27.555194, 68.199056],
  "Jamshoro": [25.432539, 68.269924],
  "Nawabshah": [26.243639, 68.405722],
  "Karachi": [24.829139, 67.163861],
  "Quetta SZ": [30.083664, 66.961242],
  "DM Jamali": [28.542028, 68.210056],
  "Khuzdar": [27.810111, 66.610167],
  "Sibbi": [29.552000, 67.892028],
  "Zhob": [31.342000, 69.443583],
  "Quetta Sandeman": [30.193833, 67.009083],
  "Loralai": [30.380083, 68.600056],
  "Panjgur": [26.970325, 64.095459],
  "Kharan": [28.589111, 65.429528],
};

const COMPLAINT_TYPES = [
  "Complete Shutdown","Compressor Issue","Dryer Issue","Purity Issue/Oxygen Generator Issue",
  "Electrical/Power Issue","Booster Filling System Issue","Monitoring/CSS Issue",
  "Backup Manifold Issue","Power Generator Issue","Other Issue"
];

// Severity auto-assigned per issue type at ticket creation. Operator can still override
// (see the severity select next to the issue-type dropdown in the submission form).
const SEVERITY_MAP = {
  "Complete Shutdown": "Critical",
  "Compressor Issue": "High",
  "Dryer Issue": "High",
  "Purity Issue/Oxygen Generator Issue": "High",
  "Electrical/Power Issue": "High",
  "Booster Filling System Issue": "High",
  "Monitoring/CSS Issue": "Low",
  "Backup Manifold Issue": "Low",
  "Power Generator Issue": "Low",
  "Other Issue": "Low",
};
function getDefaultSeverity(issueTitle) { return SEVERITY_MAP[issueTitle] || "Low"; }

// Maps a complaint type to the equipment groups whose serials the operator should pick from.
// Each group has a label and the item keys it covers. Only multi-unit types prompt for selection.
const COMPLAINT_EQUIP_GROUPS = {
  "Compressor Issue": [{ label: "Compressor", keys: ["comp1", "comp2", "comp3", "comp4"] }],
  "Dryer Issue": [{ label: "Air Dryer", keys: ["dryer1", "dryer2", "dryer3", "dryer4"] }],
  "Purity Issue/Oxygen Generator Issue": [{ label: "Oxygen Generator", keys: ["oxyswing_a", "oxyswing_b"] }],
  "Complete Shutdown": [
    { label: "Oxygen Generator", keys: ["oxyswing_a", "oxyswing_b"] },
    { label: "Compressor", keys: ["comp1", "comp2", "comp3", "comp4"] },
    { label: "Air Dryer", keys: ["dryer1", "dryer2", "dryer3", "dryer4"] },
  ],
  "Monitoring/CSS Issue": [{ label: "CSS Panel", keys: ["css"] }],
  "Power Generator Issue": [{ label: "Power Generator", keys: ["generator"] }],
  "Booster Filling System Issue": [{ label: "HP Oxygen Panel", keys: ["hpox"] }],
  "Electrical/Power Issue": [{ label: "Power Generator", keys: ["generator"] }],
  "Backup Manifold Issue": [{ label: "Medical Gas Panel", keys: ["medgas"] }],
};
// Returns grouped serial options for a given site + complaint type:
//   [{ label, options: [{ key, label, serial }] }]  or []  if none apply.
function serialGroupsFor(hospital, complaintType) {
  const groups = COMPLAINT_EQUIP_GROUPS[complaintType];
  if (!groups) return [];
  const equip = EQUIPMENT_DATA[hospital] || {};
  return groups.map(g => ({
    label: g.label,
    options: g.keys.filter(k => equip[k]).map((k, i) => ({ key: k, label: g.label, serial: equip[k] }))
  })).filter(g => g.options.length > 0);
}
// Flat list of all serial options for a type (used to know if the picker should show at all).
function serialOptionsFor(hospital, complaintType) {
  return serialGroupsFor(hospital, complaintType).flatMap(g => g.options);
}
// Serials affected by a complaint are appended to its description in a hidden tag:
//   ...description text...\n\n[EQUIP:22177409,22177477]
// These helpers keep that tag out of the visible description and let us query by serial.
const EQUIP_TAG_RE = /\n*\[EQUIP:([^\]]*)\]\s*$/;
function encodeSerials(description, serials) {
  const clean = (description || "").replace(EQUIP_TAG_RE, "").trimEnd();
  if (!serials || serials.length === 0) return clean;
  return `${clean}\n\n[EQUIP:${serials.join(",")}]`;
}
function extractSerials(description) {
  const m = (description || "").match(EQUIP_TAG_RE);
  if (!m) return [];
  return m[1].split(",").map(s => s.trim()).filter(Boolean);
}
function cleanDescription(description) {
  return (description || "").replace(EQUIP_TAG_RE, "").trimEnd();
}
// All complaints that reference a given serial number, newest first.
function complaintsForSerial(serial, complaints) {
  return complaints
    .filter(c => extractSerials(c.description).includes(serial))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}
const SEVERITY_COLORS = {
  "Critical": { color: "#fff", background: "#c0392b" },
  "High": { color: "#fff", background: "#d9822b" },
  "Low": { color: "#555555", background: "#e6e6e6" },
};
function SeverityBadge({ severity }) {
  if (!severity) return null;
  const s = SEVERITY_COLORS[severity] || SEVERITY_COLORS["Low"];
  return <span style={{ fontSize: 8.5, fontWeight: 700, padding: "2px 6px", borderRadius: 8, color: s.color, background: s.background, textTransform: "uppercase", letterSpacing: 0.3, flexShrink: 0, whiteSpace: "nowrap" }}>{severity}</span>;
}

/* ─── Point 1: structured ticket workflow ───
   Statuses actually stored: "Open", "Resolved", "Verified".
   "Assigned" and "In Progress" are never written to the DB — they're both derived
   from status "Open" plus assignment/visit data, so no cron job is needed:
     Open (no assignee) -> Assigned (has assignee, visit not yet arrived)
     -> In Progress (visit date has arrived) -> Resolved -> Verified          */
const getCompanyName = u => u.company || u.name;
const isAmexUser = u => getCompanyName(u) === "Amex";
const isProviderUser = u => ["Novair", "Intexim", "Z-Corps"].includes(getCompanyName(u));
const isManagerUser = u => u.role === "company" && u.company_role === "manager";

function statusLabel(status) { return status === "Verified" ? "Resolved & Verified" : status; }

// assigned_to is stored as an array of names (a ticket can have multiple assignees)
function assigneeNames(c) {
  if (Array.isArray(c.assigned_to)) return c.assigned_to.filter(Boolean);
  return c.assigned_to ? [c.assigned_to] : [];
}
function hasAssignees(c) { return assigneeNames(c).length > 0; }

// visit_date is stored as an array of dates (a ticket can be visited more than once)
function visitDates(c) {
  if (Array.isArray(c.visit_date)) return c.visit_date.filter(Boolean);
  return c.visit_date ? [c.visit_date] : [];
}
function hasVisits(c) { return visitDates(c).length > 0; }

function visitHasArrived(c) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return visitDates(c).some(d => {
    const visit = new Date(d); visit.setHours(0, 0, 0, 0);
    return visit <= today;
  });
}

function getEffectiveStatus(c) {
  if (c.status === "Open") {
    if (visitHasArrived(c)) return "In Progress";
    if (hasAssignees(c)) return "Assigned";
    return "Open";
  }
  return c.status;
}

// Only a manager belonging to the site's own service-provider company (or admin) can assign staff.
// Assignment can happen repeatedly (to add more people) as long as the ticket is still in the raw
// "Open" bucket — deliberately checks raw status, not the derived display label, so it keeps working
// once the label has already flipped to "Assigned".
function canAssignTicket(user, hospital, c) {
  if (c.status !== "Open") return false;
  if (user.role === "admin") return true;
  return isManagerUser(user) && isProviderUser(user) && getProvider(hospital) === getCompanyName(user);
}
// Must have at least one assignee before a visit can be logged
function canLogVisitTicket(user, hospital, c) {
  return canAssignTicket(user, hospital, c) && hasAssignees(c);
}
// Hospital or the assigned provider can mark resolved, once a visit has actually happened
function canMarkResolvedTicket(user, hospital, c) {
  if (user.role === "admin") return c.status === "Open";
  if (getEffectiveStatus(c) !== "In Progress") return false;
  if (user.role === "hospital") return true;
  return isProviderUser(user) && getProvider(hospital) === getCompanyName(user);
}
// Only "Resolved" or "Verified" count as no-longer-open; "Open"/"Assigned"/"In Progress" are open.
function isClosedStatus(status) { return status === "Resolved" || status === "Verified"; }
// Global ticket sort order: Open, then Assigned, then In Progress, then Resolved, then Verified —
// irrespective of when each ticket was opened. Within the same status, most recent first.
const STATUS_SORT_ORDER = { "Open": 0, "Assigned": 1, "In Progress": 2, "Resolved": 3, "Verified": 4 };
// Ordered stage list + solid bar colors for the HomeTab ticket pipeline visualization
const STAGE_META = [
  { key: "Open", color: "#c2622f" },
  { key: "Assigned", color: "#7c5cbf" },
  { key: "In Progress", color: "#d69e2e" },
  { key: "Resolved", color: "#2874a6" },
  { key: "Verified", color: "#2f9e58" },
];
function compareTicketsForDisplay(a, b) {
  const ra = STATUS_SORT_ORDER[getEffectiveStatus(a)] ?? 0;
  const rb = STATUS_SORT_ORDER[getEffectiveStatus(b)] ?? 0;
  if (ra !== rb) return ra - rb;
  return new Date(b.created_at) - new Date(a.created_at);
}
// Only Amex (or admin) verifies or rejects a resolved ticket
function canVerifyTicket(user) { return user.role === "admin" || isAmexUser(user); }

/* ─── Supabase helpers ─── */
async function fetchComplaints() {
  const { data, error } = await supabase.from("complaints").select("*").order("created_at", { ascending: false });
  if (error) { console.error(error); return []; }
  return data;
}
async function insertComplaint(hospital, title, description, customDate, submittedBy, severity) {
  const data = await dbWrite({ action: "insert_complaint", hospital, title, description, submitted_by: submittedBy || null, created_at: customDate ? new Date(customDate).toISOString() : null, severity: severity || getDefaultSeverity(title) });
  if (data.error || !data.complaint) { console.error(data.error); return null; }
  const complaint = data.complaint;
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
  const data = await dbWrite({ action: "update_complaint_fields", id, fields });
  return !data.error;
}
async function requestResolution(id, requestedBy) {
  const data = await dbWrite({ action: "request_resolution", id, requested_by: requestedBy });
  return !data.error;
}
async function resolveComplaint(id, resolvedDate, resolvedBy) {
  const data = await dbWrite({ action: "resolve_complaint", id, resolved_by: resolvedBy || null, resolved_at: resolvedDate ? new Date(resolvedDate).toISOString() : null });
  return !data.error;
}
async function approveResolution(id, approvedBy) {
  const data = await dbWrite({ action: "approve_resolution", id, resolved_by: approvedBy || null });
  return !data.error;
}
async function rejectResolution(id) {
  const data = await dbWrite({ action: "reject_resolution", id });
  return !data.error;
}
async function unresolveComplaint(id) {
  const data = await dbWrite({ action: "unresolve_complaint", id });
  return !data.error;
}
async function assignComplaint(id, assignedTo, assignedBy) {
  const data = await dbWrite({ action: "assign_complaint", id, assigned_to: assignedTo, assigned_by: assignedBy || null });
  return !data.error;
}
async function logVisit(id, visitDate, loggedBy) {
  const data = await dbWrite({ action: "log_visit", id, visit_date: visitDate, logged_by: loggedBy || null });
  return !data.error;
}
async function markResolved(id, resolvedBy) {
  const data = await dbWrite({ action: "mark_resolved", id, resolved_by: resolvedBy || null });
  return !data.error;
}
async function verifyComplaint(id, verifiedBy) {
  const data = await dbWrite({ action: "verify_complaint", id, verified_by: verifiedBy || null });
  return !data.error;
}
async function rejectVerification(id) {
  const data = await dbWrite({ action: "reject_verification", id });
  return !data.error;
}
// ─── Admin undo actions ───
async function removeAssignee(id, name) {
  const data = await dbWrite({ action: "remove_assignee", id, name });
  return !data.error;
}
async function removeVisit(id, visitDate) {
  const data = await dbWrite({ action: "remove_visit", id, visit_date: visitDate });
  return !data.error;
}
async function undoResolve(id) {
  const data = await dbWrite({ action: "undo_resolve", id });
  return !data.error;
}
async function undoVerify(id) {
  const data = await dbWrite({ action: "undo_verify", id });
  return !data.error;
}
async function undoReject(id) {
  const data = await dbWrite({ action: "undo_reject", id });
  return !data.error;
}
async function deleteComplaint(id) {
  const data = await dbWrite({ action: "delete_complaint", id });
  return !data.error;
}
async function fetchUsers() {
  try {
    const res = await fetch("/api/manage-user", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "fetch" }) });
    const data = await res.json();
    if (!res.ok) { console.error(data.error); return []; }
    return data.users || [];
  } catch {
    // Fallback to direct Supabase read if API unavailable
    const { data, error } = await supabase.from("users").select("id, name, role, company, email");
    if (error) { console.error(error); return []; }
    return data || [];
  }
}
async function updatePassword(userId, newPassword) {
  try {
    const res = await fetch("/api/manage-user", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "update_password", id: userId, password: newPassword }) });
    const data = await res.json();
    if (!res.ok) { console.error(data.error); return false; }
    return true;
  } catch { return false; }
}
async function createUser(id, name, role, password, company, email, companyRole) {
  try {
    const res = await fetch("/api/manage-user", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create", id, name, role, password, company: company || undefined, email: email || undefined, company_role: companyRole || undefined }) });
    const data = await res.json();
    if (!res.ok) { alert("Error: " + data.error); return null; }
    return data.user;
  } catch { return null; }
}
async function deleteUser(id) {
  try {
    const res = await fetch("/api/manage-user", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete", id }) });
    const data = await res.json();
    if (!res.ok) { alert("Error: " + data.error); return false; }
    return true;
  } catch { return false; }
}
async function upsertNotifPref(userId, prefs) {
  try {
    await fetch("/api/manage-user", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "update_prefs", user_id: userId, prefs }) });
  } catch { console.error("Failed to update prefs"); }
}
async function fetchComments(complaintId) {
  const { data, error } = await supabase.from("comments").select("*").eq("complaint_id", complaintId).order("created_at", { ascending: true });
  if (error) { console.error(error); return []; }
  return data;
}
async function insertComment(complaintId, author, authorRole, content) {
  const data = await dbWrite({ action: "insert_comment", complaint_id: complaintId, author, author_role: authorRole, content });
  if (data.error || !data.comment) { console.error(data.error); return null; }
  return data.comment;
}
async function deleteComment(id) {
  const data = await dbWrite({ action: "delete_comment", id });
  return !data.error;
}
async function updateCommentContent(id, content) {
  const data = await dbWrite({ action: "update_comment", id, content });
  return !data.error;
}
async function fetchEmails() {
  const { data, error } = await supabase.from("notification_emails").select("*").order("created_at", { ascending: true });
  if (error) { console.error(error); return []; }
  return data;
}
async function addEmail(groupName, email) {
  const data = await dbWrite({ action: "insert_email", group_name: groupName, email });
  if (data.error || !data.row) { console.error(data.error); return null; }
  return data.row;
}
async function deleteEmailRecord(id) {
  const data = await dbWrite({ action: "delete_email", id });
  return !data.error;
}
async function fetchSiteNotes() {
  const { data, error } = await supabase.from("site_notes").select("*");
  if (error) { console.error(error); return []; }
  return data;
}
async function updateSiteNote(hospital, note) {
  const data = await dbWrite({ action: "update_site_note", hospital, equipment_note: note });
  return !data.error;
}
async function updateSiteStatus(hospital, status) {
  const data = await dbWrite({ action: "update_site_note", hospital, site_status: status });
  return !data.error;
}
async function sendShutdownEmail(hospital) {
  const { error } = await supabase.rpc("send_shutdown_email", { hospital_name: hospital });
  return !error;
}

/* ─── Notifications ─── */
async function fetchNotifications(userId, companyName) {
  const ids = [userId];
  if (companyName) ids.push(companyName.toLowerCase().replace(/[\s-]+/g, ""));
  const { data, error } = await supabase.from("notifications").select("*").in("user_id", ids).order("created_at", { ascending: false }).limit(50);
  if (error) { console.error(error); return []; }
  return data || [];
}
async function markNotifRead(id) {
  await dbWrite({ action: "mark_notification_read", id });
}
async function markAllNotifsRead(userId, companyName) {
  await dbWrite({ action: "mark_all_read", user_id: userId, company: companyName || null });
}
async function createNotification(userId, type, title, message, complaintId, hospital) {
  await dbWrite({ action: "insert_notifications", rows: [{ user_id: userId, type, title, message, complaint_id: complaintId || null, hospital: hospital || null }] });
}
async function notifyUsers(type, title, message, hospital, complaintId, excludeUser) {
  // Providers limited to only their own sites
  const providers = { "Intexim": ["intexim"], "Z-Corps": ["zcorps"] };
  // These accounts receive notifications for ALL sites (Novair included per routing rules)
  const allViewers = ["novair", "amex", "undp", "cmu", "admin"];
  const provider = Object.entries(GROUPS).find(([, list]) => list.includes(hospital))?.[0];
  const targets = [...allViewers];
  if (provider && providers[provider]) targets.push(...providers[provider]);
  // Also notify individual accounts
  try {
    const res = await fetch("/api/manage-user", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "fetch" }) });
    const data = await res.json();
    if (data.users) {
      data.users.filter(u => u.role === "company" && u.company).forEach(u => {
        const companyKey = u.company.toLowerCase().replace(/[\s-]+/g, "");
        if (targets.includes(companyKey)) targets.push(u.id);
      });
    }
  } catch {}
  const uniqueTargets = [...new Set(targets)].filter(t => t !== excludeUser);
  if (!uniqueTargets.length) return;
  const rows = uniqueTargets.map(t => ({ user_id: t, type, title, message: message || null, complaint_id: complaintId || null, hospital: hospital || null }));
  await dbWrite({ action: "insert_notifications", rows });
}

/* ─── Notification Bell Component ─── */
function NotificationBell({ user, onNavigate, onFocusComplaint, light, complaints }) {
  const [notifs, setNotifs] = useState([]);
  const [open, setOpen] = useState(false);
  const companyName = user.company || (user.role === "company" ? user.name : null);
  const userId = user.id || user.name?.toLowerCase().replace(/[\s-]+/g, "");

  const complaintTitleFor = (n) => {
    if (!n.complaint_id || !Array.isArray(complaints)) return null;
    const found = complaints.find(c => c.id === n.complaint_id);
    return found ? found.title : null;
  };

  const loadNotifs = useCallback(async () => {
    const data = await fetchNotifications(userId, companyName);
    setNotifs(data);
  }, [userId, companyName]);

  useEffect(() => { loadNotifs(); const iv = setInterval(loadNotifs, 5000); return () => clearInterval(iv); }, [loadNotifs]);

  const unread = notifs.filter(n => !n.is_read).length;
  const handleClick = (n) => {
    // Mark this one read instantly (local + server)
    if (!n.is_read) {
      setNotifs(prev => prev.map(x => x.id === n.id ? { ...x, is_read: true } : x));
      markNotifRead(n.id).catch(() => {});
    }
    setOpen(false);
    // If a focus handler is provided, use it to open + highlight the specific complaint/comment
    if (n.complaint_id && onFocusComplaint) {
      onFocusComplaint({ complaintId: n.complaint_id, hospital: n.hospital, isComment: n.type === "comment", commentText: n.type === "comment" ? (n.message || "") : "" });
    } else if (n.hospital && onNavigate) {
      onNavigate(n.hospital);
    }
  };
  const dateFmt = { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" };

  const bellRef = useRef(null);
  const [dropPos, setDropPos] = useState({ top: 0, right: 0 });

  const handleOpen = async () => {
    const willOpen = !open;
    if (willOpen && bellRef.current) {
      const rect = bellRef.current.getBoundingClientRect();
      const isMobile = window.innerWidth <= 600;
      if (isMobile) {
        // Full-width panel with small margins, anchored below the bell
        setDropPos({ top: rect.bottom + 6, right: 10, left: 10, mobile: true });
      } else {
        setDropPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right, left: null, mobile: false });
      }
    }
    setOpen(willOpen);
  };

  return (
    <div ref={bellRef} style={{ position: "relative" }}>
      <button onClick={handleOpen} style={{ width: 38, height: 38, background: light ? "rgba(255,255,255,0.08)" : "none", border: light ? "1px solid rgba(255,255,255,0.15)" : "1px solid " + C.border, borderRadius: "50%", cursor: "pointer", position: "relative", lineHeight: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s" }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={light ? "#ffffff" : C.tealDark} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 && <span style={{ position: "absolute", top: -5, right: -7, minWidth: 18, height: 15, padding: "0 5px", borderRadius: 8, background: "#5eead4", color: "#062825", fontSize: 9, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", border: light ? "2px solid #0b3b38" : "2px solid #fff" }}>{unread > 9 ? "9+" : unread}</span>}
      </button>
      {open && createPortal(<>
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 9998, background: "rgba(0,0,0,0.1)" }} onClick={() => setOpen(false)} />
        <div style={{ position: "fixed", top: dropPos.top, right: dropPos.right, left: dropPos.mobile ? dropPos.left : "auto", width: dropPos.mobile ? "auto" : 340, maxWidth: "calc(100vw - 20px)", maxHeight: "70vh", overflowY: "auto", background: "#fff", border: "1px solid #ddd", borderRadius: 12, boxShadow: "0 8px 30px rgba(0,0,0,0.2)", zIndex: 9999 }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid #eee", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <strong style={{ fontSize: 14, color: "#111" }}>Notifications</strong>
          </div>
          {notifs.length === 0 && <div style={{ padding: "24px 16px", textAlign: "center", color: "#999", fontSize: 13 }}>No notifications yet</div>}
          {notifs.map(n => {
            const ticketTitle = complaintTitleFor(n);
            const cleanTitle = n.title ? n.title.split(":")[0].trim() : n.title;
            const isHospitalUser = user.role === "hospital";
            const foundComplaint = n.complaint_id && Array.isArray(complaints) ? complaints.find(c => c.id === n.complaint_id) : null;
            const tkNum = foundComplaint ? getTicketNumber(foundComplaint, complaints) : "";
            return (
            <div key={n.id} onClick={() => handleClick(n)} style={{ padding: "10px 16px", borderBottom: "1px solid #f5f5f5", background: n.is_read ? "#fff" : "#d4f3ee", borderLeft: n.is_read ? "3px solid transparent" : `3px solid ${C.teal}`, cursor: n.complaint_id || n.hospital ? "pointer" : "default" }}>
              {/* Line 1: type */}
              <strong style={{ fontSize: 12.5, color: "#111" }}>{cleanTitle}</strong>
              {isHospitalUser ? (
                /* Hospital: Ticket ID + title */
                (tkNum || ticketTitle) ? (
                  <p style={{ fontSize: 12, color: "#555", margin: "3px 0 0", lineHeight: 1.4 }}>
                    {tkNum && <span style={{ color: C.tealDark, fontWeight: 700 }}>Ticket ID: {tkNum}  </span>}
                    {ticketTitle}
                  </p>
                ) : (n.message && <p style={{ fontSize: 12, color: "#555", margin: "3px 0 0", lineHeight: 1.4 }}>{n.message}</p>)
              ) : (
                /* Company/admin: Site name, then Ticket ID + title */
                <>
                  {n.hospital && <p style={{ fontSize: 12.5, color: "#111", fontWeight: 700, margin: "3px 0 0", lineHeight: 1.4 }}>{n.hospital}</p>}
                  {(tkNum || ticketTitle) && (
                    <p style={{ fontSize: 12, color: "#555", margin: "1px 0 0", lineHeight: 1.4 }}>
                      {tkNum && <span style={{ color: C.tealDark, fontWeight: 700 }}>Ticket ID: {tkNum}  </span>}
                      {ticketTitle}
                    </p>
                  )}
                  {!n.hospital && !ticketTitle && n.message && <p style={{ fontSize: 12, color: "#555", margin: "3px 0 0", lineHeight: 1.4 }}>{n.message}</p>}
                </>
              )}
              {/* Date and time */}
              <span style={{ fontSize: 10, color: "#999", display: "block", marginTop: 4 }}>{new Date(n.created_at).toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" })} · {new Date(n.created_at).toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit" })}</span>
            </div>
            );
          })}
        </div>
      </>, document.body)}
    </div>
  );
}

/* ─── CSV Download ─── */
function downloadCSV(complaints, filename) {
  const headers = ["Date", "Hospital", "Service Provider", "Title", "Description", "Status", "Submitted By", "Resolved Date"];
  const escape = s => '"' + String(s || "").replace(/"/g, '""') + '"';
  const rows = complaints.map(c => [
    new Date(c.created_at).toLocaleDateString("en-PK", { year: "numeric", month: "short", day: "numeric" }),
    c.hospital, getProvider(c.hospital), c.title, cleanDescription(c.description), c.status || "Open",
    c.submitted_by || "", c.resolved_at ? new Date(c.resolved_at).toLocaleDateString("en-PK", { year: "numeric", month: "short", day: "numeric" }) : ""
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

// Shown below the complaint-type select when the chosen type maps to multiple units.
// Lets the operator tick one or more affected serial numbers. Controlled via `selected` (array of serials).
function SerialPicker({ hospital, complaintType, selected, onChange }) {
  const groups = serialGroupsFor(hospital, complaintType);
  if (groups.length === 0) return null;
  const toggle = (serial) => {
    if (selected.includes(serial)) onChange(selected.filter(s => s !== serial));
    else onChange([...selected, serial]);
  };
  return (
    <div style={{ marginBottom: 16, padding: "16px 18px", background: "linear-gradient(135deg, #f0fdfa, #f7fdfb)", border: "1px solid #d5f0ea", borderRadius: 16, fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#0f766e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l8.66 5v10L12 22l-8.66-5V7z"/><circle cx="12" cy="12" r="3.5"/></svg>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#0f766e" }}>Which unit(s) are affected?</span>
        <span style={{ fontSize: 11.5, fontWeight: 500, color: "#8a9199" }}>Select one or more</span>
      </div>
      {groups.map((group, gi) => (
        <div key={group.label} style={{ marginBottom: gi < groups.length - 1 ? 16 : 0 }}>
          {groups.length > 1 && <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.06em", color: "#0f766e", textTransform: "uppercase", marginBottom: 8 }}>{group.label}s</div>}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(158px, 1fr))", gap: 10 }}>
            {group.options.map(opt => {
              const on = selected.includes(opt.serial);
              return (
                <div key={opt.key} onClick={() => toggle(opt.serial)} style={{ position: "relative", display: "flex", alignItems: "center", gap: 11, padding: "11px 13px", borderRadius: 12, cursor: "pointer", background: on ? "linear-gradient(135deg, #0d9488, #0f766e)" : "#fff", boxShadow: on ? "0 4px 12px rgba(13,148,136,0.25)" : "0 1px 3px rgba(15,23,25,0.05)", border: on ? "1.5px solid transparent" : "1.5px solid #e3efec", transition: "all 0.18s" }}>
                  <div style={{ width: 34, height: 34, borderRadius: 9, flexShrink: 0, background: on ? "rgba(255,255,255,0.18)" : "#f0fdfa", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <img src={`/equipment/${EQUIP_ICONS[opt.key] || "equipment"}.svg`} alt="" style={{ width: 22, height: 22, objectFit: "contain", filter: on ? "brightness(0) invert(1)" : "none" }} onError={e => { e.target.style.display = "none"; e.target.nextSibling.style.display = "block"; }} />
                    <svg style={{ display: "none", width: 18, height: 18 }} viewBox="0 0 24 24" fill="none" stroke={on ? "#fff" : "#0f766e"} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l8.66 5v10L12 22l-8.66-5V7z"/><circle cx="12" cy="12" r="3.5"/></svg>
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: on ? "rgba(255,255,255,0.8)" : "#8a9199", lineHeight: 1.2 }}>{opt.label}</div>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: on ? "#fff" : "#1a1d21", fontFamily: "'DM Mono', ui-monospace, monospace", letterSpacing: 0.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{opt.serial}</div>
                  </div>
                  {on && <div style={{ position: "absolute", top: 8, right: 8, width: 16, height: 16, borderRadius: "50%", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#0f766e" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  </div>}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function AppHeader({ user, children, minimal }) {
  const displayName = user.role === "hospital" ? user.name + " Hospital" : user.name;
  if (minimal) {
    return (
      <div className="header-reveal top-bar-responsive" style={{ ...styles.topBar, justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", paddingLeft: 16 }}>
          <div style={styles.topTitle}>PSA Oxygen Plants</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, paddingRight: 16 }}>{children}</div>
      </div>
    );
  }
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

/* Partner logo footer — one line, in order: Global Fund, UNDP, Amex, Noxerior, CMU */
function PartnerFooter() {
  return (
    <footer className="pf-footer" style={{ background: "#0f766e", position: "relative", overflow: "hidden" }}>
      <div style={{ padding: "18px 24px", position: "relative" }}>
        <div className="pf-row" style={{ maxWidth: 940, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 30, flexWrap: "wrap" }}>
          <img className="pf-img pf-gf" src={LOGO_GLOBALFUND} alt="Global Fund" style={{ height: 48, objectFit: "contain" }} />
          <img className="pf-img pf-undp" src={LOGO_UNDP} alt="UNDP" style={{ height: 58, objectFit: "contain" }} />
          <img className="pf-img pf-amex" src={LOGO_AMEX} alt="Amex" style={{ height: 42, objectFit: "contain" }} />
          <img className="pf-img pf-nox" src={LOGO_NOXERIOR} alt="Noxerior" style={{ height: 38, objectFit: "contain" }} />
          <img className="pf-img pf-cmu" src={LOGO_CMU} alt="CMU" style={{ height: 66, objectFit: "contain" }} />
        </div>
      </div>
      <style>{`
        /* Official Leaflet fix for Chromium tile gaps (Leaflet PR #8891, shipped in 1.9.4).
           Applied here explicitly so it works regardless of installed Leaflet version.
           Note from the Leaflet maintainers: gaps can still show if BROWSER PAGE ZOOM is not 100%. */
        .leaflet-tile-container img.leaflet-tile { mix-blend-mode: plus-lighter; }
        .site-popup .leaflet-popup-content-wrapper { padding: 0; border-radius: 14px; overflow: hidden; box-shadow: none; background: transparent; border: none; }
        .site-popup .leaflet-popup-content { margin: 0; width: 316px !important; }
        .site-popup .leaflet-popup-tip { background: #fff; box-shadow: 0 2px 8px rgba(15,118,110,0.08); }
        /* make the leaflet attribution as small and unobtrusive as possible */
        .leaflet-control-attribution { font-size: 7px !important; line-height: 1.1 !important; padding: 0 3px !important; background: rgba(255,255,255,0.55) !important; opacity: 0.65; }
        .leaflet-control-attribution a { color: #64748b !important; }
        /* partner logos kept in full colour, lifted off the teal with a dense white outline:
           many tight white drop-shadows stacked in all directions build a continuous white
           edge around every stroke — thick enough that even fine dark text stays readable. */
        .pf-img { flex: 0 1 auto; min-width: 0; display: block; transition: transform 0.35s cubic-bezier(0.16,1,0.3,1);
          filter:
            drop-shadow(0.5px 0 0 #fff) drop-shadow(-0.5px 0 0 #fff)
            drop-shadow(0 0.5px 0 #fff) drop-shadow(0 -0.5px 0 #fff)
            drop-shadow(0.4px 0.4px 0 #fff) drop-shadow(-0.4px 0.4px 0 #fff)
            drop-shadow(0.4px -0.4px 0 #fff) drop-shadow(-0.4px -0.4px 0 #fff); }
        .pf-img:hover { transform: translateY(-3px); }
        @media (prefers-reduced-motion: reduce) { .pf-img:hover { transform: none; } }
        .refresh-icon { display: none; }
        .refresh-icon-desktop { display: inline; }
        .refresh-label { display: inline; line-height: 1.4; }
        @keyframes refresh-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .spinning { animation: refresh-spin 0.7s linear infinite; transform-origin: center; }
        .tab-download-btn { position: absolute; right: 24px; top: 50%; transform: translateY(-50%); }
        @media (max-width: 640px) {
          .refresh-icon { display: inline !important; }
          .refresh-icon-desktop { display: none !important; }
          .refresh-label { display: none !important; }
          .refresh-btn { padding: 8px 10px !important; gap: 0 !important; }
          .tab-download-btn { position: static !important; transform: none !important; width: 100%; margin-top: 10px; text-align: center; }
          .pf-row { gap: 8px !important; }
          .pf-gf { height: 64px !important; }
          .pf-undp { height: 42px !important; }
          .pf-amex { height: 30px !important; }
          .pf-nox { height: 28px !important; }
          .pf-cmu { height: 50px !important; }
        }
        @media (max-width: 400px) {
          .pf-row { gap: 5px !important; }
          .pf-div { height: 32px !important; }
          .pf-gf { height: 46px !important; }
          .pf-undp { height: 38px !important; }
          .pf-amex { height: 26px !important; }
          .pf-nox { height: 24px !important; }
          .pf-cmu { height: 38px !important; }
        }
      `}</style>
    </footer>
  );
}

/* ─── Status Logic ─── */
// Site status has 4 values: "Fully Functional" (no open tickets), "Functional" (has open
// tickets, running), "Non Functional" (manually flagged — not producing, but not an emergency
// shutdown), "Shut Down" (manually flagged — the emergency state). Manual flags only apply when
// there's no open ticket already explaining the situation; an open ticket always shows as
// "Functional" unless the site is specifically marked Shut Down.
function getSiteBaseStatus(hospital, siteNotes) {
  const note = siteNotes.find(s => hospitalMatches(s.hospital, hospital));
  return note?.site_status || "Fully Functional";
}

// Hospital names are matched case/whitespace-insensitively everywhere complaints are filtered
// by site — ticket records and the site list aren't always byte-identical strings, and a strict
// equality check here silently drops real tickets (they'd still show correctly anywhere that
// already normalized, creating exactly the kind of contradiction — status badge says one thing,
// sort/ticket list says another — that's hard to spot without comparing both).
function hospitalMatches(a, b) { return (a || "").toLowerCase().trim() === (b || "").toLowerCase().trim(); }

// Small provider-colored initials avatar for the site directory table
function providerAvatarColor(provider) {
  if (provider === "Novair") return "#0f766e";
  if (provider === "Intexim") return "#7c5cbf";
  if (provider === "Z-Corps") return "#2f9e58";
  return "#6b7280";
}
function initialsFor(name) {
  const words = (name || "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

function getSiteDisplayStatus(hospital, complaints, siteNotes) {
  const base = getSiteBaseStatus(hospital, siteNotes);
  // Manual flags ("Shut Down", "Non Functional") are deliberate admin statements that the plant
  // isn't producing — they win over the presence of an open ticket and persist until an admin
  // manually clears them back to "Fully Functional".
  if (base === "Shut Down") return "Shut Down";
  if (base === "Non Functional") return "Non Functional";
  const hasOpen = complaints.some(c => hospitalMatches(c.hospital, hospital) && !isClosedStatus(c.status));
  if (hasOpen) return "Functional";
  return "Fully Functional";
}

function isFunctional(hospital, complaints, siteNotes) {
  const s = getSiteDisplayStatus(hospital, complaints, siteNotes);
  return s === "Fully Functional" || s === "Functional";
}

function SiteStatusBadge({ status }) {
  if (status === "Shut Down") {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 700, color: "#fff", background: "#7f1d1d", padding: "4px 10px", borderRadius: 20, whiteSpace: "nowrap", letterSpacing: 0.2 }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#fff", display: "inline-block", flexShrink: 0 }} />
        {status}
      </span>
    );
  }
  const color = status === "Functional" ? "#d97706" : status === "Non Functional" ? "#555" : "#166534";
  const dot = status === "Functional" ? "#f08c00" : status === "Non Functional" ? "#999" : "#2f9e58";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 600, color, padding: "4px 10px", borderRadius: 20, whiteSpace: "nowrap", letterSpacing: 0.2 }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: dot, display: "inline-block", flexShrink: 0 }} />
      {status}
    </span>
  );
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
  return <ErrorBoundary><GlobalAnimations /><AppInner /></ErrorBoundary>;
}

/* ─── Global animation library — mounted once, applies app-wide.
   Defines entrance keyframes + reusable utility classes. Everything
   respects prefers-reduced-motion. ─── */
function GlobalAnimations() {
  return (
    <style>{`
      @keyframes ox-fade-up { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: none; } }
      @keyframes ox-fade-in { from { opacity: 0; } to { opacity: 1; } }
      @keyframes ox-scale-in { from { opacity: 0; transform: scale(0.97) translateY(8px); } to { opacity: 1; transform: none; } }
      @keyframes ox-pop { from { opacity: 0; transform: scale(0.9); } to { opacity: 1; transform: scale(1); } }
      @keyframes breathe { 0%,100% { transform: scale(1); } 50% { transform: scale(1.05); } }
      @keyframes pulse { 0%,100% { opacity: 0.3; transform: scale(0.8); } 50% { opacity: 1; transform: scale(1); } }
      @keyframes ox-shimmer { 0% { background-position: -180% 0; } 100% { background-position: 180% 0; } }
      @keyframes ox-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
      @keyframes ox-sheen { 0% { transform: translateX(-120%) skewX(-18deg); } 60%,100% { transform: translateX(320%) skewX(-18deg); } }
      @keyframes ox-grow-up { from { transform: scaleY(0); } to { transform: scaleY(1); } }

      .ox-bar { transform-origin: bottom; animation: ox-grow-up 0.7s cubic-bezier(0.16, 1, 0.3, 1) both; }

      /* image gently zooms inside its frame when the parent card is hovered */
      .ox-imgzoom img { transition: transform 0.5s cubic-bezier(0.16,1,0.3,1); }
      .ox-imgzoom:hover img { transform: scale(1.06); }

      /* pulsating circular map pins */
      .ox-map-pin { position: relative; width: 16px; height: 16px; }
      .ox-map-pin-dot { position: absolute; top: 50%; left: 50%; width: 11px; height: 11px; border-radius: 50%; background: var(--pin); border: 2px solid #fff; box-shadow: 0 1px 3px rgba(0,0,0,0.35); transform: translate(-50%, -50%); z-index: 2; }
      .ox-map-pin-ring { position: absolute; top: 50%; left: 50%; width: 11px; height: 11px; border-radius: 50%; border: 2px solid var(--pin); transform: translate(-50%, -50%); opacity: 0.6; animation: ox-pin-pulse 2.8s ease-out infinite; z-index: 1; }
      @keyframes ox-pin-pulse { 0% { width: 8px; height: 8px; opacity: 0.6; } 100% { width: 32px; height: 32px; opacity: 0; } }
      @media (prefers-reduced-motion: reduce) { .ox-map-pin-ring { animation: none; opacity: 0; } }

      /* tab / page content entrance */
      .scale-in { animation: ox-scale-in 0.5s cubic-bezier(0.16, 1, 0.3, 1) both; }

      /* staggered children entrance — add .ox-stagger to a container */
      .ox-stagger > * { opacity: 0; animation: ox-fade-up 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
      .ox-stagger > *:nth-child(1) { animation-delay: 0.04s; }
      .ox-stagger > *:nth-child(2) { animation-delay: 0.10s; }
      .ox-stagger > *:nth-child(3) { animation-delay: 0.16s; }
      .ox-stagger > *:nth-child(4) { animation-delay: 0.22s; }
      .ox-stagger > *:nth-child(5) { animation-delay: 0.28s; }
      .ox-stagger > *:nth-child(6) { animation-delay: 0.34s; }
      .ox-stagger > *:nth-child(7) { animation-delay: 0.40s; }
      .ox-stagger > *:nth-child(8) { animation-delay: 0.46s; }

      /* single-element entrances with delay helpers */
      .ox-in { opacity: 0; animation: ox-fade-up 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
      .ox-in-d1 { animation-delay: 0.08s; }
      .ox-in-d2 { animation-delay: 0.16s; }
      .ox-in-d3 { animation-delay: 0.24s; }
      .ox-in-d4 { animation-delay: 0.32s; }

      .ox-float { animation: ox-float 5s ease-in-out infinite; }

      /* lift-on-hover — subtle, professional */
      .ox-lift { transition: transform 0.28s cubic-bezier(0.16,1,0.3,1), box-shadow 0.28s cubic-bezier(0.16,1,0.3,1); }
      .ox-lift:hover { transform: translateY(-3px); box-shadow: 0 14px 34px rgba(15,118,110,0.12); }

      /* sheen sweep across an element on hover (add to a position:relative, overflow:hidden parent) */
      .ox-sheen { position: relative; overflow: hidden; }
      .ox-sheen::after { content: ""; position: absolute; top: 0; bottom: 0; left: 0; width: 40%;
        background: linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent);
        transform: translateX(-120%) skewX(-18deg); pointer-events: none; opacity: 0; }
      .ox-sheen:hover::after { opacity: 1; animation: ox-sheen 0.9s ease; }

      /* number count-up shimmer for big stats */
      .ox-shimmer-text { background: linear-gradient(90deg, currentColor 30%, rgba(94,234,212,0.5) 50%, currentColor 70%);
        background-size: 200% auto; -webkit-background-clip: text; background-clip: text; }

      @media (prefers-reduced-motion: reduce) {
        .scale-in, .ox-stagger > *, .ox-in, .ox-float, .ox-lift, .ox-sheen::after { animation: none !important; opacity: 1 !important; transform: none !important; }
        .ox-lift:hover { transform: none; }
      }
    `}</style>
  );
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
  else sessionStorage.setItem(SESSION_KEY, JSON.stringify({ id: u.id, name: u.name, role: u.role, company: u.company || null }));
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
      const iv = setInterval(() => { if (!document.hidden) reload(); }, 30000);
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
  return <CompanyDashboard user={user} users={users} complaints={complaints} siteNotes={siteNotes} onRefresh={reload} onLogout={handleLogout} />;
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
    .select("id, name, role, password, company, company_role")
    .eq("id", needle)
    .maybeSingle();
  if (idErr) throw idErr;

  let user = byId;
  if (!user) {
    const { data: rows, error } = await supabase.from("users").select("id, name, role, password, company, company_role");
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

  return { id: user.id, name: user.name, role: user.role, company: user.company || null, company_role: user.company_role || null };
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

/* ─── Vessel of Light — web port of the app's tank animation ─── */
function WebVessel() {
  const VW = 300, VH = 200;
  const cx = VW / 2;
  const vW = 60, vX = cx - vW / 2;
  const vTop = 30, vBottom = 168;
  const inTop = vTop + 3, inBottom = vBottom - 3;
  const inH = inBottom - inTop;
  // rise 0.4↔1 over 5.2s; surface positions
  const surfHi = inTop + 4;      // rise=1
  const surfLo = inBottom;       // rise=0.4-ish baseline (approx inBottom)
  // For rise 0.4 the surface sits partway; compute both extremes for animation
  const surfAt = (r) => inBottom + (surfHi - inBottom) * r;
  const colAt = (r) => (inH - 4) * r;
  const rLo = 0.4, rHi = 1;
  const surfY_lo = surfAt(rLo), surfY_hi = surfAt(rHi);
  const colH_lo = colAt(rLo), colH_hi = colAt(rHi);

  // motes: rising bubbles inside the column
  const Mote = ({ mx, r, top, bottom, dur, delay, color }) => (
    <circle cx={mx} r={r} fill={color || "#eafff9"}>
      <animate attributeName="cy" values={`${bottom};${top};${bottom}`} dur={`${dur}ms`} begin={`${delay}ms`} repeatCount="indefinite" calcMode="spline" keySplines="0.4 0 0.6 1;0.4 0 0.6 1" keyTimes="0;0.5;1" />
      <animate attributeName="opacity" values="0;0.9;0" dur={`${dur}ms`} begin={`${delay}ms`} repeatCount="indefinite" />
    </circle>
  );

  return (
    <svg width={VW} height={VH} viewBox={`0 0 ${VW} ${VH}`} style={{ display: "block" }}>
      <defs>
        <radialGradient id="wv-halo" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#5eead4" stopOpacity="0.5" />
          <stop offset="1" stopColor="#5eead4" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="wv-column" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#c4fff2" stopOpacity="0.95" />
          <stop offset="0.5" stopColor="#5eead4" stopOpacity="0.8" />
          <stop offset="1" stopColor="#14b8a6" stopOpacity="0.55" />
        </linearGradient>
        <linearGradient id="wv-glass" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="rgba(255,255,255,0.9)" />
          <stop offset="0.5" stopColor="rgba(255,255,255,0.35)" />
          <stop offset="1" stopColor="rgba(255,255,255,0.9)" />
        </linearGradient>
        <clipPath id="wv-clip">
          <rect x={vX + 3} y={inTop} width={vW - 6} height={inH} rx={(vW - 6) / 2} />
        </clipPath>
      </defs>

      {/* ambient halo */}
      <circle cx={cx} cy="98" fill="url(#wv-halo)">
        <animate attributeName="r" values="78;92;78" dur="6000ms" repeatCount="indefinite" calcMode="spline" keySplines="0.4 0 0.6 1;0.4 0 0.6 1" keyTimes="0;0.5;1" />
        <animate attributeName="opacity" values="0.10;0.20;0.10" dur="6000ms" repeatCount="indefinite" />
      </circle>

      {/* neck + crown valve */}
      <line x1={cx} y1={vTop} x2={cx} y2="16" stroke="rgba(255,255,255,0.55)" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx={cx} cy="13" r="4.5" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="1.5" />

      {/* luminous column, clipped */}
      <g clipPath="url(#wv-clip)">
        <rect x={vX + 3} width={vW - 6} fill="url(#wv-column)">
          <animate attributeName="y" values={`${surfY_lo};${surfY_hi};${surfY_lo}`} dur="10400ms" repeatCount="indefinite" calcMode="spline" keySplines="0.4 0 0.6 1;0.4 0 0.6 1" keyTimes="0;0.5;1" />
          <animate attributeName="height" values={`${colH_lo};${colH_hi};${colH_lo}`} dur="10400ms" repeatCount="indefinite" calcMode="spline" keySplines="0.4 0 0.6 1;0.4 0 0.6 1" keyTimes="0;0.5;1" />
        </rect>
        {/* surface meniscus */}
        <ellipse cx={cx} rx={(vW - 8) / 2} fill="#eafff9" opacity="0.85">
          <animate attributeName="cy" values={`${surfY_lo};${surfY_hi};${surfY_lo}`} dur="10400ms" repeatCount="indefinite" calcMode="spline" keySplines="0.4 0 0.6 1;0.4 0 0.6 1" keyTimes="0;0.5;1" />
          <animate attributeName="ry" values="4.5;7;4.5" dur="4800ms" repeatCount="indefinite" />
        </ellipse>
        {/* rising motes */}
        <Mote mx={cx - 10} r={2} top={inTop + 10} bottom={inBottom - 8} dur={3400} delay={0} />
        <Mote mx={cx + 8} r={2.5} top={inTop + 10} bottom={inBottom - 8} dur={4000} delay={1200} />
        <Mote mx={cx} r={1.8} top={inTop + 10} bottom={inBottom - 8} dur={3700} delay={2200} />
      </g>

      {/* glass outline */}
      <rect x={vX} y={vTop} width={vW} height={vBottom - vTop} rx={vW / 2} fill="none" stroke="url(#wv-glass)" strokeWidth="1.6" />
      {/* specular highlight */}
      <line x1={vX + 9} y1={vTop + 16} x2={vX + 9} y2={vBottom - 16} stroke="rgba(255,255,255,0.4)" strokeWidth="2" strokeLinecap="round" />

      {/* pedestal */}
      <line x1={cx - 34} y1="182" x2={cx + 34} y2="182" stroke="rgba(255,255,255,0.4)" strokeWidth="1.2" strokeLinecap="round" />
      <line x1={vX + 10} y1={vBottom} x2={cx - 22} y2="182" stroke="rgba(255,255,255,0.32)" strokeWidth="1.2" />
      <line x1={vX + vW - 10} y1={vBottom} x2={cx + 22} y2="182" stroke="rgba(255,255,255,0.32)" strokeWidth="1.2" />

      {/* measurement scale */}
      <line x1={vX - 16} y1={inTop} x2={vX - 16} y2={inBottom} stroke="rgba(255,255,255,0.22)" strokeWidth="1" />
      <line x1={vX - 19} y1={inTop} x2={vX - 13} y2={inTop} stroke="rgba(255,255,255,0.22)" strokeWidth="1" />
      <line x1={vX - 18} y1={inTop + inH * 0.25} x2={vX - 14} y2={inTop + inH * 0.25} stroke="rgba(255,255,255,0.18)" strokeWidth="1" />
      <line x1={vX - 19} y1={inTop + inH * 0.5} x2={vX - 13} y2={inTop + inH * 0.5} stroke="rgba(255,255,255,0.22)" strokeWidth="1" />
      <line x1={vX - 18} y1={inTop + inH * 0.75} x2={vX - 14} y2={inTop + inH * 0.75} stroke="rgba(255,255,255,0.18)" strokeWidth="1" />
      <line x1={vX - 19} y1={inBottom} x2={vX - 13} y2={inBottom} stroke="rgba(255,255,255,0.22)" strokeWidth="1" />
      {/* level marker tracks surface */}
      <circle cx={vX - 16} r="2.5" fill="#5eead4">
        <animate attributeName="cy" values={`${surfY_lo};${surfY_hi};${surfY_lo}`} dur="10400ms" repeatCount="indefinite" calcMode="spline" keySplines="0.4 0 0.6 1;0.4 0 0.6 1" keyTimes="0;0.5;1" />
      </circle>

      {/* reflection */}
      <ellipse cx={cx} cy="190" rx="40" ry="7" fill="#5eead4" opacity="0.10" />
      <ellipse cx={cx} cy="192" rx="24" ry="4" fill="#5eead4" opacity="0.12" />

      {/* atmosphere particles */}
      <Mote mx={cx - 66} r={2} top={40} bottom={150} dur={6000} delay={0} color="rgba(94,234,212,0.5)" />
      <Mote mx={cx + 70} r={2.5} top={36} bottom={150} dur={7000} delay={1500} color="rgba(94,234,212,0.45)" />
      <Mote mx={cx - 84} r={1.6} top={60} bottom={150} dur={5400} delay={3000} color="rgba(94,234,212,0.4)" />
      <Mote mx={cx + 88} r={2} top={50} bottom={150} dur={6600} delay={2200} color="rgba(94,234,212,0.45)" />
      <Mote mx={cx - 50} r={1.5} top={30} bottom={130} dur={5800} delay={4000} color="rgba(94,234,212,0.4)" />
    </svg>
  );
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
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px 16px", background: "linear-gradient(180deg, #062825 0%, #0b3b38 30%, #0f5650 55%, #0f766e 80%, #14a89a 100%)", fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' }}>
      {/* Tank animation */}
      <div style={{ marginBottom: 8 }}><WebVessel /></div>

      {/* Title */}
      <div style={{ textAlign: "center", marginBottom: 22 }}>
        <div style={{ fontSize: 26, fontWeight: 800, color: "#fff", letterSpacing: 0.3 }}>PSA Oxygen Plants</div>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 7, marginTop: 8 }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#5eead4", display: "inline-block" }} />
          <span style={{ fontSize: 13, color: "rgba(255,255,255,0.85)", fontWeight: 500 }}>Management System</span>
        </div>
      </div>

      {/* Sign-in card */}
      <div className="login-card-responsive" style={{ width: "100%", maxWidth: 380, background: "#fff", borderRadius: 20, padding: "32px 28px", boxShadow: "0 20px 50px rgba(0,0,0,0.3)" }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: "#111", margin: "0 0 4px", textAlign: "center" }}>Sign in to continue</h2>
        <p style={{ fontSize: 13.5, color: "#777", margin: "0 0 24px", textAlign: "center" }}>Enter your account credentials</p>

        <div style={{ position: "relative", marginBottom: 14 }}>
          <svg style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)" }} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.teal} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
          <input style={{ width: "100%", padding: "14px 16px 14px 44px", fontSize: 14, border: `1.5px solid ${C.borderLight}`, borderRadius: 12, outline: "none", boxSizing: "border-box", background: "#fff", color: "#111" }} placeholder="Username" value={id} onChange={e => { setId(e.target.value); setErr(""); }} onKeyDown={e => e.key === "Enter" && submit()} onFocus={e => e.target.style.borderColor = C.teal} onBlur={e => e.target.style.borderColor = C.borderLight} autoComplete="username" />
        </div>
        <div style={{ position: "relative", marginBottom: 14 }}>
          <svg style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)" }} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.teal} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <input style={{ width: "100%", padding: "14px 16px 14px 44px", fontSize: 14, border: `1.5px solid ${C.borderLight}`, borderRadius: 12, outline: "none", boxSizing: "border-box", background: "#fff", color: "#111" }} type="password" placeholder="Password" value={pw} onChange={e => { setPw(e.target.value); setErr(""); }} onKeyDown={e => e.key === "Enter" && submit()} onFocus={e => e.target.style.borderColor = C.teal} onBlur={e => e.target.style.borderColor = C.borderLight} autoComplete="current-password" />
        </div>
        {err && <p style={{ color: C.red, fontSize: 13, fontWeight: 600, margin: "0 0 14px", textAlign: "center" }}>{err}</p>}
        <button style={{ width: "100%", padding: "15px 0", fontSize: 14.5, fontWeight: 700, color: "#fff", background: (locked || submitting) ? "#9db8b4" : C.teal, border: "none", borderRadius: 12, cursor: (locked || submitting) ? "not-allowed" : "pointer", boxShadow: "0 4px 12px rgba(13,148,136,0.3)", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }} onClick={submit} disabled={locked || submitting}>{submitting ? "Signing in…" : locked ? "Locked" : "Sign in"}{!submitting && !locked && <span style={{ fontSize: 16 }}>→</span>}</button>
      </div>

      {/* Partner logos panel — one row with dividers, teal accent line */}
      <div className="login-logo-panel" style={{ width: "100%", maxWidth: 640, marginTop: 26, background: "#fff", borderRadius: 18, overflow: "hidden", boxShadow: "0 10px 30px rgba(0,0,0,0.2)" }}>
        <div style={{ height: 5, width: "100%", background: "linear-gradient(90deg, #0b3b38 0%, #0f766e 50%, #14b8a6 100%)" }} />
        <div className="login-logo-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "24px 20px", gap: 6 }}>
          <img className="lg-img lg-gf" src={LOGO_GLOBALFUND} alt="Global Fund" style={{ height: 88, objectFit: "contain" }} />
          <div className="lg-div" style={{ width: 1, height: 58, background: "#e0e4e6", flexShrink: 0 }} />
          <img className="lg-img lg-undp" src={LOGO_UNDP} alt="UNDP" style={{ height: 74, objectFit: "contain" }} />
          <div className="lg-div" style={{ width: 1, height: 58, background: "#e0e4e6", flexShrink: 0 }} />
          <img className="lg-img lg-amex" src={LOGO_AMEX} alt="Amex" style={{ height: 46, objectFit: "contain" }} />
          <div className="lg-div" style={{ width: 1, height: 58, background: "#e0e4e6", flexShrink: 0 }} />
          <img className="lg-img lg-nox" src={LOGO_NOXERIOR} alt="Noxerior" style={{ height: 46, objectFit: "contain" }} />
          <div className="lg-div" style={{ width: 1, height: 58, background: "#e0e4e6", flexShrink: 0 }} />
          <img className="lg-img lg-cmu" src={LOGO_CMU} alt="CMU" style={{ height: 74, objectFit: "contain" }} />
        </div>
      </div>
      <style>{`
        .lg-img { flex-shrink: 1; min-width: 0; max-width: 100%; }
        @media (max-width: 640px) {
          .login-logo-row { padding: 16px 10px !important; gap: 3px !important; }
          .lg-div { height: 40px !important; }
          .lg-gf { height: 54px !important; }
          .lg-undp { height: 46px !important; }
          .lg-amex { height: 30px !important; }
          .lg-nox { height: 30px !important; }
          .lg-cmu { height: 46px !important; }
        }
        @media (max-width: 400px) {
          .login-logo-row { padding: 14px 8px !important; gap: 2px !important; }
          .lg-div { height: 34px !important; }
          .lg-gf { height: 44px !important; }
          .lg-undp { height: 38px !important; }
          .lg-amex { height: 24px !important; }
          .lg-nox { height: 24px !important; }
          .lg-cmu { height: 38px !important; }
        }
      `}</style>
    </div>
  );
}

function StatusBadge({ status }) {
  const styleMap = {
    "Open": { color: "#9c4221", background: "#feebc8" },
    "Assigned": { color: "#5b3a9c", background: "#ede4fb" },
    "In Progress": { color: "#7c5e10", background: "#fef3c7" },
    "Resolved": { color: "#1a5276", background: "#d6eaf8" },
    "Verified": { color: "#276749", background: "#c6f6d5" },
  };
  const s = styleMap[status] || styleMap["Open"];
  return <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 12, color: s.color, background: s.background }}>{statusLabel(status)}</span>;
}

/* "Assigned to: X, Y" — shown at every stage once one or more staff members have been assigned */
function AssignedTag({ complaint, isAdmin, onRemove }) {
  const names = assigneeNames(complaint);
  if (!names.length) return null;
  const multi = names.length > 1;
  const icon = multi
    ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#0f766e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
    : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#0f766e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
  if (!isAdmin) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, padding: "4px 12px", borderRadius: 20, color: "#0f766e", background: "#e6f5f0", border: "1px solid #cfeae2" }}>
        {icon}
        <span><span style={{ color: "#5f9b91", fontWeight: 700 }}>Assigned:</span> {names.join(", ")}</span>
      </span>
    );
  }
  return (
    <span style={{ display: "inline-flex", alignItems: "center", flexWrap: "wrap", gap: 5, fontSize: 12, fontWeight: 600, padding: "4px 8px 4px 12px", borderRadius: 20, color: "#0f766e", background: "#e6f5f0", border: "1px solid #cfeae2" }}>
      {icon}
      <span style={{ color: "#5f9b91", fontWeight: 700 }}>Assigned:</span>
      {names.map(n => (
        <span key={n} style={{ display: "inline-flex", alignItems: "center", gap: 3, background: "#fff", border: "1px solid #cfeae2", borderRadius: 12, padding: "1px 4px 1px 9px", color: "#0f766e" }}>
          {n}
          <button title="Undo this assignment" onClick={() => onRemove(n)} style={{ border: "none", background: "none", cursor: "pointer", color: "#c0392b", fontWeight: 700, fontSize: 11, padding: "0 3px" }}>✕</button>
        </span>
      ))}
    </span>
  );
}

/* ─── Overview Tab ─── */
// Pulsating circular dot marker for the map, colored per site status.
// Only running sites (green = fully functional, orange = functional with open ticket) pulse;
// non-functional (grey) and shut-down (red) stay static since they aren't actively producing.
function makePinIcon(color) {
  const pulses = color === "#16a34a" || color === "#f08c00" || color === "#2f9e44" || color === "#e0912f" || color === "#d9822b";
  const ring = pulses ? `<span class="ox-map-pin-ring"></span>` : "";
  const html = `<div class="ox-map-pin" style="--pin:${color}">
    ${ring}
    <span class="ox-map-pin-dot"></span>
  </div>`;
  return L.divIcon({
    html,
    className: "",
    iconSize: [16, 16],
    iconAnchor: [8, 8],
    popupAnchor: [0, -10],
  });
}

/* ─── Radial gauge (Control Room style) — needle + tick marks + sweeping arc.
   Used for the Resolution Rate tile. ─── */
function Speedometer({ value, teal, dark }) {
  const target = value === null || value === undefined ? 0 : value;
  const [sweep, setSweep] = useState(0);
  useEffect(() => {
    setSweep(0);
    let raf, start;
    const dur = 1300;
    const step = (t) => {
      if (!start) start = t;
      const p = Math.min((t - start) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setSweep(target * eased);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);

  const CX = 110, CY = 110, R = 88;
  const startA = 140, endA = 400; // 260° sweep
  const pct = Math.max(0, Math.min(100, sweep)) / 100;
  const ang = startA + (endA - startA) * pct;
  const rad = (a) => (a * Math.PI) / 180;
  const pt = (a, r) => [CX + r * Math.cos(rad(a)), CY + r * Math.sin(rad(a))];
  const [sx, sy] = pt(startA, R);
  const [ex, ey] = pt(ang, R);
  const large = ang - startA > 180 ? 1 : 0;
  const [ex2, ey2] = pt(endA, R);

  const ticks = Array.from({ length: 27 }, (_, i) => {
    const a = startA + (i / 26) * (endA - startA);
    const inner = pt(a, R - 13);
    const outer = pt(a, R - (i % 5 === 0 ? 21 : 17));
    return { inner, outer, major: i % 5 === 0 };
  });

  return (
    <svg viewBox="0 0 220 220" style={{ width: "100%", maxWidth: 138, display: "block", margin: "0 auto", filter: "drop-shadow(0 0 18px rgba(94,234,212,0.12))" }}>
      <defs>
        <linearGradient id="rr-arc" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#0d9488" />
          <stop offset="55%" stopColor="#2dd4bf" />
          <stop offset="100%" stopColor="#5eead4" />
        </linearGradient>
        <radialGradient id="rr-core" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(94,234,212,0.16)" />
          <stop offset="100%" stopColor="rgba(94,234,212,0)" />
        </radialGradient>
      </defs>
      <circle cx={CX} cy={CY} r={66} fill="url(#rr-core)" />
      {/* track */}
      <path d={`M ${sx} ${sy} A ${R} ${R} 0 1 1 ${ex2} ${ey2}`} fill="none" stroke={dark ? "rgba(255,255,255,0.08)" : "#eef4f2"} strokeWidth="6" strokeLinecap="round" />
      {/* ticks */}
      {ticks.map((t, i) => (
        <line key={i} x1={t.inner[0]} y1={t.inner[1]} x2={t.outer[0]} y2={t.outer[1]} stroke={t.major ? (dark ? "rgba(94,234,212,0.5)" : "rgba(13,148,136,0.45)") : (dark ? "rgba(255,255,255,0.12)" : "rgba(15,76,71,0.14)")} strokeWidth={t.major ? 1.6 : 1} />
      ))}
      {/* value arc */}
      {sweep > 0 && <path d={`M ${sx} ${sy} A ${R} ${R} 0 ${large} 1 ${ex} ${ey}`} fill="none" stroke="url(#rr-arc)" strokeWidth="6" strokeLinecap="round" />}
      {/* needle dot */}
      <circle cx={ex} cy={ey} r="5" fill="#5eead4" style={{ filter: "drop-shadow(0 0 6px #5eead4)" }} />
      {/* center readout */}
      <text x={CX} y={CY - 2} textAnchor="middle" fill={teal.ink} style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 40, fontWeight: 800, letterSpacing: -1 }}>{value === null || value === undefined ? "—" : Math.round(sweep)}</text>
      {value !== null && value !== undefined && <text x={CX + 42} y={CY - 18} textAnchor="middle" fill={teal.mute} style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 16, fontWeight: 600 }}>%</text>}
      <text x={CX} y={CY + 22} textAnchor="middle" fill={teal.mute} style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: 2 }}>RESOLVED</text>
    </svg>
  );
}

/* ─── UNDP / CMU oversight dashboard — donor/coordinator view focused on after-sales service.
   Teal-monochrome palette, provider performance, critical issues, 6-month trend. ─── */
function UndpCmuDashboard({ hospitals, groups, complaints, siteNotes, onViewSite, pkBoundary, pinColor, scoped, funcCount, openTickets, sevCounts, resolvedThisMonth, resolutionRate, raisedThisMonth, stageCounts, closedAll }) {
  const T = { ink: "#12211f", slate: "#5a6b68", mute: "#94a3a0", line: "#e7edec", card: "#fff", teal900: "#0f4c47", teal700: "#0f766e", teal500: "#0d9488", teal300: "#5eead4", teal100: "#ccfbf1", teal50: "#f0fdfa" };
  const [hoverMonth, setHoverMonth] = useState(null);
  const [slide, setSlide] = useState(0); // 0 = Map, 1 = Program Overview
  const touchX = useRef(null);

  // Priority issues: any High or Critical severity ticket still open after more than 10 days.
  const sevRank = { Critical: 0, High: 1, Low: 2 };
  const criticalIssues = openTickets
    .map(c => ({ ...c, sev: c.severity || getDefaultSeverity(c.title), days: c.created_at ? Math.max(0, Math.floor((Date.now() - new Date(c.created_at)) / (1000 * 60 * 60 * 24))) : 0 }))
    .filter(c => (c.sev === "Critical" || c.sev === "High") && c.days > 10)
    .sort((a, b) => (sevRank[a.sev] - sevRank[b.sev]) || (b.days - a.days));

  // Provider performance — all-time
  const providerRows = ["Novair", "Intexim", "Z-Corps"].map(prov => {
    const provSites = hospitals.filter(h => getProvider(h) === prov);
    const provComplaints = scoped.filter(c => getProvider(c.hospital) === prov);
    const open = provComplaints.filter(c => !isClosedStatus(c.status)).length;
    const closed = provComplaints.filter(c => isClosedStatus(c.status)).length;
    const total = provComplaints.length;
    const rate = total > 0 ? Math.round(closed / total * 100) : null;
    return { prov, siteCount: provSites.length, open, closed, total, rate };
  }).filter(r => r.siteCount > 0);
  const provColors = { Novair: "#0f766e", Intexim: "#7c5cbf", "Z-Corps": "#2f9e58" };

  // 12-month trend. Build the month buckets from a fixed anchor (1st of current month)
  // to avoid the setMonth day-overflow bug (e.g. Aug 31 minus 6 months skipping/duplicating
  // months that have fewer days). Each bucket is keyed by absolute year+month index.
  const now = new Date();
  const months = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ label: d.toLocaleString("en-US", { month: "short" }), year: d.getFullYear(), month: d.getMonth() });
  }
  const trend = months.map(m => {
    const inMonth = (dateStr) => { if (!dateStr) return false; const d = new Date(dateStr); return d.getMonth() === m.month && d.getFullYear() === m.year; };
    const opened = scoped.filter(c => inMonth(c.created_at)).length;
    const resolved = scoped.filter(c => isClosedStatus(c.status) && inMonth(c.resolved_at)).length;
    return { ...m, opened, resolved };
  });
  const trendMax = Math.max(1, ...trend.map(t => Math.max(t.opened, t.resolved)));

  const sevColor = (sev) => sev === "Critical" ? "#c0392b" : sev === "High" ? "#d9822b" : "#94a3a0";

  const cardBase = { background: T.card, borderRadius: 16, border: `1px solid ${T.line}`, boxShadow: "0 1px 2px rgba(15,76,71,0.04)", overflow: "hidden", position: "relative" };
  const accentBar = { position: "absolute", top: 0, left: 22, right: 22, height: 3, borderRadius: "0 0 3px 3px", background: `linear-gradient(90deg, ${T.teal700}, ${T.teal300})` };
  const cardHeader = { padding: "16px 20px 12px", borderBottom: `1px solid ${T.line}` };
  const cardTitle = { fontSize: 13.5, fontWeight: 800, letterSpacing: -0.2, color: T.ink };

  const gradHeading = { fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", textAlign: "center", background: "linear-gradient(135deg, #5eead4, #ccfbf1)", WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent", color: "transparent" };
  const SEV = { Critical: "#f08a86", High: "#f0b968", Low: "#c4d0cd" };
  const darkCard = { background: "linear-gradient(180deg, #0b3b38 0%, #0f5650 55%, #0f766e 100%)", borderRadius: 16, border: "1px solid rgba(94,234,212,0.14)", boxShadow: "0 6px 22px rgba(11,59,56,0.28)", overflow: "hidden", position: "relative" };
  const darkAccent = { position: "absolute", top: 0, left: 20, right: 20, height: 3, borderRadius: "0 0 3px 3px", background: "linear-gradient(135deg, #0d9488, #2dd4a8, #5eead4)" };

  return (
    <div style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      {/* ── Stat tiles ── */}
      <div className="ox-stagger" style={{ display: "grid", gridTemplateColumns: "1fr 1.7fr 1fr", gap: 14, marginBottom: 20, alignItems: "stretch" }}>
        {/* Sites Functional */}
        <div style={{ ...darkCard, padding: "12px 16px", display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={darkAccent} />
          <div style={{ ...gradHeading, height: 13, marginBottom: 12 }}>Sites Functional</div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: "rgba(94,234,212,0.14)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#5eead4" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18M6 21V8l6-4 6 4v13"/><path d="M10 21v-5h4v5"/><circle cx="12" cy="10" r="1.5"/></svg>
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1, color: "#ffffff" }}>{funcCount}<span style={{ fontSize: 14, fontWeight: 500, color: "rgba(255,255,255,0.55)", marginLeft: 3 }}>/ {hospitals.length}</span></div>
          </div>
        </div>

        {/* Tickets Overview (wide) */}
        <div style={{ ...darkCard, padding: "12px 16px", display: "flex", flexDirection: "column" }}>
          <div style={darkAccent} />
          <div style={{ ...gradHeading, height: 13, marginBottom: 12 }}>Tickets Overview</div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flex: 1 }}>
            {/* Open Now */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
              <div style={{ fontSize: 25, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1, color: "#ffffff" }}>{openTickets.length}</div>
              <div style={{ fontSize: 8.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginTop: 5, color: "rgba(255,255,255,0.6)", textAlign: "center" }}>Open Now</div>
            </div>
            <div style={{ width: 1, alignSelf: "stretch", background: "rgba(255,255,255,0.12)", margin: "4px 0" }} />
            {/* Severity — plain colored text */}
            <div style={{ flex: 1.5, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
              <div style={{ fontSize: 8.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "rgba(255,255,255,0.6)", marginBottom: 8 }}>By Severity</div>
              <div style={{ display: "flex", gap: 14 }}>
                {[{ n: sevCounts.Critical, l: "Critical", c: SEV.Critical }, { n: sevCounts.High, l: "High", c: SEV.High }, { n: sevCounts.Low, l: "Low", c: SEV.Low }].map(x => (
                  <div key={x.l} style={{ textAlign: "center", minWidth: 38 }}>
                    <div style={{ fontSize: 18, fontWeight: 800, lineHeight: 1, color: x.c }}>{x.n}</div>
                    <div style={{ marginTop: 4, fontSize: 8.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: x.c }}>{x.l}</div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ width: 1, alignSelf: "stretch", background: "rgba(255,255,255,0.12)", margin: "4px 0" }} />
            {/* Resolved this month */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
              <div style={{ fontSize: 25, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1, color: "#ffffff" }}>{resolvedThisMonth.length}</div>
              <div style={{ fontSize: 8.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginTop: 5, color: "rgba(255,255,255,0.6)", textAlign: "center", lineHeight: 1.3 }}>Resolved<br />This Month</div>
            </div>
          </div>
        </div>

        {/* Resolution Rate */}
        <div style={{ ...darkCard, padding: "12px 16px 10px", display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={darkAccent} />
          <div style={{ ...gradHeading, height: 13, marginBottom: 4 }}>Resolution Rate</div>
          <Speedometer value={resolutionRate} teal={{ ink: "#ffffff", mute: "rgba(255,255,255,0.6)" }} dark />
          <div style={{ textAlign: "center", fontSize: 10, color: "rgba(255,255,255,0.7)", fontWeight: 600, marginTop: 0 }}><b style={{ color: "#5eead4" }}>{closedAll}</b> closed of <b style={{ color: "#5eead4" }}>{scoped.length}</b> total</div>
        </div>
      </div>

      {/* ── Full-width tablet: map + program overview, swipeable ── */}
      <div className="ox-in ox-in-d1" style={{ marginBottom: 20 }}>
        {/* device body — dark, big radius, even bezel all round like an iPad */}
        <div style={{ borderRadius: 34, height: 476, background: "linear-gradient(145deg, #14524b, #0c3d38 60%, #0a332f)", position: "relative", padding: 18, boxShadow: "0 22px 50px rgba(11,59,56,0.38), inset 0 1px 1px rgba(255,255,255,0.14), inset 0 -2px 4px rgba(0,0,0,0.35)" }}>
          {/* glossy top-edge highlight along the device */}
          <div style={{ position: "absolute", top: 0, left: "12%", right: "12%", height: 34, borderRadius: "34px 34px 60% 60%", background: "linear-gradient(180deg, rgba(255,255,255,0.14), rgba(255,255,255,0))", pointerEvents: "none" }} />
          {/* front camera dot */}
          <div style={{ position: "absolute", top: 8, left: "50%", transform: "translateX(-50%)", width: 5, height: 5, borderRadius: "50%", background: "rgba(255,255,255,0.28)", boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.4)", zIndex: 10 }} />
          {/* screen — inset, rounded, recessed */}
          <div
            style={{ width: "100%", height: "100%", borderRadius: 20, overflow: "hidden", background: "#dfeae8", position: "relative", boxShadow: "inset 0 0 0 2px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.06)" }}
            onTouchStart={e => { touchX.current = e.touches[0].clientX; }}
            onTouchMove={e => { if (touchX.current === null) return; }}
            onTouchEnd={e => { if (touchX.current === null) return; const dx = e.changedTouches[0].clientX - touchX.current; if (dx < -45 && slide === 0) setSlide(1); else if (dx > 45 && slide === 1) setSlide(0); touchX.current = null; }}
          >
            {/* slide track */}
            <div style={{ display: "flex", width: "200%", height: "100%", transform: `translate3d(-${slide * 50}%, 0, 0)`, transition: "transform 0.6s cubic-bezier(0.65, 0, 0.35, 1)", willChange: "transform" }}>
              {/* ── Panel 1: Map ── */}
              <div style={{ width: "50%", height: "100%", position: "relative", contain: "paint" }}>
                <MapContainer center={[30.0, 70.0]} zoom={5} style={{ height: "100%", width: "100%" }} scrollWheelZoom={false}>
                  <TileLayer url="https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png" attribution='&copy; <a href="https://stadiamaps.com/">Stadia Maps</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' />
                  {pkBoundary && <GeoJSON data={pkBoundary} style={{ color: T.teal500, weight: 1.5, fillColor: T.teal100, fillOpacity: 0.15 }} />}
                  {hospitals.map(h => { const c = SITE_COORDS[h]; if (!c) return null; const s = getSiteDisplayStatus(h, complaints, siteNotes); const openCount = complaints.filter(x => hospitalMatches(x.hospital, h) && !isClosedStatus(x.status)).length; const imgSrc = SITE_CODES[h] ? `/sites/${SITE_CODES[h]}.jpg` : null; const sc = s === "Shut Down" ? "#dc2626" : s === "Non Functional" ? "#868e96" : s === "Functional" ? "#d97706" : "#16a34a"; return (<Marker key={h} position={c} icon={makePinIcon(pinColor(h))}><Popup minWidth={340} maxWidth={340} className="site-popup"><div style={{ fontFamily: "'DM Sans',sans-serif", margin: -1, display: "flex", flexDirection: "row", alignItems: "stretch", border: "1.5px solid #e2e8f0", borderRadius: 16, background: "#fff", boxShadow: "0 6px 20px rgba(15,118,110,0.14)", padding: 12, gap: 12 }}>
                    {/* image column — fixed square, does not stretch */}
                    <div style={{ flexShrink: 0, width: 96, height: 96, alignSelf: "center", borderRadius: 12, overflow: "hidden", background: "linear-gradient(135deg, #0b3b38, #0f766e)", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
                      {imgSrc ? (
                        <img src={imgSrc} alt={fullHospitalName(h)} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} onError={e => { e.target.style.display = "none"; if (e.target.nextSibling) e.target.nextSibling.style.display = "block"; }} />
                      ) : null}
                      <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="rgba(94,234,212,0.5)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: imgSrc ? "none" : "block" }}><path d="M12 2l8.66 5v10L12 22l-8.66-5V7z"/><circle cx="12" cy="12" r="3.5"/></svg>
                    </div>
                    {/* right: info + button */}
                    <div style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1, gap: 5 }}>
                      <div style={{ fontWeight: 800, fontSize: 13, color: "#0f172a", lineHeight: 1.25, letterSpacing: -0.2 }}>{fullHospitalName(h)}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: sc, flexShrink: 0 }} /><span style={{ fontSize: 11.5, fontWeight: 700, color: sc }}>{s}</span></div>
                      <div style={{ fontSize: 11.5, color: "#64748b" }}>Service Provider: <span style={{ fontWeight: 700, color: "#0f766e" }}>{getProvider(h)}</span></div>
                      <div style={{ fontSize: 11.5, fontWeight: 600, color: sc, display: "flex", alignItems: "center", gap: 5 }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
                        {openCount > 0 ? `${openCount} open ticket${openCount > 1 ? "s" : ""}` : "No open tickets"}
                      </div>
                      <button onClick={() => onViewSite(h)} style={{ marginTop: 4, fontSize: 11, fontWeight: 700, color: "#fff", background: "linear-gradient(135deg, #0d9488, #0f766e)", border: "none", borderRadius: 9, padding: "8px 0", cursor: "pointer", width: "100%", letterSpacing: 0.2, boxShadow: "0 2px 8px rgba(13,148,136,0.25)" }}>View Ticket Data →</button>
                    </div>
                  </div></Popup><Tooltip direction="top" offset={[0, -10]}>{displayName(h)}</Tooltip></Marker>); })}
                </MapContainer>
              </div>
              {/* ── Panel 2: Program Overview ── */}
              <div style={{ width: "50%", height: "100%", position: "relative", background: "#fff", overflowY: "auto" }}>
                <div style={{ padding: "26px 40px", height: "100%", display: "flex", flexDirection: "column" }}>
                  {/* headline */}
                  <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
                    <div style={{ width: 52, height: 52, borderRadius: 14, background: T.teal50, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={T.teal700} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 20h20M4 20V10l4-2v12M8 20V6l6-3v17M14 20v-9l6 2v7"/></svg>
                    </div>
                    <div>
                      <div style={{ fontSize: 24, fontWeight: 800, color: T.ink, lineHeight: 1, letterSpacing: "-0.02em" }}>36 PSA Oxygen Plants</div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: T.mute, marginTop: 4 }}>Funded by the Global Fund</div>
                    </div>
                  </div>
                  {/* 2x2 grid of points */}
                  <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignContent: "center" }}>
                    {[
                      { icon: (<><path d="M12 22s-8-4.5-8-11.8A8 8 0 0 1 20 10.2C20 17.5 12 22 12 22z"/><circle cx="12" cy="10" r="2.5"/></>), title: "Decentralized access", text: <>Installed at <b style={{ color: T.ink }}>District & Tehsil hospitals</b> to ease pressure on major-city tertiary care.</> },
                      { icon: (<><path d="M12 2v6M12 8l3.5 3.5M12 8L8.5 11.5"/><circle cx="12" cy="16" r="6"/></>), title: "On-site generation", text: <>Medical-grade oxygen via Pressure Swing Adsorption — a <b style={{ color: T.ink }}>dual-unit (duplex) system, 37.5 Nm³/h per unit</b>.</> },
                      { icon: (<><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M8 4v6M13 4v6M18 4v6"/></>), title: "Bedside delivery", text: <>Piped oxygen supply to <b style={{ color: T.ink }}>50 bed-head panels</b> in every hospital.</> },
                      { icon: (<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/></>), title: "Local ownership", text: <>Staff trained and plants <b style={{ color: T.ink }}>handed to hospital management</b> for day-to-day operations.</> },
                    ].map((p, i) => (
                      <div key={i} style={{ background: T.teal50, borderRadius: 14, padding: "18px 18px", border: `1px solid ${T.line}` }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 8 }}>
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={T.teal600 || T.teal500} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>{p.icon}</svg>
                          <div style={{ fontSize: 13.5, fontWeight: 800, color: T.teal700, letterSpacing: "-0.01em" }}>{p.title}</div>
                        </div>
                        <div style={{ fontSize: 12.5, color: T.slate, lineHeight: 1.5 }}>{p.text}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
          {/* dots — floating page indicators at the bottom of the screen */}
          <div style={{ position: "absolute", bottom: 30, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 8, alignItems: "center", zIndex: 10, background: "rgba(6,32,29,0.55)", backdropFilter: "blur(4px)", padding: "7px 12px", borderRadius: 20 }}>
            {["Map", "Program Overview"].map((label, i) => (
              <button key={i} onClick={() => setSlide(i)} title={label} style={{ border: "none", cursor: "pointer", padding: 0, background: "transparent", display: "flex", alignItems: "center" }}>
                <span style={{ width: slide === i ? 22 : 8, height: 8, borderRadius: 5, background: slide === i ? "#5eead4" : "rgba(255,255,255,0.4)", transition: "all 0.35s cubic-bezier(0.16,1,0.3,1)", boxShadow: slide === i ? "0 0 8px rgba(94,234,212,0.6)" : "none" }} />
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Provider performance + Critical issues ── */}
      <div className="ox-in ox-in-d2" style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 14, marginBottom: 20 }}>
        <div style={cardBase}>
          <div style={{ ...accentBar, background: "linear-gradient(90deg, #0f766e, #14b8a6)", opacity: 0.75 }} />
          <div style={cardHeader}><h3 style={cardTitle}>Service Provider Performance</h3></div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Provider", "Sites", "Open", "Closed", "Resolution"].map((th, i) => (
                  <th key={th} style={{ fontSize: 9.5, fontWeight: 700, color: T.mute, textTransform: "uppercase", letterSpacing: "0.08em", padding: "14px 18px 10px", textAlign: i === 0 ? "left" : "center", borderBottom: `1px solid ${T.line}` }}>{th}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {providerRows.map((r, i) => (
                <tr key={r.prov} style={{ borderBottom: i < providerRows.length - 1 ? `1px solid #f5f8f7` : "none" }}>
                  <td style={{ padding: "16px 18px", textAlign: "left" }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>{r.prov}</span>
                  </td>
                  <td style={{ padding: "16px 18px", textAlign: "center", fontSize: 13, fontWeight: 600, color: T.slate }}>{r.siteCount}</td>
                  <td style={{ padding: "16px 18px", textAlign: "center", fontSize: 13, fontWeight: 700, color: r.open > 0 ? "#d9822b" : T.mute }}>{r.open}</td>
                  <td style={{ padding: "16px 18px", textAlign: "center", fontSize: 13, fontWeight: 700, color: T.slate }}>{r.closed}</td>
                  <td style={{ padding: "16px 18px", textAlign: "center", fontSize: 15, fontWeight: 800, color: r.rate === null ? T.mute : T.teal600 || T.teal500, letterSpacing: "-0.02em" }}>{r.rate === null ? "—" : `${r.rate}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={cardBase}>
          <div style={accentBar} />
          <div style={cardHeader}><h3 style={cardTitle}>Priority Issues</h3></div>
          <div style={{ maxHeight: 360, overflowY: "auto" }}>
            {criticalIssues.length > 0 ? criticalIssues.map(c => (
              <div key={c.id} onClick={() => onViewSite(c.hospital)} style={{ padding: "13px 20px", display: "flex", alignItems: "center", gap: 11, borderBottom: `1px solid #f3f7f6`, cursor: "pointer" }} onMouseEnter={e => e.currentTarget.style.background = T.teal50} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                <div style={{ width: 3, alignSelf: "stretch", borderRadius: 2, flexShrink: 0, background: sevColor(c.sev) }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: T.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{displayName(c.hospital)}</div>
                  <div style={{ fontSize: 11, color: T.slate, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.title}</div>
                </div>
                <span style={{ fontSize: 10, fontWeight: 700, color: sevColor(c.sev), whiteSpace: "nowrap", flexShrink: 0 }}>{c.days}d open</span>
              </div>
            )) : <div style={{ padding: "32px 20px", textAlign: "center", color: T.mute, fontSize: 13 }}>No overdue high-priority issues</div>}
          </div>
        </div>
      </div>

      {/* ── 12-month trend ── */}
      <div className="ox-in ox-in-d3" style={darkCard}>
        <div style={darkAccent} />
        <div style={{ padding: "18px 20px 14px", borderBottom: "1px solid rgba(255,255,255,0.08)", textAlign: "center" }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, letterSpacing: 0.2, color: "#ffffff" }}>Tickets Opened <span style={{ color: "rgba(255,255,255,0.5)", fontWeight: 500, margin: "0 3px" }}>vs</span> Resolved</h3>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: "rgba(94,234,212,0.75)", textTransform: "uppercase", letterSpacing: "0.14em", marginTop: 6 }}>Last 12 Months</div>
        </div>
        <div style={{ padding: "28px 22px 12px", display: "flex", alignItems: "flex-end", height: 210, position: "relative" }}>
          {trend.map((m, mi) => {
            const isHover = hoverMonth === mi;
            return (
              <div key={`${m.year}-${m.month}`} onMouseEnter={() => setHoverMonth(mi)} onMouseLeave={() => setHoverMonth(null)} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, height: "100%", justifyContent: "flex-end", position: "relative", cursor: "default" }}>
                {/* Hover popup */}
                {isHover && (() => {
                  const edgeLeft = mi <= 1;
                  const edgeRight = mi >= trend.length - 2;
                  const popLeft = edgeLeft ? "0" : edgeRight ? "auto" : "50%";
                  const popRight = edgeRight ? "0" : "auto";
                  const popTransform = edgeLeft || edgeRight ? "none" : "translateX(-50%)";
                  const arrowLeft = edgeLeft ? "18px" : edgeRight ? "auto" : "50%";
                  const arrowRight = edgeRight ? "18px" : "auto";
                  const arrowTransform = edgeLeft || edgeRight ? "none" : "translateX(-50%)";
                  return (
                  <div style={{ position: "absolute", bottom: "calc(100% - 18px)", left: popLeft, right: popRight, transform: popTransform, background: "#06201d", border: "1px solid rgba(94,234,212,0.2)", borderRadius: 8, padding: "7px 10px", boxShadow: "0 4px 14px rgba(0,0,0,0.35)", zIndex: 20, whiteSpace: "nowrap", pointerEvents: "none" }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#fff", marginBottom: 4, textAlign: "center" }}>{m.label} {m.year}</div>
                    <div style={{ display: "flex", gap: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 7, height: 7, borderRadius: 2, background: "rgba(255,255,255,0.4)" }} /><span style={{ fontSize: 10.5, color: "#e7edec", fontWeight: 600 }}>{m.opened} opened</span></div>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 7, height: 7, borderRadius: 2, background: "#5eead4" }} /><span style={{ fontSize: 10.5, color: "#e7edec", fontWeight: 600 }}>{m.resolved} resolved</span></div>
                    </div>
                    <div style={{ position: "absolute", top: "100%", left: arrowLeft, right: arrowRight, transform: arrowTransform, width: 0, height: 0, borderLeft: "5px solid transparent", borderRight: "5px solid transparent", borderTop: "5px solid #06201d" }} />
                  </div>
                  );
                })()}
                <div style={{ display: "flex", gap: 3, alignItems: "flex-end", flex: 1, width: "100%", justifyContent: "center" }}>
                  <div className="ox-bar" style={{ width: 11, borderRadius: "3px 3px 0 0", minHeight: 2, height: `${m.opened / trendMax * 100}%`, background: isHover ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.28)", transition: "background 0.15s", animationDelay: `${mi * 0.04}s` }} />
                  <div className="ox-bar" style={{ width: 11, borderRadius: "3px 3px 0 0", minHeight: 2, height: `${m.resolved / trendMax * 100}%`, background: "#5eead4", boxShadow: isHover ? "0 0 12px rgba(94,234,212,0.7)" : "0 0 8px rgba(94,234,212,0.4)", transition: "box-shadow 0.15s", animationDelay: `${mi * 0.04 + 0.03}s` }} />
                </div>
                <span style={{ fontSize: 9.5, color: isHover ? "#5eead4" : "rgba(255,255,255,0.5)", fontWeight: isHover ? 700 : 600, transition: "color 0.15s" }}>{m.month === 0 ? `${m.label} '${String(m.year).slice(2)}` : m.label}</span>
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 22, justifyContent: "center", padding: "0 22px 18px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "rgba(255,255,255,0.7)", fontWeight: 600 }}><div style={{ width: 10, height: 10, borderRadius: 3, background: "rgba(255,255,255,0.28)" }} />Opened</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "rgba(255,255,255,0.7)", fontWeight: 600 }}><div style={{ width: 10, height: 10, borderRadius: 3, background: "#5eead4" }} />Resolved</div>
        </div>
      </div>
    </div>
  );
}

/* ─── Homepage: map + program pulse, shown to every non-hospital account.
   Overview (the older site-list view) remains available as its own separate tab. ─── */
function HomeTab({ hospitals, groups, complaints, siteNotes, onViewSite, user }) {
  const [pkBoundary, setPkBoundary] = useState(null);
  useEffect(() => {
    fetch("/pakistan-boundary.geojson")
      .then(r => r.json())
      .then(data => { if (data) setPkBoundary(data); })
      .catch(() => {});
  }, []);

  const funcCount = hospitals.filter(h => isFunctional(h, complaints, siteNotes)).length;
  const shutdownSites = hospitals.filter(h => getSiteDisplayStatus(h, complaints, siteNotes) === "Shut Down");
  const issueSites = hospitals.filter(h => getSiteDisplayStatus(h, complaints, siteNotes) === "Functional");

  const scoped = complaints.filter(c => hospitals.some(h => hospitalMatches(h, c.hospital)));
  const stageCounts = { "Open": 0, "Assigned": 0, "In Progress": 0, "Resolved": 0, "Verified": 0 };
  scoped.forEach(c => { const s = getEffectiveStatus(c); if (stageCounts[s] !== undefined) stageCounts[s]++; });

  const oneWeekAgo = new Date(); oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  const resolvedThisWeek = scoped
    .filter(c => isClosedStatus(c.status) && c.resolved_at && new Date(c.resolved_at) >= oneWeekAgo)
    .sort((a, b) => new Date(b.resolved_at) - new Date(a.resolved_at))
    .slice(0, 5);

  const attentionSites = [...shutdownSites, ...issueSites].slice(0, 6);

  const pinColor = (h) => {
    const s = getSiteDisplayStatus(h, complaints, siteNotes);
    if (s === "Shut Down") return "#e03131";
    if (s === "Functional") return "#f08c00";
    if (s === "Non Functional") return "#868e96";
    return "#2f9e44";
  };

  const providerEntries = Object.entries(groups || {}).filter(([, sites]) => sites.some(s => hospitals.includes(s)));
  const showProviderBreakdown = providerEntries.length > 1;

  const isUndpCmu = user && user.role === "company" && ["UNDP", "CMU"].includes(getCompanyName(user));

  const oneMonthAgo = new Date(); oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
  const resolvedThisMonth = scoped
    .filter(c => isClosedStatus(c.status) && c.resolved_at && new Date(c.resolved_at) >= oneMonthAgo)
    .sort((a, b) => new Date(b.resolved_at) - new Date(a.resolved_at));

  const openTickets = scoped.filter(c => !isClosedStatus(c.status));
  const sevCounts = { Critical: 0, High: 0, Low: 0 };
  openTickets.forEach(c => { const sev = c.severity || getDefaultSeverity(c.title); if (sevCounts[sev] !== undefined) sevCounts[sev]++; });

  // Resolution rate: resolved (last 30d) vs raised (last 30d)
  const raisedThisMonth = scoped.filter(c => c.created_at && new Date(c.created_at) >= oneMonthAgo);
  // Resolution rate = closed (resolved + verified) / total tickets ever raised, all-time.
  const closedAll = scoped.filter(c => isClosedStatus(c.status)).length;
  const resolutionRate = scoped.length > 0 ? Math.round(closedAll / scoped.length * 100) : null;

  if (isUndpCmu) {
    return <UndpCmuDashboard hospitals={hospitals} groups={groups} complaints={complaints} siteNotes={siteNotes} onViewSite={onViewSite} pkBoundary={pkBoundary} pinColor={pinColor} scoped={scoped} funcCount={funcCount} openTickets={openTickets} sevCounts={sevCounts} resolvedThisMonth={resolvedThisMonth} resolutionRate={resolutionRate} raisedThisMonth={raisedThisMonth} stageCounts={stageCounts} closedAll={closedAll} />;
  }

  return (
    <div style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <div className="ox-stagger" style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 14, marginBottom: 26 }}>
        {[
          { label: "Operational", value: funcCount, sub: `/ ${hospitals.length}`, tag: `${hospitals.length > 0 ? Math.round(funcCount / hospitals.length * 100) : 0}% uptime`, tagType: "green", gradient: "linear-gradient(90deg, #0f766e, #2dd4a8)" },
          { label: "Open tickets", value: scoped.filter(c => !isClosedStatus(c.status)).length, tag: shutdownSites.length > 0 ? `${shutdownSites.length} critical` : null, tagType: "red", gradient: "linear-gradient(90deg, #d97706, #f59e0b)" },
          { label: "Resolved this week", value: resolvedThisWeek.length, tag: "Last 7 days", tagType: "green", gradient: "linear-gradient(90deg, #16a34a, #22c55e)" },
          { label: "Attention needed", value: attentionSites.length, tag: issueSites.length > 0 ? `${issueSites.length} with issues` : null, tagType: "amber", gradient: "linear-gradient(90deg, #dc2626, #ef4444)" },
        ].map((card, i) => (
          <div key={i} className="ox-sheen" style={{ background: "#fff", borderRadius: 16, padding: "22px", border: "1px solid #e8ecf0", position: "relative", overflow: "hidden", boxShadow: "0 1px 3px rgba(15,23,42,0.05)", transition: "all 0.28s cubic-bezier(0.16,1,0.3,1)" }} onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 12px 30px rgba(15,118,110,0.12)"; e.currentTarget.style.transform = "translateY(-3px)"; }} onMouseLeave={e => { e.currentTarget.style.boxShadow = "0 1px 3px rgba(15,23,42,0.05)"; e.currentTarget.style.transform = "none"; }}>
            <div style={{ position: "absolute", top: 0, left: 20, right: 20, height: 3, borderRadius: "0 0 3px 3px", background: card.gradient }} />
            <div style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>{card.label}</div>
            <div style={{ fontSize: 32, fontWeight: 800, color: "#0f172a", letterSpacing: "-0.03em", lineHeight: 1 }}>
              {card.value}{card.sub && <span style={{ fontSize: 16, fontWeight: 500, color: "#cbd5e1", marginLeft: 4 }}>{card.sub}</span>}
            </div>
            {card.tag && (
              <div style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 600, marginTop: 10, padding: "4px 12px", borderRadius: 20, background: card.tagType === "green" ? "#ecfdf5" : card.tagType === "red" ? "#fef2f2" : "#fffbeb", color: card.tagType === "green" ? "#16a34a" : card.tagType === "red" ? "#dc2626" : "#d97706" }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: "currentColor" }} />{card.tag}
              </div>
            )}
          </div>
        ))}
      </div>
      {/* Map + Mint-tinted Side Panel */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 14, marginBottom: 24 }}>
        <div style={{ borderRadius: 16, overflow: "hidden", border: "1px solid #e8ecf0", boxShadow: "0 1px 3px rgba(15,23,42,0.05)", height: 400, position: "relative", background: "#fff" }}>
          <MapContainer center={[30.0, 70.0]} zoom={5} style={{ height: "100%", width: "100%" }} scrollWheelZoom={false}>
            <TileLayer url="https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png" attribution='&copy; <a href="https://stadiamaps.com/">Stadia Maps</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' />
            {pkBoundary && <GeoJSON data={pkBoundary} style={{ color: C.teal, weight: 1.5, fillColor: C.tealLight, fillOpacity: 0.15 }} />}
            {hospitals.map(h => { const c = SITE_COORDS[h]; if (!c) return null; const s = getSiteDisplayStatus(h, complaints, siteNotes); const openCount = complaints.filter(x => hospitalMatches(x.hospital, h) && !isClosedStatus(x.status)).length; const imgSrc = SITE_CODES[h] ? `/sites/${SITE_CODES[h]}.jpg` : null; return (<Marker key={h} position={c} icon={makePinIcon(pinColor(h))}><Popup minWidth={330} maxWidth={370} className="site-popup"><div style={{ fontFamily: "'DM Sans',sans-serif", margin: -1, display: "flex", flexDirection: "row", border: "1.5px solid #e2e8f0", borderRadius: 14, overflow: "hidden", background: "#fff", boxShadow: "0 2px 12px rgba(15,118,110,0.08)" }}>
              {imgSrc && <div style={{ width: 115, flexShrink: 0, position: "relative" }}><img src={imgSrc} alt={h} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", minHeight: 130 }} onError={e => { e.target.parentElement.style.display = "none"; }} /><div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, transparent 60%, rgba(255,255,255,0.15) 100%)" }} /></div>}
              <div style={{ padding: "12px 16px 14px", display: "flex", flexDirection: "column", justifyContent: "center", gap: 6, flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 14, color: "#0f172a", lineHeight: 1.2, letterSpacing: -0.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{displayName(h)}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: s === "Shut Down" ? "#dc2626" : s === "Non Functional" ? "#868e96" : s === "Functional" ? "#f08c00" : "#16a34a", boxShadow: `0 0 5px ${s === "Shut Down" ? "rgba(220,38,38,0.4)" : s === "Non Functional" ? "rgba(134,142,150,0.3)" : s === "Functional" ? "rgba(240,140,0,0.3)" : "rgba(22,163,74,0.3)"}` }} /><span style={{ fontSize: 11.5, fontWeight: 600, color: s === "Shut Down" ? "#dc2626" : s === "Non Functional" ? "#868e96" : s === "Functional" ? "#d97706" : "#16a34a" }}>{s}</span></div>
                <div style={{ fontSize: 11.5, color: "#64748b", lineHeight: 1.3 }}>Service Provider: <span style={{ fontWeight: 700, color: "#0f766e" }}>{getProvider(h)}</span></div>
                <div style={{ fontSize: 11.5, fontWeight: 600, color: openCount > 0 ? "#dc2626" : "#16a34a", display: "flex", alignItems: "center", gap: 5 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
                  {openCount > 0 ? `Open Tickets (${openCount})` : "No open tickets"}
                </div>
                <button onClick={() => onViewSite(h)} style={{ marginTop: 2, fontSize: 11.5, fontWeight: 700, color: "#fff", background: "linear-gradient(135deg, #0d9488, #0f766e)", border: "none", borderRadius: 8, padding: "7px 0", cursor: "pointer", width: "100%", letterSpacing: 0.2, boxShadow: "0 2px 8px rgba(13,148,136,0.25)" }}>View Details →</button>
              </div>
            </div></Popup><Tooltip direction="top" offset={[0, -10]}>{displayName(h)}</Tooltip></Marker>); })}
          </MapContainer>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ background: "linear-gradient(135deg, #f0fdfa, #f7fdfb)", border: "1px solid #d5f0ea", borderRadius: 16, padding: "18px 18px 14px", flex: 1, overflowY: "auto" }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", color: "#0f766e", textTransform: "uppercase", marginBottom: 12 }}>Needs attention</div>
            {attentionSites.length > 0 ? attentionSites.map(h => { const s = getSiteDisplayStatus(h, complaints, siteNotes); const isDown = s === "Shut Down"; const isNonFunc = s === "Non Functional"; const dotColor = isDown ? "#c0392b" : isNonFunc ? "#868e96" : "#d9822b"; return (
              <div key={h} onClick={() => onViewSite(h)} style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 10, marginBottom: 2, transition: "background 0.15s" }} onMouseEnter={e => e.currentTarget.style.background = "rgba(13,148,136,0.06)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor, flexShrink: 0, boxShadow: `0 0 6px ${dotColor}` }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: "#0f172a", flex: 1 }}>{h}</span>
                <span style={{ fontSize: 11, color: "#94a3b8" }}>{s}</span>
              </div>); }) : <div style={{ fontSize: 13, color: "#94a3b8", padding: "12px 0" }}>All sites operational</div>}
          </div>
          <div style={{ background: "linear-gradient(135deg, #f0fdfa, #f7fdfb)", border: "1px solid #d5f0ea", borderRadius: 16, padding: "18px" }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", color: "#0f766e", textTransform: "uppercase", marginBottom: 12 }}>Ticket pipeline</div>
            {scoped.length > 0 ? (<><div style={{ display: "flex", height: 7, borderRadius: 4, overflow: "hidden", background: "#e8ecf0", marginBottom: 12 }}>{STAGE_META.filter(s => stageCounts[s.key] > 0).map(s => (<div key={s.key} style={{ flex: `${stageCounts[s.key]} 0 0%`, background: s.color }} />))}</div><div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{STAGE_META.map(s => (<span key={s.key} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: "#64748b", padding: "4px 10px", background: "#f1f5f9", borderRadius: 8 }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: s.color }} /><strong style={{ color: "#0f172a" }}>{stageCounts[s.key]}</strong> {statusLabel(s.key)}</span>))}</div></>) : <div style={{ fontSize: 13, color: "#94a3b8" }}>No tickets yet</div>}
          </div>
        </div>
      </div>
      {/* Dark bottom strip (ZeBeyond case-study pattern) */}
      <div style={{ background: "#0e1013", margin: "0 -32px", padding: "28px 32px", borderRadius: "24px 24px 0 0" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          {showProviderBreakdown && (<div style={{ background: "#161a1e", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: "20px" }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", marginBottom: 16 }}>By service provider</div>
            {(() => { const rows = providerEntries.map(([provider, sites]) => { const providerSites = sites.filter(s => hospitals.includes(s)); const openCount = complaints.filter(c => providerSites.includes(c.hospital) && !isClosedStatus(c.status)).length; return { provider, siteCount: providerSites.length, openCount }; }); const maxSites = Math.max(1, ...rows.map(r => r.siteCount)); return rows.map(r => (<div key={r.provider} style={{ marginBottom: 16 }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}><span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{r.provider}</span><div style={{ display: "flex", gap: 8 }}><span style={{ fontSize: 12, color: "#6b7280" }}>{r.siteCount} sites</span>{r.openCount > 0 && <span style={{ fontSize: 12, fontWeight: 600, color: "#f59e0b" }}>{r.openCount} open</span>}</div></div><div style={{ height: 5, borderRadius: 3, background: "rgba(255,255,255,0.06)" }}><div style={{ height: "100%", width: `${(r.siteCount / maxSites) * 100}%`, borderRadius: 3, background: "linear-gradient(90deg, #0f766e, #2dd4a8)", boxShadow: "0 0 10px rgba(45,212,168,0.25)", transition: "width 0.4s ease" }} /></div></div>)); })()}
          </div>)}
          <div style={{ background: "#161a1e", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: "20px" }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", marginBottom: 16 }}>Recent activity</div>
            {resolvedThisWeek.length > 0 ? resolvedThisWeek.map((c, i) => (<div key={c.id} onClick={() => onViewSite(c.hospital)} style={{ cursor: "pointer", display: "flex", alignItems: "flex-start", gap: 12, padding: "8px 10px", borderRadius: 10, marginBottom: 2, transition: "background 0.15s" }} onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.03)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}><span style={{ width: 10, height: 10, borderRadius: "50%", background: "#22c55e", display: "block", boxShadow: "0 0 6px rgba(34,197,94,0.4)", marginTop: 4, flexShrink: 0 }} /><div><div style={{ fontSize: 13, fontWeight: 600, color: "#e8eaed" }}>{c.title}</div><div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{c.hospital} · {c.resolved_at ? new Date(c.resolved_at).toLocaleDateString() : ""}</div></div></div>)) : <div style={{ fontSize: 13, color: "#6b7280", padding: "12px 0" }}>No recent resolutions</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

function OverviewTab({ hospitals, complaints, siteNotes, notifEmails, isAdmin, onRefresh, onViewSite }) {
  const [editingNote, setEditingNote] = useState(null);
  const [noteText, setNoteText] = useState(""); const [saving, setSaving] = useState(false);
  const [statusEditing, setStatusEditing] = useState(null);
  const [sendingShutdown, setSendingShutdown] = useState(null);

  const getNotesMap = h => { try { const raw = siteNotes.find(s => hospitalMatches(s.hospital, h))?.equipment_note || ""; const parsed = JSON.parse(raw); return typeof parsed === "object" && parsed !== null ? parsed : { _legacy: raw }; } catch { const raw = siteNotes.find(s => hospitalMatches(s.hospital, h))?.equipment_note || ""; return raw ? { _legacy: raw } : {}; } };
  const getNoteForComplaint = (h, cid) => { const m = getNotesMap(h); return m[cid] || m._legacy || ""; };
  const openComplaints = h => complaints.filter(c => hospitalMatches(c.hospital, h) && !isClosedStatus(c.status));
  const allOpen = hospitals.reduce((sum, h) => sum + openComplaints(h).length, 0);
  const funcCount = hospitals.filter(h => isFunctional(h, complaints, siteNotes)).length;
  const nonFuncCount = hospitals.length - funcCount;

  const shutdownSites = hospitals.filter(h => getSiteDisplayStatus(h, complaints, siteNotes) === "Shut Down");

  // Sort order: Shut Down first, then Functional-with-open-tickets (by severity),
  // then Fully Functional (no tickets), then Non Functional last.
  const SEVERITY_RANK = { "Critical": 0, "High": 1, "Low": 2 };
  const siteRank = (h) => {
    if (getSiteBaseStatus(h, siteNotes) === "Shut Down") return 0;
    const open = complaints.filter(c => hospitalMatches(c.hospital, h) && !isClosedStatus(c.status));
    if (open.length > 0) return 1 + (Math.min(...open.map(c => SEVERITY_RANK[c.severity] ?? 2)) * 0.01);
    if (getSiteBaseStatus(h, siteNotes) === "Non Functional") return 3;
    return 2;
  };
  const sortedHospitals = [...hospitals].sort((a, b) => siteRank(a) - siteRank(b));

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
    <div style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: "#1a1d21", letterSpacing: "-0.01em" }}>Site Status</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: "#0f766e", background: "#e6f5f0", padding: "4px 12px", borderRadius: 20 }}>
            {funcCount} of {hospitals.length} Plants functional
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: allOpen > 0 ? "#b45309" : "#5f6b7a", background: allOpen > 0 ? "#fef3e2" : "#f4f4f0", padding: "4px 12px", borderRadius: 20 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: allOpen > 0 ? "#d97706" : "#94a3b8" }} />
            {allOpen} open ticket{allOpen === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      {/* Clean light table */}
      <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e5e5e0", overflow: "hidden" }}>
        {/* Header */}
        <div style={{ display: "flex", borderBottom: "1px solid #e5e5e0", background: "linear-gradient(120deg, #0b3b38 0%, #0f766e 50%, #0b3b38 100%)", minWidth: 900 }}>
          <div style={{ flex: "0 0 48px", padding: "14px 0", textAlign: "center", fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.85)", textTransform: "uppercase", letterSpacing: 0.8 }}>#</div>
          <div style={{ flex: "1 1 220px", padding: "14px 16px", fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.85)", textTransform: "uppercase", letterSpacing: 0.8, textAlign: "center" }}>Site Name</div>
          <div style={{ flex: "0 0 150px", padding: "14px 16px", fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.85)", textTransform: "uppercase", letterSpacing: 0.8, textAlign: "center" }}>Service Provider</div>
          <div style={{ flex: "0 0 160px", padding: "14px 16px", fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.85)", textTransform: "uppercase", letterSpacing: 0.8, textAlign: "center" }}>Status</div>
          <div style={{ flex: "1 1 200px", padding: "14px 16px", fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.85)", textTransform: "uppercase", letterSpacing: 0.8, textAlign: "center" }}>Open Tickets</div>
          <div style={{ flex: "1 1 280px", padding: "14px 16px", fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.85)", textTransform: "uppercase", letterSpacing: 0.8, textAlign: "center" }}>Equipment / Notes</div>
        </div>
        {/* Rows */}
        {sortedHospitals.map((h, i) => {
          const open = openComplaints(h);
          const siteStatus = getSiteDisplayStatus(h, complaints, siteNotes);
          return (
            <div key={h}>
              <div onClick={() => setExpandedRow(expandedRow === h ? null : h)} style={{ display: "flex", alignItems: "center", borderBottom: "1px solid transparent", borderImage: "linear-gradient(90deg, #0b3b38, #0f766e, #0b3b38) 1", cursor: "pointer", transition: "background 0.12s", minWidth: 900 }} onMouseEnter={e => e.currentTarget.style.background = "#fafaf7"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                <div style={{ flex: "0 0 48px", padding: "14px 0", textAlign: "center", fontSize: 12, fontWeight: 500, color: "#b0b5ba" }}>{i + 1}</div>
                <div style={{ flex: "1 1 220px", padding: "14px 16px", fontSize: 13.5, fontWeight: 600, color: "#1a1d21", textAlign: "center" }}>{displayName(h)}</div>
                <div style={{ flex: "0 0 150px", padding: "14px 16px", fontSize: 13, fontWeight: 400, color: "#5f6b7a", textAlign: "center" }}>{getProvider(h)}</div>
                <div style={{ flex: "0 0 160px", padding: "14px 16px", textAlign: "center" }}>
                  {(() => {
                    const statusMeta = {
                      "Fully Functional": { label: "Fully Functional", color: "#16a34a", dot: "#16a34a" },
                      "Functional": { label: "Functional", color: "#b7920a", dot: "#b7920a" },
                      "Issues": { label: "Functional", color: "#b7920a", dot: "#b7920a" },
                      "Non Functional": { label: "Non Functional", color: "#64748b", dot: "#94a3b8" },
                      "Shut Down": { label: "Shut Down", color: "#7f1d1d", dot: "#7f1d1d" },
                    };
                    const m = statusMeta[siteStatus] || statusMeta["Non Functional"];
                    const badge = (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12.5, fontWeight: 600, color: m.color, whiteSpace: "nowrap" }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: m.dot, flexShrink: 0 }} />
                        {m.label}
                      </span>
                    );
                    if (isAdmin && statusEditing === h) {
                      return (<select style={{ fontSize: 12, padding: "4px 8px", borderRadius: 6, border: "1px solid #e5e5e0", background: "#fff", color: "#1a1d21" }} value={getSiteBaseStatus(h, siteNotes)} onChange={e => handleStatusChange(h, e.target.value)}>
                        <option value="Fully Functional">Fully Functional</option>
                        <option value="Non Functional">Non Functional</option>
                        <option value="Shut Down">Shut Down</option>
                      </select>);
                    }
                    if (isAdmin) return <div onClick={e => { e.stopPropagation(); setStatusEditing(h); }}>{badge}</div>;
                    return badge;
                  })()}
                </div>
                <div style={{ flex: "1 1 200px", padding: "14px 16px", textAlign: "center" }}>
                  {open.length > 0 ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {open.map(c => (
                        <span key={c.id} style={{ fontSize: 11.5, fontWeight: 500, color: "#5f6b7a", background: "#f4f4f0", padding: "5px 10px", borderRadius: 6, minHeight: 30, display: "flex", alignItems: "center", justifyContent: "center" }}>{c.title.length > 28 ? c.title.slice(0, 28) + "\u2026" : c.title}</span>
                      ))}
                    </div>
                  ) : <span style={{ fontSize: 12, color: "#c4c8cc" }}>—</span>}
                </div>
                <div style={{ flex: "1 1 280px", padding: "14px 16px", textAlign: "center" }}>
                  {(() => {
                    if (open.length === 0) {
                      const cNote = getNotesMap(h)._site || "";
                      if (isAdmin) {
                        if (editingNote === h) {
                          return (<div style={{ display: "flex", gap: 4 }} onClick={e => e.stopPropagation()}>
                            <input style={{ ...styles.pwInput, width: "100%", fontSize: 12 }} value={noteText} onChange={e => setNoteText(e.target.value)} onKeyDown={e => e.key === "Enter" && saveNote(h, null)} />
                            <button style={{ ...styles.pwSaveBtn, fontSize: 10, padding: "3px 8px" }} onClick={() => saveNote(h, null)}>✓</button>
                            <button style={{ ...styles.pwCancelBtn, fontSize: 10 }} onClick={() => setEditingNote(null)}>✕</button>
                          </div>);
                        }
                        return (<div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "center" }}>
                          <span style={{ fontSize: 12.5, color: cNote ? "#5f6b7a" : "#c4c8cc" }}>{cNote || "—"}</span>
                          <button style={{ fontSize: 10.5, color: "#0d9488", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }} onClick={e => { e.stopPropagation(); setEditingNote(h); setNoteText(cNote); }}>edit</button>
                        </div>);
                      }
                      return <span style={{ fontSize: 12.5, color: cNote ? "#5f6b7a" : "#c4c8cc" }}>{cNote || "—"}</span>;
                    }
                    return (<div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {open.map(c => {
                        const cNote = getNoteForComplaint(h, c.id);
                        if (isAdmin && editingNote === c.id) {
                          return (<div key={c.id} style={{ display: "flex", gap: 4, minHeight: 30, alignItems: "center" }} onClick={e => e.stopPropagation()}>
                            <input style={{ ...styles.pwInput, width: "100%", fontSize: 12 }} value={noteText} onChange={e => setNoteText(e.target.value)} onKeyDown={e => e.key === "Enter" && saveNote(h, c.id)} />
                            <button style={{ ...styles.pwSaveBtn, fontSize: 10, padding: "3px 8px" }} onClick={() => saveNote(h, c.id)}>✓</button>
                            <button style={{ ...styles.pwCancelBtn, fontSize: 10 }} onClick={() => setEditingNote(null)}>✕</button>
                          </div>);
                        }
                        return (<div key={c.id} style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "center", minHeight: 30 }}>
                          <span style={{ fontSize: 12, color: cNote ? "#5f6b7a" : "#c4c8cc" }}>{cNote || "—"}</span>
                          {isAdmin && <button style={{ fontSize: 10.5, color: "#0d9488", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }} onClick={e => { e.stopPropagation(); setEditingNote(c.id); setNoteText(cNote); }}>edit</button>}
                        </div>);
                      })}
                    </div>);
                  })()}
                </div>
              </div>
              {expandedRow === h && (
                <div className="fade-in" style={{ background: "#fafaf7", padding: "16px 24px", borderBottom: "1px solid #e5e5e0" }}>
                  <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 1.5, textTransform: "uppercase", color: "#8a9199", marginBottom: 10 }}>Open Tickets — {displayName(h)}</div>
                  {open.length > 0 ? open.map(c => (
                    <div key={c.id} style={{ background: "#fff", borderRadius: 8, padding: "12px 16px", marginBottom: 8, border: "1px solid #e5e5e0" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#b91c1c" }}>{c.title}</span>
                        <span style={{ fontSize: 11, color: "#8a9199" }}>{new Date(c.created_at).toLocaleDateString("en-PK", { year: "numeric", month: "short", day: "numeric" })}</span>
                      </div>
                      <p style={{ fontSize: 12, color: "#5f6b7a", margin: 0, lineHeight: 1.6 }}>{cleanDescription(c.description)}</p>
                    </div>
                  )) : <p style={{ fontSize: 12, color: "#8a9199" }}>No open complaints for this site.</p>}
                  {onViewSite && (
                    <button onClick={(e) => { e.stopPropagation(); onViewSite(h); }} style={{ display: "inline-flex", alignItems: "center", gap: 7, marginTop: 6, fontSize: 12, fontWeight: 700, color: "#062825", background: "linear-gradient(135deg, #0d9488, #2dd4a8, #5eead4)", border: "none", borderRadius: 10, padding: "9px 18px", cursor: "pointer", letterSpacing: 0.3 }}>
                      View all tickets <span style={{ fontSize: 14 }}>→</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
/* ─── Comment Section ─── */
function CommentSection({ complaintId, hospital, currentUser, canComment, isAdmin, highlightCommentText }) {
  const [comments, setComments] = useState([]); const [text, setText] = useState(""); const [posting, setPosting] = useState(false);
  const [loaded, setLoaded] = useState(false); const [expanded, setExpanded] = useState(false);
  const [editingComment, setEditingComment] = useState(null); const [editText, setEditText] = useState("");
  const [count, setCount] = useState(0);
  const [highlightId, setHighlightId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const fetchCount = () => {
      supabase.from("comments").select("id", { count: "exact", head: true }).eq("complaint_id", complaintId).then(({ count: c }) => { if (!cancelled && c !== null) setCount(c); });
    };
    fetchCount();
    const iv = setInterval(() => { if (!document.hidden) fetchCount(); }, 5000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [complaintId]);

const loadComments = useCallback(async () => { const data = await fetchComments(complaintId); setComments(data); setCount(data.length); setLoaded(true); }, [complaintId]);
  useEffect(() => {
    if (!expanded) return;
    loadComments();
    const iv = setInterval(() => { if (!document.hidden) loadComments(); }, 5000);
    return () => clearInterval(iv);
  }, [expanded, loadComments]);
  // When a comment notification is clicked, auto-expand and highlight the matching comment
  useEffect(() => {
    if (highlightCommentText && highlightCommentText.trim()) {
      setExpanded(true);
    }
  }, [highlightCommentText]);

  useEffect(() => {
    if (!highlightCommentText || !highlightCommentText.trim() || !loaded || comments.length === 0) return;
    const preview = highlightCommentText.trim();
    let target = null;
    for (let i = comments.length - 1; i >= 0; i--) {
      const content = (comments[i].content || "").trim();
      if (content.indexOf(preview) === 0 || preview.indexOf(content.slice(0, 80)) === 0) { target = comments[i].id; break; }
    }
    if (!target && comments.length > 0) target = comments[comments.length - 1].id;
    setHighlightId(target);
    const t = setTimeout(() => setHighlightId(null), 2000);
    return () => clearTimeout(t);
  }, [highlightCommentText, loaded, comments.length]);

  const post = async () => {
    if (!text.trim() || posting) return; setPosting(true);
    const author = currentUser.role === "admin" ? "" : currentUser.role === "hospital" ? currentUser.name + " Hospital" : `${currentUser.name} — ${getCompanyName(currentUser)}`;
    const role = currentUser.role;
    await insertComment(complaintId, author, role, text.trim()); setText(""); setPosting(false); await loadComments();
    // Notify: if hospital comments, notify companies. If company comments, notify hospital + other companies.
    const userId = currentUser.id || currentUser.name?.toLowerCase().replace(/\s+/g, "");
    const companyKey = (currentUser.company || currentUser.name || "").toLowerCase().replace(/[\s-]+/g, "");
    const notifTitle = currentUser.role === "admin" ? "New Comment" : `New Comment from ${author}`;
    if (currentUser.role === "hospital") {
      notifyUsers("comment", notifTitle, text.trim().slice(0, 80), hospital || currentUser.name, complaintId, userId).catch(() => {});
    } else if (hospital) {
      // Notify the hospital
      createNotification(hospital.toLowerCase().replace(/\s+/g, ""), "comment", notifTitle, text.trim().slice(0, 80), complaintId, hospital).catch(() => {});
      // Notify other companies watching this site (exclude self)
      notifyUsers("comment", notifTitle, text.trim().slice(0, 80), hospital, complaintId, companyKey).catch(() => {});
    }
  };
  const handleDelete = async (id) => { await deleteComment(id); await loadComments(); };
  const handleEdit = async (id) => { if (!editText.trim()) return; await updateCommentContent(id, editText.trim()); setEditingComment(null); setEditText(""); await loadComments(); };
  return (
    <div style={{ marginTop: 10 }}>
      <button style={styles.commentToggle} onClick={() => setExpanded(!expanded)}>
        {expanded ? "▾ Hide Comments" : "▸ Comments" + (count > 0 ? ` (${count})` : "")}
      </button>
      {expanded && (
        <div style={styles.commentBox}>
          {comments.length === 0 && <p style={{ fontSize: 13, color: "#718096", margin: "0 0 8px" }}>No comments yet.</p>}
          {comments.map(c => (
            <div key={c.id} style={{ ...styles.commentItem, ...(highlightId === c.id ? { background: C.tealLight, borderRadius: 8, padding: "8px 10px", transition: "background 0.4s" } : { transition: "background 0.4s" }) }}>
              <div style={styles.commentHeader}>
                <strong style={{ fontSize: 13, color: "#1a2332" }}>{c.author_role === "admin" ? "" : c.author}</strong>
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
              <button style={{ ...styles.commentSendBtn, background: (!text.trim() || posting) ? "#9db8b4" : C.teal, cursor: (!text.trim() || posting) ? "not-allowed" : "pointer", boxShadow: (!text.trim() || posting) ? "none" : "0 3px 8px rgba(13,148,136,0.25)" }} onClick={post} disabled={!text.trim() || posting}>{posting ? "…" : "Post"}</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function GroupedHospitalList({ groups, complaints, siteNotes, onSelect }) {
  const countFor = h => complaints.filter(c => hospitalMatches(c.hospital, h)).length;
  const openCountFor = h => complaints.filter(c => hospitalMatches(c.hospital, h) && !isClosedStatus(c.status)).length;
  const groupCountFor = hs => complaints.filter(c => hs.includes(c.hospital)).length;
  const groupOpenFor = hs => complaints.filter(c => hs.includes(c.hospital) && !isClosedStatus(c.status)).length;
  const totalOpen = complaints.filter(c => !isClosedStatus(c.status)).length;
  const totalResolved = complaints.filter(c => isClosedStatus(c.status)).length;
  return (
    <div style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <div style={{ marginBottom: 22 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: "#1a1d21", letterSpacing: "-0.01em" }}>Tickets</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: totalOpen > 0 ? "#b45309" : "#5f6b7a", background: totalOpen > 0 ? "#fef3e2" : "#f4f4f0", padding: "4px 12px", borderRadius: 20 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: totalOpen > 0 ? "#d97706" : "#94a3b8" }} />
            {totalOpen} open ticket{totalOpen === 1 ? "" : "s"}
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: "#0f766e", background: "#e6f5f0", padding: "4px 12px", borderRadius: 20 }}>
            {totalResolved} resolved
          </span>
        </div>
      </div>
      {Object.entries(groups).map(([p, hs]) => (
        <div key={p} style={{ marginBottom: 26 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 700, color: "#1a1d21" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.teal }} />{p}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20, background: "#f4f4f0", color: "#5f6b7a" }}>{groupCountFor(hs)} total</span>
              {groupOpenFor(hs) > 0 && <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20, background: "#fef3e2", color: "#b45309" }}>{groupOpenFor(hs)} open</span>}
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
            {hs.map(h => {
              const total = countFor(h); const open = openCountFor(h);
              const status = getSiteDisplayStatus(h, complaints, siteNotes);
              const isNonFunc = status === "Non Functional";
              const isShutDown = status === "Shut Down";
              // Header: brighter teal for open tickets OR shutdown (both are issues), grey for non-functional, standard teal otherwise
              const headerBg = isNonFunc
                ? "linear-gradient(120deg, #4b5563, #6b7280)"
                : (open > 0 || isShutDown)
                  ? "linear-gradient(120deg, #0f766e, #14b8a6)"
                  : "linear-gradient(120deg, #0b3b38, #0f766e)";
              const numColor = isNonFunc ? "#e5e7eb" : "#5eead4";
              return (
                <div key={h} onClick={() => onSelect(h)} style={{ background: "#fff", border: "1px solid #e8ecf0", borderRadius: 16, overflow: "hidden", cursor: "pointer", boxShadow: "0 1px 3px rgba(15,23,25,0.05)", transition: "all 0.2s" }} onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 8px 22px rgba(13,148,136,0.14)"; e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.borderColor = "#0d9488"; }} onMouseLeave={e => { e.currentTarget.style.boxShadow = "0 1px 3px rgba(15,23,25,0.05)"; e.currentTarget.style.transform = "none"; e.currentTarget.style.borderColor = "#e8ecf0"; }}>
                  <div style={{ background: headerBg, padding: "16px 18px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontSize: 14.5, fontWeight: 700, color: "#fff" }}>{displayName(h)}</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: numColor }}>{total}</div>
                  </div>
                  <div style={{ padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 11, color: "#8a9199" }}>{p}</span>
                    {open > 0
                      ? <span style={{ fontSize: 11, fontWeight: 600, color: "#b45309", background: "#fef3e2", padding: "3px 10px", borderRadius: 20 }}>{open} open</span>
                      : (isNonFunc || isShutDown)
                        ? null
                        : <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 600, color: "#16a34a", background: "#ecfdf5", padding: "3px 10px", borderRadius: 20 }}>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                            Clear
                          </span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── Attachment Viewer ─── */
function AttachmentViewer({ attachments }) {
  const [urls, setUrls] = useState({});
  const [expanded, setExpanded] = useState(false);
  const atts = Array.isArray(attachments) ? attachments : [];
  if (atts.length === 0) return null;

  const loadUrl = async (path) => {
    if (urls[path]) return;
    try {
      const res = await fetch(`/api/attachment?path=${encodeURIComponent(path)}`);
      const data = await res.json();
      if (data.url) setUrls(prev => ({ ...prev, [path]: data.url }));
    } catch {}
  };

  const handleExpand = () => {
    if (!expanded) atts.forEach(a => loadUrl(a.path));
    setExpanded(!expanded);
  };

  return (
    <div style={{ marginTop: 8 }}>
      <button onClick={handleExpand} style={{ fontSize: 12, fontWeight: 600, color: C.black, background: "none", border: "none", cursor: "pointer", letterSpacing: 0.5, textTransform: "uppercase" }}>
        {expanded ? "▾ Hide Attachments" : `▸ Attachments (${atts.length})`}
      </button>
      {expanded && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          {atts.map((a, i) => (
            <div key={i} style={{ border: `1px solid ${C.border}`, borderRadius: 4, overflow: "hidden" }}>
              {urls[a.path] ? (
                a.name.match(/\.(jpg|jpeg|png|gif|webp)$/i)
                  ? <a href={urls[a.path]} target="_blank" rel="noopener"><img src={urls[a.path]} alt={a.name} style={{ width: 120, height: 90, objectFit: "cover", display: "block" }} /></a>
                  : <a href={urls[a.path]} target="_blank" rel="noopener" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 120, height: 90, background: C.bg, fontSize: 11, color: C.textMid, textDecoration: "none" }}>📄 {a.name}</a>
              ) : (
                <div style={{ width: 120, height: 90, display: "flex", alignItems: "center", justifyContent: "center", background: C.bg, fontSize: 11, color: C.textLight }}>Loading…</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ComplaintCard({ complaint, currentUser, canComment, isAdmin, onAssign, onLogVisit, onMarkResolved, onVerify, onRejectVerify, onDelete, onRefresh, staffOptions, cardHighlight, highlightCommentText, ticketNumber }) {
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false); const [editTitle, setEditTitle] = useState(complaint.title);
  const [editDesc, setEditDesc] = useState(cleanDescription(complaint.description)); const [editSaving, setEditSaving] = useState(false);
  const [assigneePicks, setAssigneePicks] = useState([]);
  const [visitDatePick, setVisitDatePick] = useState("");
  const [resolveDatePick, setResolveDatePick] = useState("");
  const [verifyDatePick, setVerifyDatePick] = useState("");
  const [equipOpen, setEquipOpen] = useState(false);
  const [equipPicks, setEquipPicks] = useState(() => extractSerials(complaint.description));
  const [equipSaving, setEquipSaving] = useState(false);
  const c = complaint;
  const effStatus = getEffectiveStatus(c);
  // Open (unresolved/unverified) tickets start expanded; fully closed tickets start collapsed until clicked
  const [expanded, setExpanded] = useState(effStatus !== "Verified");

  const canAssign = canAssignTicket(currentUser, c.hospital, c);
  const canLogVisit = canLogVisitTicket(currentUser, c.hospital, c);
  const canMarkResolved = canMarkResolvedTicket(currentUser, c.hospital, c);
  const canVerify = canVerifyTicket(currentUser) && c.status === "Resolved";
  const alreadyAssigned = assigneeNames(c);
  const availableStaff = staffOptions.filter(s => !alreadyAssigned.includes(s.name));

  // Auto-expand when this card is focused from a notification
  useEffect(() => { if (cardHighlight || (highlightCommentText && highlightCommentText.trim())) setExpanded(true); }, [cardHighlight, highlightCommentText]);

  const toggleAssignee = (name) => setAssigneePicks(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]);
  const handleAssign = async () => { if (!assigneePicks.length) return; setBusy(true); await onAssign(c.id, assigneePicks); setAssigneePicks([]); setBusy(false); };
  const handleLogVisit = async () => { if (!visitDatePick) return; setBusy(true); await onLogVisit(c.id, visitDatePick); setVisitDatePick(""); setBusy(false); };
  const handleMarkResolved = async () => { setBusy(true); await onMarkResolved(c.id, resolveDatePick || undefined); setResolveDatePick(""); setBusy(false); };
  const handleVerify = async () => { setBusy(true); await onVerify(c.id, verifyDatePick || undefined); setVerifyDatePick(""); setBusy(false); };
  const handleRejectVerify = async () => { if (!window.confirm("Reject this resolution? The ticket will go back to Open and will need to be reassigned.")) return; setBusy(true); await onRejectVerify(c.id); setBusy(false); };
  const handleRemoveAssignee = async (name) => { if (!window.confirm(`Remove ${name} from this ticket?`)) return; setBusy(true); await removeAssignee(c.id, name); setBusy(false); await onRefresh(); };
  const handleRemoveVisit = async (d) => { if (!window.confirm("Remove this logged visit?")) return; setBusy(true); await removeVisit(c.id, d); setBusy(false); await onRefresh(); };
  const handleUndoResolve = async () => { if (!window.confirm("Undo resolving this ticket? It will go back to In Progress.")) return; setBusy(true); await undoResolve(c.id); setBusy(false); await onRefresh(); };
  const handleUndoVerify = async () => { if (!window.confirm("Undo verification? The ticket will go back to Resolved.")) return; setBusy(true); await undoVerify(c.id); setBusy(false); await onRefresh(); };
  const handleUndoReject = async () => { if (!window.confirm("Undo the last rejection? This restores the ticket to the state it was in right before it was rejected.")) return; setBusy(true); await undoReject(c.id); setBusy(false); await onRefresh(); };
  const handleDelete = async () => { if (window.confirm("Delete this complaint permanently?")) { await onDelete(c.id); await onRefresh(); } };
  const handleEditSave = async () => { if (!editTitle.trim() || !editDesc.trim()) return; setEditSaving(true); const preservedSerials = extractSerials(complaint.description); const newDesc = encodeSerials(editDesc.trim(), preservedSerials); await updateComplaintFields(c.id, { title: editTitle.trim(), description: newDesc }); setEditSaving(false); setEditing(false); await onRefresh(); };
  const toggleEquipPick = (serial) => setEquipPicks(prev => prev.includes(serial) ? prev.filter(s => s !== serial) : [...prev, serial]);
  const handleSaveEquip = async () => { setEquipSaving(true); const newDesc = encodeSerials(cleanDescription(c.description), equipPicks); await updateComplaintFields(c.id, { description: newDesc }); setEquipSaving(false); setEquipOpen(false); await onRefresh(); };
  const dateFmt = { year: "numeric", month: "short", day: "numeric" };
  const accentMap = { "Open": C.red, "In Progress": "#e0912f", "Resolved": "#2874a6", "Verified": C.green };
  const accent = accentMap[effStatus] || C.red;
  const cardHighlightStyle = cardHighlight ? { boxShadow: `0 0 0 3px ${C.teal}, 0 4px 14px rgba(15,118,110,0.2)`, transition: "box-shadow 0.3s" } : { transition: "box-shadow 0.3s" };
  return (
    <div style={{ ...styles.cardTeal, ...cardHighlightStyle }}>
      {editing ? (
        <div style={{ padding: 18 }}>
          <ComplaintTypeSelect value={editTitle} onChange={e => setEditTitle(e.target.value)} style={{ ...styles.inputTeal, marginBottom: 8 }} />
          <textarea style={{ ...styles.inputTeal, minHeight: 80, resize: "vertical", fontFamily: "inherit" }} value={editDesc} onChange={e => setEditDesc(e.target.value)} />
          <div style={{ display: "flex", gap: 8 }}><button style={styles.pwSaveBtn} onClick={handleEditSave}>{editSaving ? "…" : "Save"}</button><button style={styles.pwCancelBtn} onClick={() => { setEditing(false); setEditTitle(c.title); setEditDesc(cleanDescription(c.description)); }}>Cancel</button></div>
        </div>
      ) : (
        <>
          <div onClick={() => setExpanded(!expanded)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: C.tealBg, padding: "14px 16px", borderBottom: expanded ? `1px solid ${C.tealLight}` : "none", cursor: "pointer" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: accent, flexShrink: 0 }} />
              {ticketNumber && <span style={{ fontSize: 12, fontWeight: 700, color: "#fff", background: "linear-gradient(135deg, #0d9488, #0f766e)", border: "none", borderRadius: 7, padding: "3px 10px", flexShrink: 0, letterSpacing: 0.3 }}>Ticket ID: {ticketNumber}</span>}
              <strong style={{ fontSize: 14.5, fontWeight: 700, color: C.black, whiteSpace: expanded ? "normal" : "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.title}</strong>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
              <SeverityBadge severity={c.severity} />
              <StatusBadge status={effStatus} />
              <span style={{ fontSize: 16, color: C.tealDark, transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.2s", display: "inline-block" }}>⌄</span>
            </div>
          </div>
          {expanded && (
          <div style={{ padding: 16 }}>
            <p style={styles.cardDesc}>{cleanDescription(c.description)}</p>
            {/* Submitted by + assigned staff row */}
            {(c.submitted_by || hasAssignees(c)) && (
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 12 }}>
                {c.submitted_by && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, color: "#5f6b7a", background: "#f4f4f0", padding: "4px 11px", borderRadius: 20 }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#8a9199" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                    {c.submitted_by}
                  </span>
                )}
                {hasAssignees(c) && <AssignedTag complaint={c} isAdmin={isAdmin} onRemove={handleRemoveAssignee} />}
              </div>
            )}
            {/* Lifecycle milestone strip */}
            <div style={{ marginTop: 12, background: "#fafbfb", border: "1px solid #eef1f0", borderRadius: 12, padding: "14px 16px", display: "flex", flexWrap: "wrap", justifyContent: "space-around", gap: 16 }}>
              {(() => {
                const milestones = [];
                milestones.push({ label: "Opened", value: new Date(c.created_at).toLocaleDateString("en-PK", dateFmt), color: "#0f766e" });
                if (c.assigned_at) milestones.push({ label: "Assigned", value: new Date(c.assigned_at).toLocaleDateString("en-PK", dateFmt), color: "#5b3a9c" });
                if (hasVisits(c)) milestones.push({ label: effStatus === "In Progress" ? (visitDates(c).length > 1 ? "Visits" : "Visit") : "Visit Scheduled", color: "#b45309", visitList: true });
                if ((c.status === "Resolved" || c.status === "Verified") && c.resolved_at) milestones.push({ label: "Resolved", value: new Date(c.resolved_at).toLocaleDateString("en-PK", dateFmt), color: "#16a34a" });
                if (c.status === "Verified" && c.verified_at) milestones.push({ label: "Verified", value: new Date(c.verified_at).toLocaleDateString("en-PK", dateFmt), color: "#16a34a" });
                return milestones.map((m, i) => (
                  <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 4, minWidth: 0 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: "#8a9199" }}>{m.label}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: m.color, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4, flexWrap: "wrap" }}>
                      {m.visitList
                        ? visitDates(c).map((d, vi) => (
                            <span key={d} style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
                              {vi > 0 && <span style={{ color: "#c4c8cc", fontWeight: 400 }}>·</span>}
                              {new Date(d).toLocaleDateString("en-PK", dateFmt)}
                              {isAdmin && <button title="Undo this visit" onClick={() => handleRemoveVisit(d)} style={{ border: "none", background: "none", cursor: "pointer", color: "#c0392b", fontWeight: 700, fontSize: 11, padding: "0 1px" }}>✕</button>}
                            </span>
                          ))
                        : m.value}
                    </span>
                  </div>
                ));
              })()}
            </div>
            <AttachmentViewer attachments={c.attachments} />
            {canAssign && availableStaff.length > 0 && (
              <div style={{ marginTop: 14, border: `1px solid ${C.tealLight}`, borderRadius: 10, padding: 10, background: "#fbfefe" }}>
                <div style={{ fontSize: 11.5, fontWeight: 600, color: C.textMid, marginBottom: 8 }}>{alreadyAssigned.length ? "Assign additional staff" : "Assign staff"}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 8 }}>
                  {availableStaff.map(s => (
                    <label key={s.id} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12.5, cursor: "pointer" }}>
                      <input type="checkbox" checked={assigneePicks.includes(s.name)} onChange={() => toggleAssignee(s.name)} />
                      {s.name} <span style={{ color: C.textLight, fontSize: 11 }}>({s.company_role === "technician" ? "Technician" : s.company_role === "manager" ? "Manager" : "Engineer"})</span>
                    </label>
                  ))}
                </div>
                <button style={styles.btnTealSmall} onClick={handleAssign} disabled={busy || assigneePicks.length === 0}>{busy ? "…" : assigneePicks.length ? `Assign (${assigneePicks.length})` : "Assign"}</button>
              </div>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap", alignItems: "center" }}>
              {canLogVisit && (
                <>
                  <input type="date" style={{ fontSize: 12, padding: "8px 10px", border: `1px solid ${C.tealLight}`, borderRadius: 8 }} value={visitDatePick} onChange={e => setVisitDatePick(e.target.value)} />
                  <button style={styles.btnTealSmall} onClick={handleLogVisit} disabled={busy || !visitDatePick}>{busy ? "…" : hasVisits(c) ? "Log Another Visit" : "Log Visit"}</button>
                </>
              )}
              {canMarkResolved && (
                <>
                  {isAdmin && <input type="date" style={{ fontSize: 12, padding: "8px 10px", border: `1px solid ${C.tealLight}`, borderRadius: 8 }} value={resolveDatePick} onChange={e => setResolveDatePick(e.target.value)} title="Optional: pick a past date" />}
                  <button style={styles.btnTealSmall} onClick={handleMarkResolved} disabled={busy}>{busy ? "…" : "✓ Mark Resolved"}</button>
                </>
              )}
              {canVerify && (
                <>
                  {isAdmin && <input type="date" style={{ fontSize: 12, padding: "8px 10px", border: `1px solid ${C.tealLight}`, borderRadius: 8 }} value={verifyDatePick} onChange={e => setVerifyDatePick(e.target.value)} title="Optional: pick a past date" />}
                  <button style={{ ...styles.btnTealSmall, background: "#27ae60", boxShadow: "none" }} onClick={handleVerify} disabled={busy}>{busy ? "…" : "✓ Verify"}</button>
                  <button style={{ ...styles.btnTealSmall, background: "#c0392b", boxShadow: "none" }} onClick={handleRejectVerify} disabled={busy}>✕ Reject</button>
                </>
              )}
              {isAdmin && c.status === "Resolved" && (
                <button style={{ fontSize: 12, fontWeight: 600, color: "#9c4221", background: "#feebc8", border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer" }} onClick={handleUndoResolve} disabled={busy}>↺ Undo Resolve</button>
              )}
              {isAdmin && c.status === "Verified" && (
                <button style={{ fontSize: 12, fontWeight: 600, color: "#1a5276", background: "#d6eaf8", border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer" }} onClick={handleUndoVerify} disabled={busy}>↺ Undo Verify</button>
              )}
              {isAdmin && c.pre_reject_snapshot && (
                <button style={{ fontSize: 12, fontWeight: 600, color: "#5b3a9c", background: "#ede4fb", border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer" }} onClick={handleUndoReject} disabled={busy}>↺ Undo Last Rejection</button>
              )}
              {isAdmin && <button style={{ fontSize: 12, fontWeight: 600, color: C.tealDark, background: C.tealBg, border: `1px solid ${C.tealLight}`, borderRadius: 8, padding: "8px 16px", cursor: "pointer" }} onClick={() => { setEquipPicks(extractSerials(c.description)); setEquipOpen(o => !o); }}>⚙ Assign Equipment</button>}
              {isAdmin && <button style={{ fontSize: 12, fontWeight: 500, color: C.black, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 16px", cursor: "pointer" }} onClick={() => setEditing(true)}>Edit</button>}
              {isAdmin && <button style={{ ...styles.deleteBtn, borderRadius: 8 }} onClick={handleDelete}>Delete</button>}
            </div>
            {isAdmin && equipOpen && (() => {
              const equip = EQUIPMENT_DATA[c.hospital] || {};
              return (
                <div style={{ marginTop: 12, border: `1px solid ${C.tealLight}`, borderRadius: 12, padding: 14, background: C.tealBg, fontFamily: "'DM Sans', system-ui, sans-serif" }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: C.tealDark, marginBottom: 4 }}>Assign this ticket to equipment</div>
                  <div style={{ fontSize: 11.5, color: C.textMid, marginBottom: 12 }}>Tick the unit(s) this ticket relates to. It will be added to each unit's history.</div>
                  {EQUIP_CATEGORIES.map(cat => {
                    const items = cat.items.filter(it => equip[it.key]);
                    if (items.length === 0) return null;
                    return (
                      <div key={cat.group} style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.06em", color: C.tealDark, textTransform: "uppercase", marginBottom: 6 }}>{cat.group}</div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 6 }}>
                          {items.map((it, i) => {
                            const serial = equip[it.key]; const on = equipPicks.includes(serial);
                            return (
                              <div key={it.key} onClick={() => toggleEquipPick(serial)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 9, cursor: "pointer", background: on ? C.teal : "#fff", border: `1.5px solid ${on ? C.teal : C.tealLight}`, transition: "all 0.15s" }}>
                                <span style={{ width: 15, height: 15, borderRadius: 4, flexShrink: 0, background: on ? "#fff" : "transparent", border: `1.5px solid ${on ? "#fff" : C.tealLight}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                  {on && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke={C.teal} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                                </span>
                                <div style={{ minWidth: 0 }}>
                                  <div style={{ fontSize: 10.5, fontWeight: 600, color: on ? "rgba(255,255,255,0.85)" : C.textMid, lineHeight: 1.2 }}>{it.label}{cat.items.length > 1 ? ` ${i + 1}` : ""}</div>
                                  <div style={{ fontSize: 11.5, fontWeight: 700, color: on ? "#fff" : C.black, fontFamily: "'DM Mono', ui-monospace, monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{serial}</div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                  {Object.keys(equip).length === 0 && <div style={{ fontSize: 12, color: C.textMid, marginBottom: 10 }}>No equipment inventory recorded for this site.</div>}
                  <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                    <button style={styles.btnTealSmall} onClick={handleSaveEquip} disabled={equipSaving}>{equipSaving ? "…" : "Save"}</button>
                    <button style={{ fontSize: 12, fontWeight: 500, color: C.black, background: "#fff", border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 16px", cursor: "pointer" }} onClick={() => setEquipOpen(false)}>Cancel</button>
                  </div>
                </div>
              );
            })()}
            <CommentSection complaintId={c.id} hospital={c.hospital} currentUser={currentUser} canComment={canComment} isAdmin={isAdmin} highlightCommentText={highlightCommentText} />
          </div>
          )}
        </>
      )}
    </div>
  );
}

function ComplaintListView({ hospital, complaints, currentUser, canComment, isAdmin, onBack, onAssign, onLogVisit, onMarkResolved, onVerify, onRejectVerify, onDelete, onRefresh, staffOptions, focusInfo }) {
  const hc = complaints.filter(c => hospitalMatches(c.hospital, hospital)).sort(compareTicketsForDisplay);
  const cardRefs = useRef({});
  const [localFocus, setLocalFocus] = useState(null);
  useEffect(() => {
    if (focusInfo && focusInfo.complaintId) {
      setLocalFocus(focusInfo);
      setTimeout(() => {
        const el = cardRefs.current[focusInfo.complaintId];
        if (el && el.scrollIntoView) el.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 120);
      const t = setTimeout(() => setLocalFocus(null), 2500);
      return () => clearTimeout(t);
    }
  }, [focusInfo]);
  return (<div style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
    <button style={styles.backBtn} onClick={onBack}>&larr; Back</button>
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
      <h2 style={{ fontSize: 22, fontWeight: 800, color: "#1a1d21", letterSpacing: "-0.01em", margin: 0 }}>{hospital}</h2>
      <span style={{ fontSize: 12.5, fontWeight: 600, color: "#5f6b7a", background: "#f0f0ec", padding: "3px 10px", borderRadius: 20 }}>{getProvider(hospital)}</span>
      <span style={{ fontSize: 12.5, fontWeight: 600, color: "#0f766e", background: "#e6f5f0", padding: "3px 10px", borderRadius: 20 }}>{hc.length} ticket{hc.length === 1 ? "" : "s"}</span>
    </div>
    {hc.length === 0 && (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "50vh", padding: "60px 24px", textAlign: "center", fontFamily: "'DM Sans', system-ui, sans-serif" }}>
        <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#ecfdf5", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#1a1d21" }}>No Tickets from this Hospital</div>
      </div>
    )}
    {hc.map(c => (
      <div key={c.id} ref={el => { cardRefs.current[c.id] = el; }}>
        <ComplaintCard complaint={c} ticketNumber={getTicketNumber(c, complaints)} currentUser={currentUser} canComment={canComment} isAdmin={isAdmin} onAssign={onAssign} onLogVisit={onLogVisit} onMarkResolved={onMarkResolved} onVerify={onVerify} onRejectVerify={onRejectVerify} onDelete={onDelete} onRefresh={onRefresh} staffOptions={(staffOptions || []).filter(s => s.company === getProvider(hospital))}
          cardHighlight={localFocus && localFocus.complaintId === c.id}
          highlightCommentText={localFocus && localFocus.complaintId === c.id && localFocus.isComment ? localFocus.commentText : ""}
        />
      </div>
    ))}
  </div>);
}

/* ─── Hospital Dashboard ─── */
function HospitalDashboard({ user, complaints, onRefresh, onLogout }) {
  const [operatorName, setOperatorName] = useState("");
  const [title, setTitle] = useState(""); const [desc, setDesc] = useState("");
  const [selectedSerials, setSelectedSerials] = useState([]);
  const [files, setFiles] = useState([]);
  const [success, setSuccess] = useState(false); const [submitting, setSubmitting] = useState(false);
  const [focusInfo, setFocusInfo] = useState(null); // { complaintId, isComment, commentText }
  const cardRefs = useRef({});

  const handleFocusComplaint = (info) => {
    setFocusInfo(info);
    setTimeout(() => {
      const el = cardRefs.current[info.complaintId];
      if (el && el.scrollIntoView) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
    setTimeout(() => setFocusInfo(null), 2500);
  };
  const mine = complaints.filter(c => hospitalMatches(c.hospital, user.name)).sort(compareTicketsForDisplay);
  const openCount = mine.filter(c => !isClosedStatus(c.status)).length;

  const compressImage = (file) => new Promise((resolve) => {
    if (!file.type.startsWith("image/")) { resolve(file); return; }
    const canvas = document.createElement("canvas");
    const img = new Image();
    img.onload = () => {
      const maxW = 1200; const maxH = 1200;
      let w = img.width; let h = img.height;
      if (w > maxW) { h = (h * maxW) / w; w = maxW; }
      if (h > maxH) { w = (w * maxH) / h; h = maxH; }
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      canvas.toBlob((blob) => resolve(new File([blob], file.name, { type: "image/jpeg" })), "image/jpeg", 0.7);
    };
    img.src = URL.createObjectURL(file);
  });

  const doUpload = async (complaintId, fileList) => {
    for (const rawFile of fileList) {
      try {
        const file = await compressImage(rawFile);
        const base64Data = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result.split(",")[1]);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        const res = await fetch("/api/attachment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ complaintId, fileName: file.name, contentType: file.type, base64Data })
        });
        const data = await res.json();
        if (!res.ok) console.error("Upload error:", data.error);
      } catch (e) { console.error("Upload failed:", e); }
    }
  };

  const submitComplaint = async () => {
    if (!operatorName.trim() || !title.trim() || !desc.trim() || submitting) return;
    setSubmitting(true);
    const savedTitle = title.trim(); const savedDesc = encodeSerials(desc.trim(), selectedSerials); const savedFiles = [...files];
    const savedSeverity = getDefaultSeverity(savedTitle);
    const r = await insertComplaint(user.name, savedTitle, savedDesc, null, operatorName.trim(), savedSeverity);
    if (r) {
      if (savedFiles.length > 0) await doUpload(r.id, savedFiles);
      setTitle(""); setDesc(""); setFiles([]); setSelectedSerials([]);
      notifyUsers("new_complaint", `New Complaint: ${user.name}`, savedTitle, user.name, r.id, user.id).catch(() => {});
      await onRefresh();
      setSubmitting(false);
      setSuccess(true); setTimeout(() => setSuccess(false), 2500);
    } else {
      setSubmitting(false);
      alert("Failed to submit complaint. Please try again.");
    }
  };
  const handleMarkResolved = async (id) => { const c = complaints.find(x => x.id === id); await markResolved(id, operatorName.trim() || user.name + " Hospital"); if (c) { createNotification("amex", "resolved", `Ready for Verification: ${user.name}`, c.title, id, user.name).catch(() => {}); notifyUsers("resolved", `Ready for Verification: ${user.name}`, c.title, user.name, id, user.id).catch(() => {}); } await onRefresh(); };
  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = async () => { setRefreshing(true); await onRefresh(); setRefreshing(false); };
  const resolvedCount = mine.length - openCount;
  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f7f8fa", fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <style>{`
        @media (max-width: 768px) { .hosp-sidebar { display: none !important; } .hosp-main { margin-left: 0 !important; } }
      `}</style>
      {/* Sidebar — same teal strip, vessel, brand, but showing ticket stats instead of nav */}
      <nav className="hosp-sidebar" style={sidebarStyles.nav}>
        <div style={{ padding: "16px 0 18px", display: "flex", flexDirection: "column", alignItems: "center", borderBottom: "1px solid rgba(255,255,255,0.08)", marginBottom: 8, width: "100%" }}>
          <SidebarVessel />
          <div style={{ fontSize: 11, fontWeight: 700, color: "#5eead4", letterSpacing: 2, textTransform: "uppercase", marginTop: -24 }}>OxyTrack</div>
        </div>
        {/* Ticket stats */}
        <div style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 1.5, color: "rgba(94,234,212,0.7)", textTransform: "uppercase", textAlign: "center", marginBottom: 2 }}>Tickets</div>
          <div style={{ background: "rgba(94,234,212,0.08)", border: "1px solid rgba(94,234,212,0.12)", borderRadius: 12, padding: "14px 12px", textAlign: "center" }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: "#fff", lineHeight: 1 }}>{mine.length}</div>
            <div style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.55)", textTransform: "uppercase", letterSpacing: 0.8, marginTop: 5 }}>Total</div>
          </div>
          <div style={{ background: openCount > 0 ? "rgba(245,158,11,0.12)" : "rgba(94,234,212,0.08)", border: `1px solid ${openCount > 0 ? "rgba(245,158,11,0.25)" : "rgba(94,234,212,0.12)"}`, borderRadius: 12, padding: "14px 12px", textAlign: "center" }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: openCount > 0 ? "#fbbf24" : "#fff", lineHeight: 1 }}>{openCount}</div>
            <div style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.55)", textTransform: "uppercase", letterSpacing: 0.8, marginTop: 5 }}>Open</div>
          </div>
          <div style={{ background: "rgba(94,234,212,0.08)", border: "1px solid rgba(94,234,212,0.12)", borderRadius: 12, padding: "14px 12px", textAlign: "center" }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: "#5eead4", lineHeight: 1 }}>{resolvedCount}</div>
            <div style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.55)", textTransform: "uppercase", letterSpacing: 0.8, marginTop: 5 }}>Resolved</div>
          </div>
        </div>
        <div style={{ flex: 1 }} />
      </nav>
      <div className="hosp-main" style={{ flex: 1, marginLeft: 180, background: "#f7f8fa", minHeight: "100vh" }}>
        <TopBar title="PSA Oxygen Plants" user={user} onRefresh={handleRefresh} onLogout={onLogout} refreshing={refreshing}>
          <NotificationBell user={user} onFocusComplaint={handleFocusComplaint} light={true} complaints={complaints} />
        </TopBar>
        <main style={{ maxWidth: 1060, margin: "0 auto", padding: "28px 32px" }}>
          <div style={{ marginBottom: 24, padding: "22px 24px", background: "linear-gradient(135deg, #f0fdfa, #f7fdfb)", border: "1px solid #d5f0ea", borderRadius: 16, display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ width: 52, height: 52, borderRadius: 14, background: "linear-gradient(135deg, #0b3b38, #0f766e)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: "0 4px 12px rgba(13,148,136,0.25)" }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#5eead4" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l8.66 5v10L12 22l-8.66-5V7z"/><circle cx="12" cy="12" r="3.5"/></svg>
            </div>
            <div>
              <div style={{ fontSize: 24, fontWeight: 800, color: "#0f766e", letterSpacing: "-0.01em" }}>{fullHospitalName(user.name)}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 7 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#0f766e", background: "#e6f5f0", padding: "3px 11px", borderRadius: 20 }}>PSA Oxygen Plant</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#5f6b7a", background: "#fff", border: "1px solid #d5f0ea", padding: "3px 11px", borderRadius: 20 }}>Service Provider: {getProvider(user.name)}</span>
              </div>
            </div>
          </div>
          <section style={styles.formSectionTeal}>
          <h2 style={{ ...styles.sectionTitleTeal, borderLeft: "none", paddingLeft: 0, display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ width: 40, height: 40, borderRadius: "50%", background: C.teal, color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 400, boxShadow: "0 3px 8px rgba(13,148,136,0.3)" }}>+</span>
            Submit a Ticket
          </h2>
          <input style={styles.inputTeal} placeholder="Your name (operator name)" value={operatorName} onChange={e => setOperatorName(e.target.value)} />
          <ComplaintTypeSelect value={title} onChange={e => { const t = e.target.value; setTitle(t); const opts = serialOptionsFor(user.name, t); if (opts.length === 1) { setSelectedSerials([opts[0].serial]); } else { setSelectedSerials([]); } }} style={styles.inputTealSelect} />
          {title && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <span style={{ fontSize: 12.5, color: C.textMid }}>Severity:</span>
              <SeverityBadge severity={getDefaultSeverity(title)} />
            </div>
          )}
          <SerialPicker hospital={user.name} complaintType={title} selected={selectedSerials} onChange={setSelectedSerials} />
          <textarea style={{ ...styles.inputTeal, minHeight: 100, resize: "vertical", fontFamily: "inherit" }} placeholder="Describe the issue in detail…" value={desc} onChange={e => setDesc(e.target.value)} />
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: C.teal, fontWeight: 600, cursor: "pointer", padding: "10px 18px", border: `1.5px solid ${C.tealLight}`, background: C.tealBg, borderRadius: 10 }}>
              📎 Attach Photos
              <input type="file" accept="image/*,application/pdf" multiple capture="environment" style={{ display: "none" }} onChange={e => setFiles(prev => [...prev, ...Array.from(e.target.files)])} />
            </label>
            {files.length > 0 && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                {files.map((f, i) => (
                  <div key={i} style={{ position: "relative", border: `1px solid ${C.tealLight}`, padding: 4, borderRadius: 8 }}>
                    {f.type.startsWith("image/") ? <img src={URL.createObjectURL(f)} alt="" style={{ width: 60, height: 60, objectFit: "cover", borderRadius: 6 }} /> : <div style={{ width: 60, height: 60, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: C.textLight, background: C.bg }}>{f.name.slice(-8)}</div>}
                    <button onClick={() => setFiles(files.filter((_, j) => j !== i))} style={{ position: "absolute", top: -6, right: -6, width: 18, height: 18, borderRadius: "50%", background: C.red, color: "#fff", border: "none", fontSize: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <button disabled={!operatorName.trim() || !title.trim() || !desc.trim() || submitting} style={{ ...styles.btnTeal, background: submitting ? "#9db8b4" : (!operatorName.trim() || !title.trim() || !desc.trim()) ? "#9db8b4" : C.teal, cursor: submitting ? "not-allowed" : "pointer", pointerEvents: submitting ? "none" : "auto" }} onClick={submitComplaint}>{submitting ? "SUBMITTING..." : "SUBMIT TICKET"}</button>
          {success && (
            <div className="fade-in" style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16, padding: "14px 18px", background: "#e6f7ee", border: "1px solid #a7e3c4", borderRadius: 14, boxShadow: "0 4px 14px rgba(39,174,96,0.12)" }}>
              <div style={{ width: 34, height: 34, borderRadius: "50%", background: "#27ae60", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#166534" }}>Ticket submitted successfully</div>
                <div style={{ fontSize: 12.5, color: "#3f8f5f", marginTop: 1 }}>Your service provider has been notified.</div>
              </div>
            </div>
          )}
        </section>
        <section style={styles.listSection}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}><h2 style={{ ...styles.sectionTitleTeal, margin: 0, borderLeft: "none", paddingLeft: 0 }}>All Tickets ({mine.length})</h2>{openCount > 0 && <span style={{ fontSize: 13, fontWeight: 700, color: C.tealDark, background: C.tealLight, padding: "3px 12px", borderRadius: 12 }}>{openCount} open</span>}</div>
          {mine.length === 0 && <p style={styles.empty}>No tickets raised yet.</p>}
          {mine.map(c => (
            <div key={c.id} ref={el => { cardRefs.current[c.id] = el; }}>
              <ComplaintCard
                complaint={c} ticketNumber={getTicketNumber(c, complaints)} currentUser={user} canComment={true}
                isAdmin={false}
                onAssign={() => {}} onLogVisit={() => {}} onMarkResolved={handleMarkResolved} onVerify={() => {}} onRejectVerify={() => {}} onDelete={() => {}} onRefresh={onRefresh} staffOptions={[]}
                cardHighlight={focusInfo && focusInfo.complaintId === c.id}
                highlightCommentText={focusInfo && focusInfo.complaintId === c.id && focusInfo.isComment ? focusInfo.commentText : ""}
              />
            </div>
          ))}
        </section>
        </main>
        <PartnerFooter />
      </div>
    </div>
  );
}

/* ─── Admin Dashboard ─── */

/* ─── Sidebar Navigation Icons (hand-drawn SVG, matching existing stroke style) ─── */
function SidebarIcon({ name, size = 20 }) {
  const s = { width: size, height: size, strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", fill: "none", stroke: "currentColor" };
  const paths = {
    dashboard: <svg viewBox="0 0 24 24" style={s}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="4" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="11" width="7" height="10" rx="1"/></svg>,
    sites: <svg viewBox="0 0 24 24" style={s}><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>,
    tickets: <svg viewBox="0 0 24 24" style={s}><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 7l10 6 10-6"/></svg>,
    maintenance: <svg viewBox="0 0 24 24" style={s}><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>,
    analytics: <svg viewBox="0 0 24 24" style={s}><path d="M3 3v18h18"/><path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3"/></svg>,
    users: <svg viewBox="0 0 24 24" style={s}><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>,
    emails: <svg viewBox="0 0 24 24" style={s}><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 7l-8.97 5.7a1.94 1.94 0 01-2.06 0L2 7"/></svg>,
    submit: <svg viewBox="0 0 24 24" style={s}><path d="M12 5v14"/><path d="M5 12h14"/></svg>,
    equipment: <svg viewBox="0 0 24 24" style={s}><path d="M12 2l8.66 5v10L12 22l-8.66-5V7z"/><circle cx="12" cy="12" r="3.5"/></svg>,
    settings: <svg viewBox="0 0 24 24" style={s}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09a1.65 1.65 0 00-1.08-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09a1.65 1.65 0 001.51-1.08 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06a1.65 1.65 0 001.82.33h.08a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82v.08a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>,
    refresh: <svg viewBox="0 0 24 24" style={s}><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>,
    bell: <svg viewBox="0 0 24 24" style={s}><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>,
    signout: <svg viewBox="0 0 24 24" style={s}><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
  };
  return paths[name] || null;
}

/* ─── Compact Vessel Animation for Sidebar (elongated like login vessel) ─── */
function SidebarVessel() {
  const VW = 100, VH = 110;
  const cx = VW / 2;
  const vW = 22, vX = cx - vW / 2;
  const vTop = 12, vBottom = 62;
  const inTop = vTop + 2, inBottom = vBottom - 2, inH = inBottom - inTop;
  const surfAt = (r) => inBottom + (inTop + 2 - inBottom) * r;
  const rLo = 0.4, rHi = 1;
  const surfY_lo = surfAt(rLo), surfY_hi = surfAt(rHi);
  const colH_lo = (inH - 2) * rLo, colH_hi = (inH - 2) * rHi;
  const Mote = ({ mx, r, top, bottom, dur, delay, color }) => (
    <circle cx={mx} r={r} fill={color || "#eafff9"}>
      <animate attributeName="cy" values={`${bottom};${top};${bottom}`} dur={`${dur}ms`} begin={`${delay}ms`} repeatCount="indefinite" calcMode="spline" keySplines="0.4 0 0.6 1;0.4 0 0.6 1" keyTimes="0;0.5;1" />
      <animate attributeName="opacity" values="0;0.9;0" dur={`${dur}ms`} begin={`${delay}ms`} repeatCount="indefinite" />
    </circle>
  );
  return (
    <svg width={VW} height={VH} viewBox={`0 0 ${VW} ${VH}`} style={{ display: "block" }}>
      <defs>
        <radialGradient id="sv-halo" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#5eead4" stopOpacity="0.4" />
          <stop offset="1" stopColor="#5eead4" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="sv-col" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#c4fff2" stopOpacity="0.95" />
          <stop offset="0.5" stopColor="#5eead4" stopOpacity="0.8" />
          <stop offset="1" stopColor="#14b8a6" stopOpacity="0.55" />
        </linearGradient>
        <linearGradient id="sv-glass" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="rgba(255,255,255,0.85)" />
          <stop offset="0.5" stopColor="rgba(255,255,255,0.3)" />
          <stop offset="1" stopColor="rgba(255,255,255,0.85)" />
        </linearGradient>
        <clipPath id="sv-clip"><rect x={vX + 2} y={inTop} width={vW - 4} height={inH} rx={(vW - 4) / 2} /></clipPath>
      </defs>
      <circle cx={cx} cy="38" fill="url(#sv-halo)">
        <animate attributeName="r" values="28;36;28" dur="6000ms" repeatCount="indefinite" calcMode="spline" keySplines="0.4 0 0.6 1;0.4 0 0.6 1" keyTimes="0;0.5;1" />
        <animate attributeName="opacity" values="0.08;0.18;0.08" dur="6000ms" repeatCount="indefinite" />
      </circle>
      <line x1={cx} y1={vTop} x2={cx} y2="6" stroke="rgba(255,255,255,0.5)" strokeWidth="1" strokeLinecap="round" />
      <circle cx={cx} cy="5" r="2.5" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="0.8" />
      <g clipPath="url(#sv-clip)">
        <rect x={vX + 2} width={vW - 4} fill="url(#sv-col)">
          <animate attributeName="y" values={`${surfY_lo};${surfY_hi};${surfY_lo}`} dur="10400ms" repeatCount="indefinite" calcMode="spline" keySplines="0.4 0 0.6 1;0.4 0 0.6 1" keyTimes="0;0.5;1" />
          <animate attributeName="height" values={`${colH_lo};${colH_hi};${colH_lo}`} dur="10400ms" repeatCount="indefinite" calcMode="spline" keySplines="0.4 0 0.6 1;0.4 0 0.6 1" keyTimes="0;0.5;1" />
        </rect>
        <ellipse cx={cx} rx={(vW - 6) / 2} fill="#eafff9" opacity="0.85">
          <animate attributeName="cy" values={`${surfY_lo};${surfY_hi};${surfY_lo}`} dur="10400ms" repeatCount="indefinite" calcMode="spline" keySplines="0.4 0 0.6 1;0.4 0 0.6 1" keyTimes="0;0.5;1" />
          <animate attributeName="ry" values="1.5;3;1.5" dur="4800ms" repeatCount="indefinite" />
        </ellipse>
        <Mote mx={cx - 3} r={1} top={inTop + 4} bottom={inBottom - 4} dur={3400} delay={0} />
        <Mote mx={cx + 3} r={1.3} top={inTop + 4} bottom={inBottom - 4} dur={4000} delay={1200} />
        <Mote mx={cx} r={0.8} top={inTop + 4} bottom={inBottom - 4} dur={3700} delay={2200} />
      </g>
      <rect x={vX} y={vTop} width={vW} height={vBottom - vTop} rx={vW / 2} fill="none" stroke="url(#sv-glass)" strokeWidth="1.2" />
      <line x1={vX + 3.5} y1={vTop + 6} x2={vX + 3.5} y2={vBottom - 6} stroke="rgba(255,255,255,0.3)" strokeWidth="1.2" strokeLinecap="round" />
      <line x1={vX - 5} y1={inTop} x2={vX - 5} y2={inBottom} stroke="rgba(255,255,255,0.15)" strokeWidth="0.6" />
      <line x1={vX - 7} y1={inTop} x2={vX - 3} y2={inTop} stroke="rgba(255,255,255,0.15)" strokeWidth="0.6" />
      <line x1={vX - 6} y1={inTop + inH * 0.5} x2={vX - 4} y2={inTop + inH * 0.5} stroke="rgba(255,255,255,0.12)" strokeWidth="0.6" />
      <line x1={vX - 7} y1={inBottom} x2={vX - 3} y2={inBottom} stroke="rgba(255,255,255,0.15)" strokeWidth="0.6" />
      <circle cx={vX - 5} r="1.5" fill="#5eead4">
        <animate attributeName="cy" values={`${surfY_lo};${surfY_hi};${surfY_lo}`} dur="10400ms" repeatCount="indefinite" calcMode="spline" keySplines="0.4 0 0.6 1;0.4 0 0.6 1" keyTimes="0;0.5;1" />
      </circle>
      <line x1={cx - 12} y1="68" x2={cx + 12} y2="68" stroke="rgba(255,255,255,0.25)" strokeWidth="0.7" strokeLinecap="round" />
      <line x1={vX + 3} y1={vBottom} x2={cx - 8} y2="68" stroke="rgba(255,255,255,0.18)" strokeWidth="0.7" />
      <line x1={vX + vW - 3} y1={vBottom} x2={cx + 8} y2="68" stroke="rgba(255,255,255,0.18)" strokeWidth="0.7" />
      <ellipse cx={cx} cy="72" rx="12" ry="2.5" fill="#5eead4" opacity="0.06" />
      <Mote mx={cx - 28} r={1} top={14} bottom={56} dur={6000} delay={0} color="rgba(94,234,212,0.35)" />
      <Mote mx={cx + 30} r={1.2} top={12} bottom={56} dur={7000} delay={1500} color="rgba(94,234,212,0.3)" />
      <Mote mx={cx - 36} r={0.8} top={20} bottom={50} dur={5400} delay={3000} color="rgba(94,234,212,0.25)" />
    </svg>
  );
}

/* ─── Sidebar Navigation ─── */
function SidebarNav({ items, active, onSelect, bottomItems }) {
  return (
    <nav className="sidebar-nav" style={sidebarStyles.nav}>
      {/* Vessel + Brand */}
      <div style={{ padding: "16px 0 18px", display: "flex", flexDirection: "column", alignItems: "center", borderBottom: "1px solid rgba(255,255,255,0.08)", marginBottom: 8, width: "100%" }}>
        <SidebarVessel />
        <div style={{ fontSize: 11, fontWeight: 700, color: "#5eead4", letterSpacing: 2, textTransform: "uppercase", marginTop: -24 }}>OxyTrack</div>
      </div>
      {/* Main nav items */}
      <div style={sidebarStyles.items}>
        {items.map(item => {
          const isActive = active === item.id;
          return (
            <div key={item.id} className="sb-item" onClick={() => onSelect(item.id)} style={{ ...sidebarStyles.item, ...(isActive ? sidebarStyles.itemActive : {}) }}>
              {isActive && <div style={{ position: "absolute", left: 0, top: 6, bottom: 6, width: 3, borderRadius: "0 3px 3px 0", background: "#5eead4" }} />}
              <div style={{ color: isActive ? "#5eead4" : "rgba(255,255,255,0.4)", transition: "color 0.15s", flexShrink: 0 }}>
                <SidebarIcon name={item.icon} />
              </div>
              <span style={{ fontSize: 11.5, fontWeight: isActive ? 700 : 500, color: isActive ? "#fff" : "rgba(255,255,255,0.55)", transition: "color 0.15s", letterSpacing: 0.2 }}>{item.label}</span>
            </div>
          );
        })}
      </div>
      {bottomItems && bottomItems.length > 0 && (
        <>
          <div style={sidebarStyles.divider} />
          <div style={sidebarStyles.items}>
            {bottomItems.map(item => {
              const isActive = active === item.id;
              return (
                <div key={item.id} className="sb-item" onClick={() => onSelect(item.id)} style={{ ...sidebarStyles.item, ...(isActive ? sidebarStyles.itemActive : {}) }}>
                  {isActive && <div style={{ position: "absolute", left: 0, top: 6, bottom: 6, width: 3, borderRadius: "0 3px 3px 0", background: "#5eead4" }} />}
                  <div style={{ color: isActive ? "#5eead4" : "rgba(255,255,255,0.4)", transition: "color 0.15s", flexShrink: 0 }}>
                    <SidebarIcon name={item.icon} />
                  </div>
                  <span style={{ fontSize: 11.5, fontWeight: isActive ? 700 : 500, color: isActive ? "#fff" : "rgba(255,255,255,0.55)", transition: "color 0.15s", letterSpacing: 0.2 }}>{item.label}</span>
                </div>
              );
            })}
          </div>
        </>
      )}
      <div style={{ flex: 1 }} />
    </nav>
  );
}

/* ─── Top Bar (teal gradient, curved bottom, ZeBeyond pill buttons) ─── */
function TopBar({ title, subtitle, user, onRefresh, onLogout, refreshing, children }) {
  return (
    <div style={{ position: "sticky", top: 0, zIndex: 90, fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <div style={{ position: "relative", paddingBottom: 30 }}>
        {/* Teal header shape with a curved bottom edge — this IS the boundary. Everything
            below the curve is transparent, so page content scrolls up behind the curve. */}
        <svg viewBox="0 0 1200 94" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block", zIndex: -1 }}>
          <defs>
            <linearGradient id="tb-grad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#0b3b38" />
              <stop offset="0.5" stopColor="#0f766e" />
              <stop offset="1" stopColor="#0b3b38" />
            </linearGradient>
          </defs>
          <path d="M0,0 L1200,0 L1200,76 C1000,78 1000,90 750,90 C500,90 200,80 0,94 Z" fill="url(#tb-grad)" />
        </svg>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 32px", height: 64, color: "#fff", position: "relative" }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#fff", letterSpacing: 1.5, textTransform: "uppercase" }}>
              {typeof title === "string" && title.includes("Oxygen") ? (<>
                {title.split("Oxygen")[0]}<span style={{ background: "linear-gradient(135deg, #0d9488, #2dd4a8, #5eead4)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>Oxygen</span>{title.split("Oxygen")[1]}
              </>) : title}
            </div>
            
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {children}
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <button className="refresh-btn tb-glass" title="Refresh" aria-label="Refresh" onClick={onRefresh} style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.25)", color: "rgba(255,255,255,0.85)", borderRadius: 10, cursor: "pointer", padding: "7px 16px", lineHeight: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 12, fontWeight: 500, letterSpacing: 0.3, transition: "all 0.2s", fontFamily: "'DM Sans', system-ui, sans-serif", width: 118, boxSizing: "border-box" }}>
              <svg className={refreshing ? "refresh-icon spinning" : "refresh-icon"} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
              {!refreshing && "Refresh"}
              {refreshing && <svg className="spinning" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>}
            </button>
            <button className="tb-glass ox-sheen" title="Sign Out" aria-label="Sign Out" onClick={onLogout} style={{ background: "linear-gradient(135deg, #0d9488, #2dd4a8, #5eead4)", border: "none", color: "#062825", borderRadius: 10, cursor: "pointer", padding: "7px 16px", lineHeight: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 12, fontWeight: 700, letterSpacing: 0.5, transition: "all 0.2s", fontFamily: "'DM Sans', system-ui, sans-serif", textTransform: "capitalize", width: 118, boxSizing: "border-box" }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              Sign Out
            </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Placeholder pages for Maintenance and Analytics ─── */
function MaintenancePage() {
  return (
    <div style={{ textAlign: "center", padding: "80px 24px" }}>
      <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.15 }}>
        <SidebarIcon name="maintenance" size={64} />
      </div>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: C.black, margin: "0 0 8px" }}>Maintenance Records</h2>
      <p style={{ fontSize: 14, color: C.textLight, maxWidth: 400, margin: "0 auto", lineHeight: 1.6 }}>
        Preventive and corrective maintenance records for each site will be managed here. Track running hours, parts replaced, and upload PDF service reports.
      </p>
      <div style={{ marginTop: 24, padding: "14px 24px", background: C.tealBg, border: `1px solid ${C.tealLight}`, display: "inline-block", fontSize: 12, fontWeight: 600, color: C.tealDark, letterSpacing: 0.5 }}>COMING SOON</div>
    </div>
  );
}

function AnalyticsPage() {
  return (
    <div style={{ textAlign: "center", padding: "80px 24px" }}>
      <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.15 }}>
        <SidebarIcon name="analytics" size={64} />
      </div>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: C.black, margin: "0 0 8px" }}>Analytics & Insights</h2>
      <p style={{ fontSize: 14, color: C.textLight, maxWidth: 400, margin: "0 auto", lineHeight: 1.6 }}>
        Data visualization and analysis — resolution time trends, failure rates by equipment type, provider performance comparison, and site uptime tracking.
      </p>
      <div style={{ marginTop: 24, padding: "14px 24px", background: C.tealBg, border: `1px solid ${C.tealLight}`, display: "inline-block", fontSize: 12, fontWeight: 600, color: C.tealDark, letterSpacing: 0.5 }}>COMING SOON</div>
    </div>
  );
}

/* ─── Sidebar Styles ─── */
const sidebarStyles = {
  nav: { background: "linear-gradient(180deg, #0b3b38 0%, #0f5650 40%, #0f766e 65%, #0f766e 100%)", display: "flex", flexDirection: "column", padding: 0, alignItems: "stretch", width: 180, minHeight: "100vh", position: "fixed", top: 0, left: 0, zIndex: 100, fontFamily: "'DM Sans', system-ui, sans-serif" },
  items: { display: "flex", flexDirection: "column", gap: 2, padding: "4px 8px" },
  item: { display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 10, cursor: "pointer", transition: "all 0.2s", position: "relative" },
  itemActive: { background: "rgba(94,234,212,0.1)", border: "1px solid rgba(94,234,212,0.12)" },
  divider: { height: 1, background: "rgba(94,234,212,0.06)", margin: "8px 16px" },
};

/* ─── Equipment Data (36 sites × 15 equipment types, from Excel inventory) ─── */
const EQUIPMENT_DATA = {"Rawalpindi":{"oxyswing_a":"4423","oxyswing_b":"4723","comp1":"22177409","comp2":"22177477","comp3":"1018987","comp4":"1018985","dryer1":"230015546","dryer2":"230015550","dryer3":"230015536","dryer4":"230015525","hpox":"20230519328F01","oxycheck":"20230519424J01","css":"20230519280R01","medgas":"20230419404G01","generator":"HEI0009698"},"Bhakkar":{"oxyswing_a":"11323","oxyswing_b":"11023","comp1":"24036368","comp2":"22622357","comp3":"24036366","comp4":"24036365","dryer1":"230022546","dryer2":"230022549","dryer3":"230022529","dryer4":"230022537","hpox":"20230719759F01","oxycheck":"20230719436J01","css":"20230819291R01","medgas":"20230919411G01","generator":"HEI0009956"},"Toba Tek Singh":{"oxyswing_a":"17023","oxyswing_b":"17323","comp1":"25051330","comp2":"24036391","comp3":"24036389","comp4":"1017330","dryer1":"230030842","dryer2":"230030847","dryer3":"230033373","dryer4":"230033361","hpox":"20231019756F01","oxycheck":"20231019444J01","css":"20230919297R01","medgas":"20230919414G01","generator":"HEI0010115"},"Sahiwal":{"oxyswing_a":"9823","oxyswing_b":"10123","comp1":"22622344","comp2":"22622347","comp3":"22622348","comp4":"22622346","dryer1":"230022539","dryer2":"230022515","dryer3":"230022514","dryer4":"230022517","hpox":"20230619338F01","oxycheck":"20230719431J01","css":"20230819292R01","medgas":"20230719410G01","generator":"HEI0009831"},"Sargodha":{"oxyswing_a":"6223","oxyswing_b":"6523","comp1":"1019667","comp2":"1019664","comp3":"1019662","comp4":"1019665","dryer1":"230015538","dryer2":"230015544","dryer3":"230015541","dryer4":"230015534","hpox":"20230519331F01","oxycheck":"20230519427J01","css":"20230619281R01","medgas":"20230219398G01","generator":"HEI0009735"},"Multan":{"oxyswing_a":"9523","oxyswing_b":"9223","comp1":"22622351","comp2":"22622345","comp3":"22622350","comp4":"22622349","dryer1":"230022544","dryer2":"230022528","dryer3":"230022520","dryer4":"230022538","hpox":"20230619333F01","oxycheck":"20230719432J01","css":"20240521439R01","medgas":"20230719408G01","generator":"HEI0009832"},"Rahim Yar Khan":{"oxyswing_a":"15523","oxyswing_b":"15223","comp1":"20255406","comp2":"20558499","comp3":"20254409","comp4":"20254406","dryer1":"230033363","dryer2":"230033366","dryer3":"230033372","dryer4":"230030852","hpox":"20230619336F01","oxycheck":"20231019446J01","css":"20230919299R01","medgas":"20230919415G01","generator":"HEI0010149"},"Islamabad":{"oxyswing_a":"4624","oxyswing_b":"4324","comp1":"22177473","comp2":"22177412","comp3":"22177414","comp4":"22177411","dryer1":"240012716","dryer2":"240012706","dryer3":"240012712","dryer4":"240012709","hpox":"20240421435F01","oxycheck":"20240421555J01","css":"20240521457R01","medgas":"20240421456G01","generator":"HEI0010546"},"Faisalabad":{"oxyswing_a":"17623","oxyswing_b":"17923","comp1":"24036388","comp2":"25051333","comp3":"24949321","comp4":"25051329","dryer1":"230030846","dryer2":"230030853","dryer3":"230033367","dryer4":"230030845","hpox":"20231119759F01","oxycheck":"20231019443J01","css":"20230919294R01","medgas":"20230919422G01","generator":"HEI0009978"},"Jhang":{"oxyswing_a":"4024","oxyswing_b":"3724","comp1":"22177404","comp2":"22177475","comp3":"22177478","comp4":"22177476","dryer1":"240012707","dryer2":"240012710","dryer3":"240012708","dryer4":"240012713","hpox":"20240421417F01","oxycheck":"20240421533J01","css":"20240521421R01","medgas":"20240421420G01","generator":"HEI0010393"},"Bannu":{"oxyswing_a":"18523","oxyswing_b":"18223","comp1":"24949339","comp2":"25051331","comp3":"24949340","comp4":"24036390","dryer1":"23003358","dryer2":"23003365","dryer3":"230030854","dryer4":"230030841","hpox":"20231019754F01","oxycheck":"20231019498J01","css":"20230919295R01","medgas":"20230919418G01","generator":"HEI0009958"},"Kohat":{"oxyswing_a":"8623","oxyswing_b":"8923","comp1":"22622341","comp2":"22622338","comp3":"22622339","comp4":"22622343","dryer1":"230022541","dryer2":"230022516","dryer3":"230022542","dryer4":"230022543","hpox":"20230619337F01","oxycheck":"20230719434J01","css":"20230719288R01","medgas":"20230719406G01","generator":"HEI0009859"},"Lower Dir":{"oxyswing_a":"16823","oxyswing_b":"16423","comp1":"20254410","comp2":"20558496","comp3":"20255408","comp4":"20254407","dryer1":"230033360","dryer2":"230033357","dryer3":"230033369","dryer4":"230033356","hpox":"20231119757F01","oxycheck":"20231019455J01","css":"20230919300R01","medgas":"20230919416G01","generator":"HEI0010114"},"Malakand":{"oxyswing_a":"12523","oxyswing_b":"12223","comp1":"24138331","comp2":"24138330","comp3":"24138329","comp4":"24138327","dryer1":"230022526","dryer2":"230022533","dryer3":"230022532","dryer4":"230022545","hpox":"20230719340F01","oxycheck":"20230719435J01","css":"20230719289R01","medgas":"20230719407G01","generator":"HEI0009826"},"Swat":{"oxyswing_a":"14023","oxyswing_b":"14323","comp1":"24645375","comp2":"24645376","comp3":"22622352","comp4":"24645377","dryer1":"230022531","dryer2":"230030849","dryer3":"230022536","dryer4":"230030844","hpox":"20230719750F01","oxycheck":"20231019439J01","css":"20230719287R01","medgas":"20230719407G01","generator":"HEI0010116"},"Khaplu":{"oxyswing_a":"8323","oxyswing_b":"8023","comp1":"1019663","comp2":"1019644","comp3":"1019666","comp4":"1019994","dryer1":"230015522","dryer2":"230015526","dryer3":"230015524","dryer4":"230015549","hpox":"20230619330F01","oxycheck":"20230519428J01","css":"20230619187R01","medgas":"20230419401G01","generator":"HEI0009759"},"Ghizer":{"oxyswing_a":"7723","oxyswing_b":"7423","comp1":"1018993","comp2":"1019646","comp3":"1019643","comp4":"1018995","dryer1":"230015530","dryer2":"230015516","dryer3":"230015532","dryer4":"230015551","hpox":"20230619339F01","oxycheck":"20230519386J01","css":"20230619283R01","medgas":"20230419403G01","generator":"HEI0009757"},"Nagar":{"oxyswing_a":"1624","oxyswing_b":"1324","comp1":"20559408","comp2":"20559410","comp3":"20559411","comp4":"20559409","dryer1":"240006537","dryer2":"240006534","dryer3":"240006533","dryer4":"240006531","hpox":"20240421345F01","oxycheck":"20240221489J01","css":"20240321349R01","medgas":"20240221348G01","generator":"HEI0010473"},"Astore":{"oxyswing_a":"3124","oxyswing_b":"3424","comp1":"20660427","comp2":"20660426","comp3":"22177403","comp4":"20761474","dryer1":"240009706","dryer2":"240009716","dryer3":"240009713","dryer4":"240009714","hpox":"20240421399F01","oxycheck":"20240421522J01","css":"20240421403R01","medgas":"20240321402G01","generator":"HEI0010555"},"Haveli":{"oxyswing_a":"1924","oxyswing_b":"2224","comp1":"22177408","comp2":"22177407","comp3":"22177406","comp4":"22177405","dryer1":"240009707","dryer2":"240009712","dryer3":"240009715","dryer4":"240009708","hpox":"20240421363F01","oxycheck":"20240421500J01","css":"20240421367R01","medgas":"20240321366G01","generator":"HEI0010064"},"Neelum":{"oxyswing_a":"14423","oxyswing_b":"14823","comp1":"20552497","comp2":"20255409","comp3":"20254408","comp4":"20255405","dryer1":"230033371","dryer2":"230033364","dryer3":"230033368","dryer4":"230033354","hpox":"20231019755F01","oxycheck":"20231019441J01","css":"20230919301R01","medgas":"20230919420G01","generator":"HEI0010070"},"Jhelum":{"oxyswing_a":"1024","oxyswing_b":"724","comp1":"20559405","comp2":"20559412","comp3":"20559404","comp4":"20559407","dryer1":"240006535","dryer2":"240006528","dryer3":"240006536","dryer4":"240006530","hpox":"20240421327F01","oxycheck":"20240221478J01","css":"20240231331R01","medgas":"20240221330G01","generator":"HEI0010460"},"Bhimber":{"oxyswing_a":"5923","oxyswing_b":"5623","comp1":"1018988","comp2":"1019650","comp3":"1019652","comp4":"1019651","dryer1":"230015521","dryer2":"230015548","dryer3":"230015543","dryer4":"230015540","hpox":"20230619335F01","oxycheck":"20230519423J01","css":"20230719284R01","medgas":"20230419385G01","generator":"HEI0009717"},"Quetta SZ":{"oxyswing_a":"3223","oxyswing_b":"3523","comp1":"1018980","comp2":"1018981","comp3":"1018979","comp4":"1018982","dryer1":"230015518","dryer2":"230015519","dryer3":"230015535","dryer4":"230015517","hpox":"20230519329F01","oxycheck":"20230519425J01","css":"20230519278R01","medgas":"20230419399G01","generator":"HEI0009696"},"Quetta Sandeman":{"oxyswing_a":"224","oxyswing_b":"424","comp1":"20559401","comp2":"20559402","comp3":"20559403","comp4":"20559406","dryer1":"240006539","dryer2":"240006529","dryer3":"240006538","dryer4":"240006532","hpox":"20240421309F01","oxycheck":"20240221467J01","css":"20240321313R01","medgas":"20240221312G01","generator":"HEI0010464"},"Khuzdar":{"oxyswing_a":"11623","oxyswing_b":"11923","comp1":"24036364","comp2":"24036369","comp3":"24138328","comp4":"24036367","dryer1":"230022548","dryer2":"230022518","dryer3":"230022521","dryer4":"230022534","hpox":"20230719341F01","oxycheck":"20230719433J01","css":"20230819290R01","medgas":"20230919412G01","generator":"HEI0009986"},"Sibbi":{"oxyswing_a":"13723","oxyswing_b":"13423","comp1":"24240360","comp2":"22622359","comp3":"24240361","comp4":"22622340","dryer1":"230022535","dryer2":"230022530","dryer3":"230022540","dryer4":"230022524","hpox":"20231019753F01","oxycheck":"20231019438J01","css":"20230719285R01","medgas":"20230719405G01","generator":"HEI0010069"},"DM Jamali":{"oxyswing_a":"7123","oxyswing_b":"6823","comp1":"1018992","comp2":"1018989","comp3":"1018991","comp4":"1018990","dryer1":"230015537","dryer2":"230015531","dryer3":"230015523","dryer4":"230015527","hpox":"20230619334F01","oxycheck":"20230519430J01","css":"20230619276R01","medgas":"20230419397G01","generator":"HEI0009734"},"Zhob":{"oxyswing_a":"18823","oxyswing_b":"19123","comp1":"24949342","comp2":"25051332","comp3":"24949343","comp4":"24949338","dryer1":"230030843","dryer2":"230030848","dryer3":"230033370","dryer4":"230030850","hpox":"20231119258F01","oxycheck":"20231019447J01","css":"20230919296R01","medgas":"20230919419G01","generator":"HEI0009992"},"Loralai":{"oxyswing_a":"10423","oxyswing_b":"10723","comp1":"22622342","comp2":"22622361","comp3":"22622358","comp4":"22622362","dryer1":"230022547","dryer2":"230022522","dryer3":"230022519","dryer4":"220022527","hpox":"20230719749F01","oxycheck":"20230919437J01","css":"20230619293R01","medgas":"20230919413G01","generator":"HEI0009957"},"Kharan":{"oxyswing_a":"12823","oxyswing_b":"13123","comp1":"24240363","comp2":"24240364","comp3":"24240362","comp4":"22622360","dryer1":"230022523","dryer2":"230030855","dryer3":"230030856","dryer4":"230022525","hpox":"20230919752F01","oxycheck":"20231019440J01","css":"20230719286R01","medgas":"20230719409G01","generator":"HEI0010121"},"Panjgur":{"oxyswing_a":"15823","oxyswing_b":"16123","comp1":"20255407","comp2":"24645378","comp3":"20558498","comp4":"20559400","dryer1":"230033362","dryer2":"230033355","dryer3":"230033359","dryer4":"230030851","hpox":"20231019760F01","oxycheck":"20231019442J01","css":"20230919298R01","medgas":"20230919417G01","generator":"HEI0010150"},"Jamshoro":{"oxyswing_a":"4123","oxyswing_b":"2823","comp1":"1018983","comp2":"1018986","comp3":"1018996","comp4":"1018984","dryer1":"230015547","dryer2":"230015542","dryer3":"230015528","dryer4":"230015533","hpox":"20230519190F01","oxycheck":"20230519426J01","css":"20230519279R01","medgas":"20230419400G01","generator":"HEI0009359"},"Larkana":{"oxyswing_a":"5323","oxyswing_b":"5023","comp1":"1019649","comp2":"1019647","comp3":"1019645","comp4":"1019648","dryer1":"230015520","dryer2":"230015519","dryer3":"230015545","dryer4":"230015539","hpox":"20230619332F01","oxycheck":"20230519429J01","css":"20230619277R01","medgas":"20230419402G01","generator":"HEI0009746"},"Nawabshah":{"oxyswing_a":"2824","oxyswing_b":"2524","comp1":"20660424","comp2":"1011454N","comp3":"20660423","comp4":"20660425","dryer1":"240009711","dryer2":"240009705","dryer3":"240009709","dryer4":"240009710","hpox":"20240421381F01","oxycheck":"20240421511J01","css":"20240421385R01","medgas":"20240321384G01","generator":"HEI0010531"}};

const EQUIP_CATEGORIES = [
  { group: "Oxygen Generators", items: [{ key: "oxyswing_a", label: "Oxygen Generator" }, { key: "oxyswing_b", label: "Oxygen Generator" }]},
  { group: "Air Compressors", items: [{ key: "comp1", label: "Air Compressor" }, { key: "comp2", label: "Air Compressor" }, { key: "comp3", label: "Air Compressor" }, { key: "comp4", label: "Air Compressor" }]},
  { group: "Air Dryers", items: [{ key: "dryer1", label: "Air Dryer" }, { key: "dryer2", label: "Air Dryer" }, { key: "dryer3", label: "Air Dryer" }, { key: "dryer4", label: "Air Dryer" }]},
  { group: "Other Equipments", items: [{ key: "hpox", label: "HPOX 450 Booster" }, { key: "oxycheck", label: "Oxycheck Analyzer" }, { key: "css", label: "Central Supervision System" }, { key: "medgas", label: "Medgas Flow" }, { key: "generator", label: "Diesel Generator" }]},
];
const EQUIP_GROUP_COLORS = { "Oxygen Generators": { border: "#0d9488", text: "#0f766e" }, "Air Compressors": { border: "#0d9488", text: "#0f766e" }, "Air Dryers": { border: "#0d9488", text: "#0f766e" }, "Other Equipments": { border: "#0d9488", text: "#0f766e" } };
const EQUIP_ICONS = { oxyswing_a: "oxyswing", oxyswing_b: "oxyswing", comp1: "compressor", comp2: "compressor", comp3: "compressor", comp4: "compressor", dryer1: "dryer", dryer2: "dryer", dryer3: "dryer", dryer4: "dryer", hpox: "hpox", oxycheck: "oxycheck", css: "css", medgas: "medgas", generator: "generator" };

function EquipmentTab({ hospitals, complaints, siteNotes, isAdmin, onRefresh }) {
  const [selectedSite, setSelectedSite] = useState(null);
  const [selectedEquip, setSelectedEquip] = useState(null); // { key, label, serial }
  const [search, setSearch] = useState("");
  const [addingMaint, setAddingMaint] = useState(false);
  const [maintType, setMaintType] = useState("Warranty Maintenance");
  const [maintDate, setMaintDate] = useState("");
  const [maintDesc, setMaintDesc] = useState("");
  const [maintHours, setMaintHours] = useState("");
  const [maintSaving, setMaintSaving] = useState(false);
  const [maintStatus, setMaintStatus] = useState("OK");

  // Read/write maintenance records from siteNotes JSON (keyed as _maint_{serial})
  const getNotesMap = (h) => { try { const raw = siteNotes.find(s => hospitalMatches(s.hospital, h))?.equipment_note || ""; const parsed = JSON.parse(raw); return typeof parsed === "object" && parsed !== null ? parsed : { _legacy: raw }; } catch { const raw = siteNotes.find(s => hospitalMatches(s.hospital, h))?.equipment_note || ""; return raw ? { _legacy: raw } : {}; } };
  const getMaintRecords = (hospital, serial) => {
    const m = getNotesMap(hospital);
    try { return JSON.parse(m[`_maint_${serial}`] || "[]"); } catch { return []; }
  };
  const saveMaintRecord = async (hospital, serial, record) => {
    const m = getNotesMap(hospital);
    const existing = getMaintRecords(hospital, serial);
    existing.push(record);
    m[`_maint_${serial}`] = JSON.stringify(existing);
    await updateSiteNote(hospital, JSON.stringify(m));
  };
  const deleteMaintRecord = async (hospital, serial, idx) => {
    const m = getNotesMap(hospital);
    const existing = getMaintRecords(hospital, serial);
    existing.splice(idx, 1);
    m[`_maint_${serial}`] = JSON.stringify(existing);
    await updateSiteNote(hospital, JSON.stringify(m));
  };

  const handleAddMaint = async () => {
    if (!maintDate || !maintDesc.trim()) return;
    setMaintSaving(true);
    await saveMaintRecord(selectedSite, selectedEquip.serial, {
      type: maintType, date: maintDate, description: maintDesc.trim(),
      runningHours: maintHours.trim() || "", status: maintStatus
    });
    setMaintDate(""); setMaintDesc(""); setMaintHours(""); setMaintStatus("OK"); setAddingMaint(false);
    setMaintSaving(false);
    if (onRefresh) await onRefresh();
  };
  // Equipment history view — combines tickets + maintenance into one activity table.
  if (selectedSite && selectedEquip) {
    const dateFmt = { year: "numeric", month: "short", day: "numeric" };
    const fmt = (d) => d ? new Date(d).toLocaleDateString("en-PK", dateFmt) : "—";
    const ticketRows = complaintsForSerial(selectedEquip.serial, complaints).map(c => {
      const resolved = isClosedStatus(c.status);
      return {
        type: "Ticket", date: c.created_at, description: cleanDescription(c.description) || c.title,
        runningHours: "", resolved,
        statusText: resolved ? `Resolved · ${fmt(c.resolved_at)}` : "Pending",
        isTicket: true, _c: c
      };
    });
    const maintRows = getMaintRecords(selectedSite, selectedEquip.serial).map((r, i) => ({
      type: r.type || "Maintenance", date: r.date, description: r.description,
      runningHours: r.runningHours || "", resolved: r.status !== "Not OK",
      statusText: r.status || "OK", isTicket: false, _idx: i
    }));
    const allRows = [...ticketRows, ...maintRows].sort((a, b) => new Date(b.date) - new Date(a.date));
    const thStyle = { fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.85)", textTransform: "uppercase", letterSpacing: 0.8, padding: "13px 14px", textAlign: "center", whiteSpace: "nowrap" };
    const tdStyle = { fontSize: 12.5, color: "#374151", padding: "13px 14px", verticalAlign: "top", borderBottom: "1px solid transparent", borderImage: "linear-gradient(90deg, #0b3b38, #0f766e, #0b3b38) 1" };
    return (
      <div style={{ fontFamily: "'DM Sans', system-ui, sans-serif", minHeight: "75vh" }}>
        <button onClick={() => setSelectedEquip(null)} style={{ fontSize: 12, fontWeight: 600, color: C.tealDark, background: "none", border: "none", cursor: "pointer", padding: "0 0 16px", letterSpacing: 0.5, textTransform: "uppercase" }}>&larr; Back</button>
        {/* Header: icon + identity */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22, padding: "20px 22px", background: "linear-gradient(135deg, #f0fdfa, #f7fdfb)", border: "1px solid #d5f0ea", borderRadius: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <img src={`/equipment/${EQUIP_ICONS[selectedEquip.key] || "equipment"}.svg`} alt={selectedEquip.label} style={{ width: 72, height: 72, objectFit: "contain", filter: "drop-shadow(0 8px 14px rgba(15,23,25,0.18))" }} onError={e => { e.target.style.display = "none"; e.target.nextSibling.style.display = "block"; }} />
            <svg style={{ display: "none", width: 66, height: 66 }} viewBox="0 0 24 24" fill="none" stroke="#0d9488" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l8.66 5v10L12 22l-8.66-5V7z"/><circle cx="12" cy="12" r="3.5"/></svg>
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#1a1d21", letterSpacing: "-0.01em" }}>{selectedEquip.label}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#0f766e", fontFamily: "'DM Mono', ui-monospace, monospace", letterSpacing: 0.5, marginTop: 3 }}>SN: {selectedEquip.serial}</div>
              <div style={{ fontSize: 12, color: "#8a9199", marginTop: 3 }}>{displayName(selectedSite)}</div>
            </div>
          </div>
          {isAdmin && !addingMaint && (
            <button onClick={() => setAddingMaint(true)} style={{ fontSize: 12, fontWeight: 700, color: "#062825", background: "linear-gradient(135deg, #0d9488, #2dd4a8, #5eead4)", border: "none", borderRadius: 10, padding: "9px 18px", cursor: "pointer", letterSpacing: 0.3, whiteSpace: "nowrap" }}>+ Log Maintenance</button>
          )}
        </div>
        {/* Add maintenance form (admin only) */}
        {isAdmin && addingMaint && (
          <div style={{ background: "#fff", border: `1px solid ${C.tealLight}`, borderRadius: 14, padding: 18, marginBottom: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#1a1d21", marginBottom: 12 }}>Log Maintenance Activity</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: C.textMid, display: "block", marginBottom: 4 }}>Activity Type</label>
                <select value={maintType} onChange={e => setMaintType(e.target.value)} style={{ width: "100%", padding: "9px 12px", fontSize: 13, border: `1.5px solid ${C.tealLight}`, borderRadius: 10, outline: "none", background: "#fff", color: "#111", cursor: "pointer" }}>
                  <option value="Warranty Maintenance">Warranty Maintenance</option>
                  <option value="Corrective Maintenance">Corrective Maintenance</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: C.textMid, display: "block", marginBottom: 4 }}>Date</label>
                <input type="date" value={maintDate} onChange={e => setMaintDate(e.target.value)} style={{ width: "100%", padding: "9px 12px", fontSize: 13, border: `1.5px solid ${C.tealLight}`, borderRadius: 10, outline: "none", color: "#111" }} />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: C.textMid, display: "block", marginBottom: 4 }}>Description</label>
                <input value={maintDesc} onChange={e => setMaintDesc(e.target.value)} placeholder="What was done..." style={{ width: "100%", padding: "9px 12px", fontSize: 13, border: `1.5px solid ${C.tealLight}`, borderRadius: 10, outline: "none", color: "#111" }} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: C.textMid, display: "block", marginBottom: 4 }}>Running Hours</label>
                <input value={maintHours} onChange={e => setMaintHours(e.target.value)} placeholder="e.g. 1200" style={{ width: "100%", padding: "9px 12px", fontSize: 13, border: `1.5px solid ${C.tealLight}`, borderRadius: 10, outline: "none", color: "#111" }} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: C.textMid, display: "block", marginBottom: 4 }}>Status</label>
                <select value={maintStatus} onChange={e => setMaintStatus(e.target.value)} style={{ width: "100%", padding: "9px 12px", fontSize: 13, border: `1.5px solid ${C.tealLight}`, borderRadius: 10, outline: "none", background: "#fff", color: "#111", cursor: "pointer" }}>
                  <option value="OK">OK</option>
                  <option value="Not OK">Not OK</option>
                </select>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={handleAddMaint} disabled={maintSaving || !maintDate || !maintDesc.trim()} style={{ fontSize: 12, fontWeight: 700, color: "#fff", background: (!maintDate || !maintDesc.trim()) ? "#9db8b4" : C.teal, border: "none", borderRadius: 10, padding: "9px 18px", cursor: (!maintDate || !maintDesc.trim()) ? "not-allowed" : "pointer" }}>{maintSaving ? "Saving…" : "Save"}</button>
              <button onClick={() => { setAddingMaint(false); setMaintDate(""); setMaintDesc(""); setMaintHours(""); setMaintStatus("OK"); }} style={{ fontSize: 12, fontWeight: 500, color: C.black, background: "#fff", border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 18px", cursor: "pointer" }}>Cancel</button>
            </div>
          </div>
        )}
        {/* Activity table */}
        <div style={{ background: "#fff", border: "1px solid #e5e5e0", borderRadius: 12, overflow: "hidden", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}>
            <thead>
              <tr style={{ background: "linear-gradient(120deg, #0b3b38, #0f766e 50%, #0b3b38)" }}>
                <th style={{ ...thStyle, width: 44 }}>#</th>
                <th style={{ ...thStyle, textAlign: "left", minWidth: 160 }}>Activity</th>
                <th style={{ ...thStyle, minWidth: 110 }}>Date</th>
                <th style={{ ...thStyle, textAlign: "left", minWidth: 220 }}>Description</th>
                <th style={{ ...thStyle, minWidth: 100 }}>Running Hours</th>
                <th style={{ ...thStyle, minWidth: 130 }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {allRows.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: "44px 16px", textAlign: "center", fontSize: 13, color: "#94a3b8" }}>No records for this unit.</td></tr>
              ) : allRows.map((row, i) => {
                // Activity pill color: Ticket = green if resolved, orange if not; maintenance = teal/purple
                const actColor = row.type === "Ticket"
                  ? (row.resolved ? { color: "#16a34a", bg: "#ecfdf5" } : { color: "#b45309", bg: "#fef3e2" })
                  : row.type === "Warranty Maintenance" ? { color: "#0f766e", bg: "#e6f5f0" } : { color: "#6d28d9", bg: "#f3f0ff" };
                const stOk = row.resolved;
                return (
                  <tr key={row.isTicket ? row._c.id : `m-${row._idx}`}>
                    <td style={{ ...tdStyle, textAlign: "center", color: "#b0b5ba", fontWeight: 600 }}>{allRows.length - i}</td>
                    <td style={{ ...tdStyle, textAlign: "left" }}><span style={{ fontSize: 11, fontWeight: 700, color: actColor.color, background: actColor.bg, padding: "3px 10px", borderRadius: 20, whiteSpace: "nowrap" }}>{row.type}</span></td>
                    <td style={{ ...tdStyle, textAlign: "center", whiteSpace: "nowrap" }}>{fmt(row.date)}</td>
                    <td style={{ ...tdStyle, textAlign: "left", color: "#374151", lineHeight: 1.5 }}>{row.description || "—"}</td>
                    <td style={{ ...tdStyle, textAlign: "center", fontFamily: "'DM Mono', ui-monospace, monospace", fontWeight: 600 }}>{row.runningHours || "—"}</td>
                    <td style={{ ...tdStyle, textAlign: "center" }}><span style={{ fontSize: 11, fontWeight: 700, color: stOk ? "#16a34a" : (row.isTicket ? "#b45309" : "#dc2626"), background: stOk ? "#ecfdf5" : (row.isTicket ? "#fef3e2" : "#fef2f2"), padding: "3px 10px", borderRadius: 20, whiteSpace: "nowrap" }}>{row.statusText}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }
  if (selectedSite) {
    const equip = EQUIPMENT_DATA[selectedSite] || {};
    return (
      <div style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
        <style>{`
          @keyframes equipPageIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
          @keyframes equipItemIn { from { opacity: 0; transform: translateY(16px) scale(0.94); } to { opacity: 1; transform: translateY(0) scale(1); } }
          .equip-page { animation: equipPageIn 0.4s cubic-bezier(0.22, 1, 0.36, 1) both; }
          .equip-item { animation: equipItemIn 0.5s cubic-bezier(0.22, 1, 0.36, 1) both; }
          .equip-item:hover .equip-icon { transform: scale(1.12); }
        `}</style>
        <div className="equip-page">
        <button onClick={() => { setSelectedSite(null); setSelectedEquip(null); }} style={{ fontSize: 12, fontWeight: 600, color: C.tealDark, background: "none", border: "none", cursor: "pointer", padding: "0 0 16px", letterSpacing: 0.5, textTransform: "uppercase" }}>&larr; Back</button>
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: "#1a1d21", margin: 0, letterSpacing: "-0.01em" }}>{displayName(selectedSite)}</h2>
        </div>
        {(() => { let idx = 0; return EQUIP_CATEGORIES.map(cat => {
          const gc = EQUIP_GROUP_COLORS[cat.group];
          const catItems = cat.items.filter(item => equip[item.key]);
          if (catItems.length === 0) return null;
          return (<div key={cat.group} style={{ marginBottom: 32 }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", color: gc.text, textTransform: "uppercase", marginBottom: 2, paddingLeft: 2 }}>{cat.group}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 28 }}>
              {catItems.map(item => {
                const delay = (idx++ * 0.05).toFixed(2);
                return (
                <div key={item.key} className="equip-item" onClick={() => setSelectedEquip({ key: item.key, label: item.label, serial: equip[item.key] })} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: "10px", cursor: "pointer", animationDelay: `${delay}s` }}>
                  <img src={`/equipment/${EQUIP_ICONS[item.key] || "equipment"}.svg`} alt={item.label} className="equip-icon" style={{ width: 160, height: 160, objectFit: "contain", filter: "drop-shadow(0 14px 24px rgba(15,23,25,0.22))", transition: "transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1)" }} onError={e => { e.target.style.display = "none"; e.target.nextSibling.style.display = "block"; }} />
                  <svg className="equip-icon" style={{ display: "none", width: 150, height: 150, filter: "drop-shadow(0 14px 24px rgba(15,23,25,0.22))", transition: "transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1)" }} viewBox="0 0 24 24" fill="none" stroke={gc.border} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l8.66 5v10L12 22l-8.66-5V7z"/><circle cx="12" cy="12" r="3.5"/></svg>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: "#1a1d21", letterSpacing: "-0.01em", textAlign: "center" }}>{item.label}</div>
                    <div style={{ fontSize: 12, fontWeight: 500, color: "#8a9199", letterSpacing: 0.8, fontFamily: "'DM Mono', ui-monospace, monospace" }}>{equip[item.key]}</div>
                  </div>
                </div>
                );
              })}
            </div>
          </div>);
        }); })()}
        {Object.keys(equip).length === 0 && <div style={{ textAlign: "center", padding: "60px 24px", color: "#94a3b8", fontSize: 14 }}>No equipment data available for this site.</div>}
        </div>
      </div>
    );
  }
  const filtered = search.trim() ? ALL_HOSPITALS.filter(h => h.toLowerCase().includes(search.toLowerCase()) || displayName(h).toLowerCase().includes(search.toLowerCase())) : ALL_HOSPITALS;
  return (
    <div style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: "#1a1d21", letterSpacing: "-0.01em" }}>Equipment Inventory</div>
        <input style={{ padding: "8px 14px", fontSize: 13, border: `1.5px solid ${C.tealLight}`, borderRadius: 10, outline: "none", width: 220, background: "#fff", color: "#111" }} placeholder="Search sites..." value={search} onChange={e => setSearch(e.target.value)} onFocus={e => e.target.style.borderColor = C.teal} onBlur={e => e.target.style.borderColor = C.tealLight} />
      </div>
      <div className="ox-stagger" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16 }}>
        {Object.entries(GROUPS).map(([provider, sites]) => sites.filter(s => filtered.includes(s)).map(h => {
          const imgSrc = SITE_CODES[h] ? `/sites/${SITE_CODES[h]}.jpg` : null;
          return (
            <div key={h} onClick={() => setSelectedSite(h)} className="ox-imgzoom" style={{ background: "#fff", borderRadius: 16, overflow: "hidden", cursor: "pointer", transition: "all 0.28s cubic-bezier(0.16,1,0.3,1)", border: "1px solid #e8ecf0", boxShadow: "0 1px 3px rgba(15,23,25,0.05)" }} onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 12px 32px rgba(15,118,110,0.16)"; e.currentTarget.style.transform = "translateY(-4px)"; e.currentTarget.style.borderColor = "#0d9488"; }} onMouseLeave={e => { e.currentTarget.style.boxShadow = "0 1px 3px rgba(15,23,25,0.05)"; e.currentTarget.style.transform = "none"; e.currentTarget.style.borderColor = "#e8ecf0"; }}>
              {/* Image */}
              <div style={{ position: "relative", width: "100%", aspectRatio: "4 / 3", background: "linear-gradient(135deg, #0b3b38, #0f766e)", overflow: "hidden" }}>
                <img src={imgSrc} alt={displayName(h)} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} onError={e => { e.target.style.display = "none"; e.target.nextSibling.style.display = "flex"; }} />
                {/* Placeholder shown when image missing */}
                <div style={{ display: "none", position: "absolute", inset: 0, alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, #0b3b38, #0f766e)" }}>
                  <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="rgba(94,234,212,0.55)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l8.66 5v10L12 22l-8.66-5V7z"/><circle cx="12" cy="12" r="3.5"/></svg>
                </div>
              </div>
              {/* Name */}
              <div style={{ padding: "14px 16px", textAlign: "center" }}>
                <div style={{ fontSize: 14.5, fontWeight: 700, color: "#1a1d21", letterSpacing: "-0.01em" }}>{displayName(h)}</div>
              </div>
            </div>
          );
        }))}
      </div>
    </div>
  );
}

function AdminDashboard({ user, users, complaints, notifEmails, siteNotes, onRefresh, onLogout }) {
  const [tab, setTab] = useState("dashboard"); const [selected, setSelected] = useState(null); const [refreshing, setRefreshing] = useState(false);
  const [editingUser, setEditingUser] = useState(null); const [newPw, setNewPw] = useState(""); const [pwSuccess, setPwSuccess] = useState(""); const [saving, setSaving] = useState(false);
  const [emailGroup, setEmailGroup] = useState("Novair"); const [newEmail, setNewEmail] = useState(""); const [emailSaving, setEmailSaving] = useState(false);
  const [adminHospital, setAdminHospital] = useState(ALL_HOSPITALS[0]); const [adminTitle, setAdminTitle] = useState(""); const [adminDesc, setAdminDesc] = useState(""); const [adminDate, setAdminDate] = useState("");
  const [adminSubmitting, setAdminSubmitting] = useState(false); const [adminSuccess, setAdminSuccess] = useState(false);
  const [newUserId, setNewUserId] = useState(""); const [newUserName, setNewUserName] = useState(""); const [newUserRole, setNewUserRole] = useState("company"); const [newUserPw, setNewUserPw] = useState(""); const [newUserCompany, setNewUserCompany] = useState("Amex"); const [newUserCompanyRole, setNewUserCompanyRole] = useState("engineer"); const [newUserEmail, setNewUserEmail] = useState(""); const [addingUser, setAddingUser] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [adminFiles, setAdminFiles] = useState([]);
  const [pendingFocus, setPendingFocus] = useState(null);
  const [adminSeverity, setAdminSeverity] = useState("");
  const [adminSerials, setAdminSerials] = useState([]);
  const handleNotifFocus = (info) => {
    setTab("tickets");
    setSelected(info.hospital);
    setPendingFocus({ complaintId: info.complaintId, isComment: info.isComment, commentText: info.commentText });
  };

  const totalComplaints = complaints.length; const totalOpen = complaints.filter(c => !isClosedStatus(c.status)).length;
  const handleRefresh = async () => { setRefreshing(true); await onRefresh(); setRefreshing(false); };
  const handleAssign = async (id, assignedTo) => { await assignComplaint(id, assignedTo, user.name); const c = complaints.find(x => x.id === id); if (c) notifyUsers("assigned", `Ticket Assigned: ${c.hospital}`, `${c.title} — assigned to ${assignedTo}`, c.hospital, id, "admin").catch(() => {}); await onRefresh(); };
  const handleLogVisit = async (id, visitDate) => { await logVisit(id, visitDate, user.name); await onRefresh(); };
  const handleMarkResolved = async (id, resolveDate) => { if (resolveDate) { await resolveComplaint(id, resolveDate, user.name); } else { await markResolved(id, user.name); } const c = complaints.find(x => x.id === id); if (c) { createNotification("amex", "resolved", `Ready for Verification: ${c.hospital}`, c.title, id, c.hospital).catch(() => {}); notifyUsers("resolved", `Ready for Verification: ${c.hospital}`, c.title, c.hospital, id, "admin").catch(() => {}); } await onRefresh(); };
  const handleVerify = async (id, verifyDate) => { await verifyComplaint(id, user.name); if (verifyDate) { await updateComplaintFields(id, { verified_at: new Date(verifyDate).toISOString() }); } const c = complaints.find(x => x.id === id); if (c) { createNotification(c.hospital.toLowerCase().replace(/\s+/g, ""), "resolved", `Issue Resolved & Verified: ${c.hospital}`, c.title, id, c.hospital).catch(() => {}); notifyUsers("resolved", `Issue Resolved & Verified: ${c.hospital}`, c.title, c.hospital, id, "admin").catch(() => {}); } await onRefresh(); };
  const handleRejectVerify = async (id) => { await rejectVerification(id); await insertComment(id, "", "admin", "Verification rejected — ticket reopened."); const c = complaints.find(x => x.id === id); if (c) { createNotification(c.hospital.toLowerCase().replace(/\s+/g, ""), "rejected", `Resolution Rejected: ${c.hospital}`, c.title, id, c.hospital).catch(() => {}); notifyUsers("rejected", `Resolution Rejected: ${c.hospital}`, c.title, c.hospital, id, "admin").catch(() => {}); } await onRefresh(); };
  const handleDelete = async (id) => { await deleteComplaint(id); await onRefresh(); };
  const staffOptions = users.filter(u => u.role === "company" && (u.company_role === "engineer" || u.company_role === "technician" || u.company_role === "manager"));
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
  const adminCompressImage = (file) => new Promise((resolve) => {
    if (!file.type.startsWith("image/")) { resolve(file); return; }
    const img = new Image();
    const reader = new FileReader();
    reader.onload = e => { img.src = e.target.result; };
    img.onload = () => {
      const maxDim = 1600;
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        if (width > height) { height = Math.round(height * maxDim / width); width = maxDim; }
        else { width = Math.round(width * maxDim / height); height = maxDim; }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      canvas.toBlob(blob => {
        resolve(new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" }));
      }, "image/jpeg", 0.75);
    };
    reader.readAsDataURL(file);
  });

  const adminDoUpload = async (complaintId, fileList) => {
    for (const rawFile of fileList) {
      try {
        const file = await adminCompressImage(rawFile);
        const base64Data = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result.split(",")[1]);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        const res = await fetch("/api/attachment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ complaintId, fileName: file.name, contentType: file.type, base64Data })
        });
        const data = await res.json();
        if (!res.ok) console.error("Upload error:", data.error);
      } catch (e) { console.error("Upload failed:", e); }
    }
  };

  const submitAdminComplaint = async () => { if (!adminTitle.trim() || !adminDesc.trim() || adminSubmitting) return; setAdminSubmitting(true); const savedFiles = [...adminFiles]; const sev = adminSeverity || getDefaultSeverity(adminTitle.trim()); const encodedDesc = encodeSerials(adminDesc.trim(), adminSerials); const r = await insertComplaint(adminHospital, adminTitle.trim(), encodedDesc, adminDate || null, null, sev); if (r) { if (savedFiles.length > 0) await adminDoUpload(r.id, savedFiles); notifyUsers("new_complaint", `New Complaint: ${adminHospital}`, adminTitle.trim(), adminHospital, r.id, user.id).catch(() => {}); setAdminTitle(""); setAdminDesc(""); setAdminDate(""); setAdminFiles([]); setAdminSeverity(""); setAdminSerials([]); setAdminSuccess(true); setTimeout(() => setAdminSuccess(false), 2500); await onRefresh(); } setAdminSubmitting(false); };
  const handleAddUser = async () => {
    if (!newUserName.trim() || !newUserPw.trim() || addingUser) return;
    if (newUserPw.trim().length < 8) { alert("Password must be at least 8 characters"); return; }
    setAddingUser(true);
    const autoId = newUserName.trim().toLowerCase().replace(/\s+/g, "");
    const created = await createUser(autoId, newUserName.trim(), "company", newUserPw.trim(), newUserCompany, newUserEmail.trim() || null, newUserCompanyRole);
    setAddingUser(false);
    if (!created) return;
    setNewUserName(""); setNewUserId(""); setNewUserPw(""); setNewUserEmail(""); await onRefresh();
  };
  const handleDeleteUser = async (id) => { if (window.confirm("Delete this user?")) { await deleteUser(id); await onRefresh(); } };

  const hospitalUsers = users.filter(u => u.role === "hospital");
  const companyUsers = users.filter(u => u.role === "company" || u.role === "admin");
  const companyGroups = ["Amex", "Novair", "Intexim", "Z-Corps", "UNDP", "CMU", "Global Fund"];
  const emailGroupOptions = ["Novair", "Intexim", "Z-Corps", "Amex", "UNDP"];

  const filteredCompanyUsers = searchTerm ? companyUsers.filter(u => u.name.toLowerCase().includes(searchTerm.toLowerCase()) || (u.company || "").toLowerCase().includes(searchTerm.toLowerCase()) || (u.email || "").toLowerCase().includes(searchTerm.toLowerCase())) : companyUsers;

  const adminFuncCount = ALL_HOSPITALS.filter(h => isFunctional(h, complaints, siteNotes)).length;
  const adminResolved = complaints.filter(c => isClosedStatus(c.status)).length;

  const NAV_ITEMS = [
    { id: "dashboard", icon: "dashboard", label: "Dashboard" },
    { id: "sites", icon: "sites", label: "Site Status" },
    { id: "equipment", icon: "equipment", label: "Equipment" },
    { id: "tickets", icon: "tickets", label: "Tickets" },
    { id: "submit", icon: "submit", label: "Submit" },
    { id: "maintenance", icon: "maintenance", label: "Maintenance" },
    { id: "analytics", icon: "analytics", label: "Analytics" },
  ];
  const NAV_BOTTOM = [
    { id: "users", icon: "users", label: "Users" },
    { id: "emails", icon: "emails", label: "Emails" },
  ];

  const PAGE_TITLES = {
    dashboard: "Dashboard", sites: "Site Status", equipment: "Equipment", tickets: "Tickets", submit: "Submit Ticket",
    maintenance: "Maintenance", analytics: "Analytics", users: "Users", emails: "Emails"
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <style>{`
        .sb-item:hover { background: rgba(94,234,212,0.06) !important; }
        .sb-item:hover span { color: rgba(255,255,255,0.85) !important; }
        
        
        
        .tb-glass:hover { background: rgba(255,255,255,0.12) !important; border-color: rgba(255,255,255,0.25) !important; }
        @keyframes refresh-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .spinning { animation: refresh-spin 0.7s linear infinite; transform-origin: center; }
        @media (max-width: 768px) {
          .sidebar-nav { display: none !important; }
          .main-area { margin-left: 0 !important; }
        }
      `}</style>
      <SidebarNav items={NAV_ITEMS} bottomItems={NAV_BOTTOM} active={tab} onSelect={(t) => { setTab(t); setSelected(null); }} />
      <div className="main-area" style={{ flex: 1, marginLeft: 180, background: "#f7f8fa", minHeight: "100vh" }}>
        <TopBar title="PSA Oxygen Plants" subtitle={`${PAGE_TITLES[tab] || "Dashboard"} · ${ALL_HOSPITALS.length} sites`} user={user} onRefresh={handleRefresh} onLogout={onLogout} refreshing={refreshing}>
          <NotificationBell user={user} onFocusComplaint={handleNotifFocus} onNavigate={(h) => { setTab("tickets"); setSelected(h); }} complaints={complaints} light={true} />
        </TopBar>
        <main style={{ maxWidth: 1060, margin: "0 auto", padding: "28px 32px" }}>
          <div key={tab} className="scale-in">
          {tab === "dashboard" && <HomeTab hospitals={ALL_HOSPITALS} groups={GROUPS} complaints={complaints} siteNotes={siteNotes} onViewSite={(h) => { setTab("tickets"); setSelected(h); }} user={user} />}
          {tab === "sites" && <OverviewTab hospitals={ALL_HOSPITALS} complaints={complaints} siteNotes={siteNotes} notifEmails={notifEmails} isAdmin={true} onRefresh={onRefresh} onViewSite={(h) => { setTab("tickets"); setSelected(h); }} />}
          {tab === "equipment" && <EquipmentTab hospitals={ALL_HOSPITALS} complaints={complaints} siteNotes={siteNotes} isAdmin={true} onRefresh={onRefresh} />}
          {tab === "tickets" && !selected && (<>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
              <button style={styles.tabActionBtn} onClick={() => downloadCSV(complaints, "All Tickets Data")}>↓ Download Data</button>
            </div>
            <GroupedHospitalList groups={GROUPS} complaints={complaints} siteNotes={siteNotes} onSelect={setSelected} />
          </>)}
          {tab === "tickets" && selected && (<ComplaintListView hospital={selected} complaints={complaints} currentUser={user} canComment={true} isAdmin={true} onBack={() => setSelected(null)} onAssign={handleAssign} onLogVisit={handleLogVisit} onMarkResolved={handleMarkResolved} onVerify={handleVerify} onRejectVerify={handleRejectVerify} onDelete={handleDelete} onRefresh={onRefresh} staffOptions={staffOptions} focusInfo={pendingFocus} />)}
          {tab === "submit" && (
            <section style={{ maxWidth: 640, margin: "0 auto" }}>
              <div style={{ background: C.white, borderRadius: 16, border: `1px solid ${C.tealLight}`, boxShadow: "0 4px 16px rgba(15,118,110,0.08)", overflow: "hidden" }}>
                <div style={{ background: "linear-gradient(120deg, #0b3b38 0%, #0f766e 55%, #0d9488 100%)", padding: "18px 22px" }}>
                  <div style={{ fontSize: 11, letterSpacing: 1.4, opacity: 0.85, fontWeight: 700, textTransform: "uppercase", color: "#fff" }}>New Ticket</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: "#fff", marginTop: 2 }}>Submit on Behalf of a Hospital</div>
                </div>
                <div style={{ padding: 22 }}>
                  <label style={styles.fieldLabel}>Hospital</label>
                  <select style={{ ...styles.tealInput, cursor: "pointer" }} value={adminHospital} onChange={e => { const h = e.target.value; setAdminHospital(h); const opts = serialOptionsFor(h, adminTitle); if (opts.length === 1) { setAdminSerials([opts[0].serial]); } else { setAdminSerials([]); } }}>{ALL_HOSPITALS.map(h => <option key={h} value={h}>{h}</option>)}</select>
                  <label style={styles.fieldLabel}>Issue Type</label>
                  <ComplaintTypeSelect value={adminTitle} onChange={e => { const t = e.target.value; setAdminTitle(t); setAdminSeverity(getDefaultSeverity(t)); const opts = serialOptionsFor(adminHospital, t); if (opts.length === 1) { setAdminSerials([opts[0].serial]); } else { setAdminSerials([]); } }} style={styles.tealInput} />
                  <SerialPicker hospital={adminHospital} complaintType={adminTitle} selected={adminSerials} onChange={setAdminSerials} />
                  <label style={styles.fieldLabel}>Description</label>
                  <textarea style={{ ...styles.tealInput, minHeight: 100, resize: "vertical", fontFamily: "inherit" }} placeholder="Describe the issue…" value={adminDesc} onChange={e => setAdminDesc(e.target.value)} />
                  <label style={styles.fieldLabel}>Date (leave empty for today)</label>
                  <input style={styles.tealInput} type="date" value={adminDate} onChange={e => setAdminDate(e.target.value)} />
                  <label style={styles.fieldLabel}>Attachments (optional)</label>
                  <label style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "14px", border: `1.5px dashed ${C.teal}`, borderRadius: 12, background: C.tealBg, color: C.tealDark, fontSize: 13.5, fontWeight: 600, cursor: "pointer", marginBottom: 12 }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.tealDark} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                    Add photos or PDF
                    <input type="file" accept="image/*,application/pdf" multiple style={{ display: "none" }} onChange={e => setAdminFiles(prev => [...prev, ...Array.from(e.target.files)])} />
                  </label>
                  {adminFiles.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
                      {adminFiles.map((f, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, background: C.tealBg, border: `1px solid ${C.tealLight}`, borderRadius: 10, padding: "6px 10px", fontSize: 12, color: C.tealDark }}>
                          <span style={{ maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                          <span style={{ cursor: "pointer", fontWeight: 700, color: C.red }} onClick={() => setAdminFiles(prev => prev.filter((_, idx) => idx !== i))}>✕</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <button style={{ width: "100%", padding: "14px 0", fontSize: 14, fontWeight: 700, color: "#fff", background: (!adminTitle.trim() || !adminDesc.trim() || adminSubmitting) ? "#9db8b4" : C.teal, border: "none", borderRadius: 12, cursor: (!adminTitle.trim() || !adminDesc.trim() || adminSubmitting) ? "not-allowed" : "pointer", letterSpacing: 0.5, textTransform: "uppercase", boxShadow: (!adminTitle.trim() || !adminDesc.trim() || adminSubmitting) ? "none" : "0 4px 12px rgba(13,148,136,0.3)" }} onClick={submitAdminComplaint} disabled={!adminTitle.trim() || !adminDesc.trim() || adminSubmitting}>{adminSubmitting ? "Submitting…" : "Submit Ticket"}</button>
                  {adminSuccess && (
                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14, padding: "14px 16px", background: "#e6f7ee", border: "1px solid #a7e3c4", borderRadius: 12 }}>
                      <div style={{ width: 30, height: 30, borderRadius: "50%", background: "#27ae60", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                      </div>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: "#166534" }}>Ticket submitted for {adminHospital}</div>
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}
          {tab === "maintenance" && <MaintenancePage />}
          {tab === "analytics" && <AnalyticsPage />}
          {tab === "users" && (<>
          {/* Add User Form */}
          <div style={styles.formSection}>
            <h2 style={styles.sectionTitle}>Add New User</h2>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
              <div style={{ flex: 1, minWidth: 140 }}><label style={{ fontSize: 11, color: C.textLight, display: "block", marginBottom: 2 }}>Full Name</label><input style={{ ...styles.pwInput, width: "100%", padding: "8px 10px" }} placeholder="Full Name" value={newUserName} onChange={e => { setNewUserName(e.target.value); setNewUserId(e.target.value.trim().toLowerCase().replace(/\s+/g, "")); }} /></div>
              <div style={{ minWidth: 120 }}><label style={{ fontSize: 11, color: C.textLight, display: "block", marginBottom: 2 }}>Organization</label><select style={{ ...styles.pwInput, width: "100%", padding: "8px 10px" }} value={newUserCompany} onChange={e => setNewUserCompany(e.target.value)}>{companyGroups.map(g => <option key={g} value={g}>{g}</option>)}</select></div>
              <div style={{ minWidth: 110 }}><label style={{ fontSize: 11, color: C.textLight, display: "block", marginBottom: 2 }}>Account Type</label><select style={{ ...styles.pwInput, width: "100%", padding: "8px 10px" }} value={newUserCompanyRole} onChange={e => setNewUserCompanyRole(e.target.value)}><option value="manager">Manager</option><option value="engineer">Engineer</option><option value="technician">Technician</option></select></div>
              <div style={{ flex: 1, minWidth: 140 }}><label style={{ fontSize: 11, color: C.textLight, display: "block", marginBottom: 2 }}>Email (optional)</label><input style={{ ...styles.pwInput, width: "100%", padding: "8px 10px" }} type="email" placeholder="email@company.com" value={newUserEmail} onChange={e => setNewUserEmail(e.target.value)} /></div>
              <div style={{ flex: 1, minWidth: 120 }}><label style={{ fontSize: 11, color: C.textLight, display: "block", marginBottom: 2 }}>Password</label><input style={{ ...styles.pwInput, width: "100%", padding: "8px 10px" }} type="password" placeholder="Min 8 chars" value={newUserPw} onChange={e => setNewUserPw(e.target.value)} /></div>
              <button style={styles.pwSaveBtn} onClick={handleAddUser}>{addingUser ? "…" : "Add"}</button>
            </div>
          </div>

          {/* Search */}
          <div style={{ marginBottom: 16, display: "flex", gap: 12, alignItems: "center" }}>
            <h2 style={{ ...styles.sectionTitle, margin: 0 }}>Accounts</h2>
            <input style={{ ...styles.pwInput, width: 200, padding: "6px 10px", fontSize: 12 }} placeholder="Search users..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          </div>

          {/* Admin account */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ ...styles.groupHeader, borderBottom: `1px solid ${C.tealLight}`, marginBottom: 10, paddingBottom: 8 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0, letterSpacing: 0.5, textTransform: "uppercase" }}>Admin</h3>
            </div>
            {companyUsers.filter(u => u.role === "admin").map(u => (
              <div key={u.id} style={{ ...styles.pwCard, marginBottom: 4 }}>
                <div style={styles.pwRow}>
                  <div><strong style={styles.pwName}>{u.name}</strong><span style={styles.pwRole}>Admin</span></div>
                  <div style={styles.pwRight}>
                    {editingUser === u.id ? (<div style={styles.pwEditRow}><input style={styles.pwInput} type="password" placeholder="New password (min 8)" value={newPw} onChange={e => setNewPw(e.target.value)} onKeyDown={e => e.key === "Enter" && handlePasswordChange(u.id)} /><button style={styles.pwSaveBtn} onClick={() => handlePasswordChange(u.id)}>{saving ? "…" : "Save"}</button><button style={styles.pwCancelBtn} onClick={() => { setEditingUser(null); setNewPw(""); }}>✕</button></div>) : (<button style={styles.pwChangeBtn} onClick={() => { setEditingUser(u.id); setNewPw(""); }}>Password</button>)}
                  </div>
                </div>
                {pwSuccess === u.id && <p style={styles.successMsg}>Password updated.</p>}
              </div>
            ))}
          </div>

          {/* Companies: Amex, Novair, Intexim, Z-Corps */}
          {["Amex", "Novair", "Intexim", "Z-Corps"].map(company => {
            const masterIds = { "Amex": "amex", "Novair": "novair", "Intexim": "intexim", "Z-Corps": "zcorps" };
            const masterId = masterIds[company];
            const masterUser = companyUsers.find(u => u.id === masterId || u.name === company);
            const indivUsers = filteredCompanyUsers.filter(u => u.company === company && u.id !== masterId);
            if (!masterUser && indivUsers.length === 0) return null;
            return (
              <div key={company} style={{ marginBottom: 24 }}>
                <div style={{ ...styles.groupHeader, borderBottom: `1px solid ${C.tealLight}`, marginBottom: 10, paddingBottom: 8 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0, letterSpacing: 0.5, textTransform: "uppercase" }}>{company} <span style={{ fontSize: 10, fontWeight: 400, color: C.textLight, letterSpacing: 1 }}>— COMPANY</span></h3>
                  <span style={{ fontSize: 11, color: C.textLight }}>{(masterUser ? 1 : 0) + indivUsers.length} account(s)</span>
                </div>
                {masterUser && (
                  <div style={{ ...styles.pwCard, marginBottom: 4 }}>
                    <div style={styles.pwRow}>
                      <div><strong style={styles.pwName}>{masterUser.name}</strong><span style={styles.pwRole}>Master</span>{masterUser.email && <span style={{ fontSize: 11, color: C.textLight, marginLeft: 8 }}>{masterUser.email}</span>}</div>
                      <div style={styles.pwRight}>
                        {editingUser === masterUser.id ? (<div style={styles.pwEditRow}><input style={styles.pwInput} type="password" placeholder="New password (min 8)" value={newPw} onChange={e => setNewPw(e.target.value)} onKeyDown={e => e.key === "Enter" && handlePasswordChange(masterUser.id)} /><button style={styles.pwSaveBtn} onClick={() => handlePasswordChange(masterUser.id)}>{saving ? "…" : "Save"}</button><button style={styles.pwCancelBtn} onClick={() => { setEditingUser(null); setNewPw(""); }}>✕</button></div>) : (<button style={styles.pwChangeBtn} onClick={() => { setEditingUser(masterUser.id); setNewPw(""); }}>Password</button>)}
                      </div>
                    </div>
                    {pwSuccess === masterUser.id && <p style={styles.successMsg}>Password updated.</p>}
                  </div>
                )}
                {indivUsers.map(u => (
                  <div key={u.id} style={{ ...styles.pwCard, marginBottom: 4 }}>
                    <div style={styles.pwRow}>
                      <div style={{ flex: 1 }}>
                        <strong style={styles.pwName}>{u.name}</strong>
                        {u.company && <span style={{ fontSize: 11.5, color: C.textMid, marginLeft: 4 }}>— {u.company}</span>}
                        {u.company_role && <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: u.company_role === "manager" ? "#0f766e" : C.textLight, background: u.company_role === "manager" ? "#ccfbf1" : "#f0f0f0", borderRadius: 8, padding: "2px 8px", marginLeft: 8 }}>{u.company_role}</span>}
                        {u.email && <span style={{ fontSize: 11, color: C.textLight, marginLeft: 8 }}>{u.email}</span>}
                      </div>
                      <div style={styles.pwRight}>
                        {editingUser === u.id ? (<div style={styles.pwEditRow}><input style={styles.pwInput} type="password" placeholder="New password (min 8)" value={newPw} onChange={e => setNewPw(e.target.value)} onKeyDown={e => e.key === "Enter" && handlePasswordChange(u.id)} /><button style={styles.pwSaveBtn} onClick={() => handlePasswordChange(u.id)}>{saving ? "…" : "Save"}</button><button style={styles.pwCancelBtn} onClick={() => { setEditingUser(null); setNewPw(""); }}>✕</button></div>) : (<button style={styles.pwChangeBtn} onClick={() => { setEditingUser(u.id); setNewPw(""); }}>Password</button>)}
                        <button style={{ fontSize: 11, color: C.red, background: "none", border: "none", cursor: "pointer" }} onClick={() => handleDeleteUser(u.id)}>Delete</button>
                      </div>
                    </div>
                    {pwSuccess === u.id && <p style={styles.successMsg}>Password updated.</p>}
                  </div>
                ))}
              </div>
            );
          })}

          {/* Viewers: UNDP, CMU, Global Fund */}
          {["UNDP", "CMU", "Global Fund"].map(company => {
            const masterIds = { "UNDP": "undp", "CMU": "cmu", "Global Fund": "globalfund" };
            const masterId = masterIds[company];
            const masterUser = companyUsers.find(u => u.id === masterId || u.name === company);
            const indivUsers = filteredCompanyUsers.filter(u => u.company === company && u.id !== masterId);
            if (!masterUser && indivUsers.length === 0) return null;
            return (
              <div key={company} style={{ marginBottom: 24 }}>
                <div style={{ ...styles.groupHeader, borderBottom: `1px solid ${C.tealLight}`, marginBottom: 10, paddingBottom: 8 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0, letterSpacing: 0.5, textTransform: "uppercase" }}>{company} <span style={{ fontSize: 10, fontWeight: 400, color: C.textLight, letterSpacing: 1 }}>— VIEWER</span></h3>
                  <span style={{ fontSize: 11, color: C.textLight }}>{(masterUser ? 1 : 0) + indivUsers.length} account(s)</span>
                </div>
                {masterUser && (
                  <div style={{ ...styles.pwCard, marginBottom: 4 }}>
                    <div style={styles.pwRow}>
                      <div><strong style={styles.pwName}>{masterUser.name}</strong><span style={styles.pwRole}>Master</span>{masterUser.email && <span style={{ fontSize: 11, color: C.textLight, marginLeft: 8 }}>{masterUser.email}</span>}</div>
                      <div style={styles.pwRight}>
                        {editingUser === masterUser.id ? (<div style={styles.pwEditRow}><input style={styles.pwInput} type="password" placeholder="New password (min 8)" value={newPw} onChange={e => setNewPw(e.target.value)} onKeyDown={e => e.key === "Enter" && handlePasswordChange(masterUser.id)} /><button style={styles.pwSaveBtn} onClick={() => handlePasswordChange(masterUser.id)}>{saving ? "…" : "Save"}</button><button style={styles.pwCancelBtn} onClick={() => { setEditingUser(null); setNewPw(""); }}>✕</button></div>) : (<button style={styles.pwChangeBtn} onClick={() => { setEditingUser(masterUser.id); setNewPw(""); }}>Password</button>)}
                      </div>
                    </div>
                    {pwSuccess === masterUser.id && <p style={styles.successMsg}>Password updated.</p>}
                  </div>
                )}
                {indivUsers.map(u => (
                  <div key={u.id} style={{ ...styles.pwCard, marginBottom: 4 }}>
                    <div style={styles.pwRow}>
                      <div style={{ flex: 1 }}>
                        <strong style={styles.pwName}>{u.name}</strong>
                        {u.company && <span style={{ fontSize: 11.5, color: C.textMid, marginLeft: 4 }}>— {u.company}</span>}
                        {u.company_role && <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: u.company_role === "manager" ? "#0f766e" : C.textLight, background: u.company_role === "manager" ? "#ccfbf1" : "#f0f0f0", borderRadius: 8, padding: "2px 8px", marginLeft: 8 }}>{u.company_role}</span>}
                        {u.email && <span style={{ fontSize: 11, color: C.textLight, marginLeft: 8 }}>{u.email}</span>}
                      </div>
                      <div style={styles.pwRight}>
                        {editingUser === u.id ? (<div style={styles.pwEditRow}><input style={styles.pwInput} type="password" placeholder="New password (min 8)" value={newPw} onChange={e => setNewPw(e.target.value)} onKeyDown={e => e.key === "Enter" && handlePasswordChange(u.id)} /><button style={styles.pwSaveBtn} onClick={() => handlePasswordChange(u.id)}>{saving ? "…" : "Save"}</button><button style={styles.pwCancelBtn} onClick={() => { setEditingUser(null); setNewPw(""); }}>✕</button></div>) : (<button style={styles.pwChangeBtn} onClick={() => { setEditingUser(u.id); setNewPw(""); }}>Password</button>)}
                        <button style={{ fontSize: 11, color: C.red, background: "none", border: "none", cursor: "pointer" }} onClick={() => handleDeleteUser(u.id)}>Delete</button>
                      </div>
                    </div>
                    {pwSuccess === u.id && <p style={styles.successMsg}>Password updated.</p>}
                  </div>
                ))}
              </div>
            );
          })}

          {/* Hospital accounts by provider */}
          {Object.entries(GROUPS).map(([provider, hospitals]) => (<div key={provider} style={{ marginTop: 24 }}>
            <div style={{ ...styles.groupHeader, borderBottom: `1px solid ${C.tealLight}`, marginBottom: 10, paddingBottom: 8 }}><h3 style={{ fontSize: 14, fontWeight: 600, margin: 0, letterSpacing: 0.5, textTransform: "uppercase" }}>{provider} — Hospitals</h3></div>
            {hospitalUsers.filter(u => hospitals.some(h => h.toLowerCase().replace(/\s+/g, "") === u.id.toLowerCase().replace(/\s+/g, ""))).map(u => (<div key={u.id} style={{ ...styles.pwCard, marginBottom: 4 }}><div style={styles.pwRow}><div><strong style={styles.pwName}>{u.name}</strong></div><div style={styles.pwRight}>{editingUser === u.id ? (<div style={styles.pwEditRow}><input style={styles.pwInput} type="password" placeholder="New password (min 8)" value={newPw} onChange={e => setNewPw(e.target.value)} onKeyDown={e => e.key === "Enter" && handlePasswordChange(u.id)} /><button style={styles.pwSaveBtn} onClick={() => handlePasswordChange(u.id)}>{saving ? "…" : "Save"}</button><button style={styles.pwCancelBtn} onClick={() => { setEditingUser(null); setNewPw(""); }}>✕</button></div>) : (<button style={styles.pwChangeBtn} onClick={() => { setEditingUser(u.id); setNewPw(""); }}>Password</button>)}<button style={{ fontSize: 11, color: C.red, background: "none", border: "none", cursor: "pointer" }} onClick={() => handleDeleteUser(u.id)}>Delete</button></div></div>{pwSuccess === u.id && <p style={styles.successMsg}>Password updated.</p>}</div>))}
          </div>))}
        </>)}
        {tab === "emails" && (<>
          <h2 style={styles.sectionTitle}>Email Notifications</h2><p style={{ fontSize: 14, color: "#4a5568", marginBottom: 20, lineHeight: 1.5 }}>When a complaint is submitted, emails go to that hospital&apos;s service-provider group plus Amex and UNDP (via Resend / <code>RESEND_API_KEY</code>). Shutdown emails are sent manually from the Overview tab.</p>
          <div style={styles.formSection}><h3 style={{ fontSize: 15, fontWeight: 600, color: "#1a2332", margin: "0 0 12px" }}>Add Email</h3><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><select style={{ ...styles.pwInput, width: 150, padding: "8px 10px" }} value={emailGroup} onChange={e => setEmailGroup(e.target.value)}>{emailGroupOptions.map(g => <option key={g} value={g}>{g}</option>)}</select><input style={{ ...styles.pwInput, flex: 1, minWidth: 200, padding: "8px 10px" }} type="email" placeholder="email@example.com" value={newEmail} onChange={e => setNewEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && handleAddEmail()} /><button style={styles.pwSaveBtn} onClick={handleAddEmail}>{emailSaving ? "…" : "Add"}</button></div></div>
          {emailGroupOptions.map(g => { const ge = notifEmails.filter(e => e.group_name === g); if (!ge.length) return null; return (<div key={g} style={{ marginTop: 20 }}><h3 style={{ fontSize: 15, fontWeight: 600, color: "#0e7c6b", margin: "0 0 10px" }}>{g}</h3>{ge.map(e => (<div key={e.id} style={{ ...styles.pwCard, display: "flex", justifyContent: "space-between", alignItems: "center" }}><span style={{ fontSize: 14, color: "#1a2332" }}>{e.email}</span><button style={{ ...styles.pwCancelBtn, color: "#e53e3e", fontSize: 14 }} onClick={() => handleDeleteEmail(e.id)}>Remove</button></div>))}</div>); })}
          {notifEmails.length === 0 && <p style={styles.empty}>No notification emails configured yet.</p>}
          <div style={{ marginTop: 32, paddingTop: 20, borderTop: `1px solid ${C.border}` }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: C.black, margin: "0 0 8px" }}>Reset Notifications</h3>
            <p style={{ fontSize: 13, color: C.textLight, marginBottom: 12 }}>Delete all notification records for all users. Use before launch to clear test data.</p>
            <button style={{ ...styles.deleteBtn, fontSize: 12 }} onClick={async () => { if (window.confirm("Delete ALL notifications for ALL users? This cannot be undone.")) { await dbWrite({ action: "reset_all_notifications" }); alert("All notifications cleared."); } }}>RESET ALL NOTIFICATIONS</button>
          </div>
        </>)}
        </div>
      </main>
      <PartnerFooter />
    </div>
  </div>
  );
}

/* ─── Company Dashboard (Sidebar Layout) ─── */
function CompanyDashboard({ user, users, complaints, siteNotes, onRefresh, onLogout }) {
  const [tab, setTab] = useState("dashboard"); const [selected, setSelected] = useState(null); const [refreshing, setRefreshing] = useState(false);
  const [pendingFocus, setPendingFocus] = useState(null);
  const handleNotifFocus = (info) => {
    setTab("tickets");
    setSelected(info.hospital);
    setPendingFocus({ complaintId: info.complaintId, isComment: info.isComment, commentText: info.commentText });
  };
  const companyName = user.company || user.name;
  const seesAll = ["Novair", "Amex", "UNDP", "CMU", "Global Fund"].includes(companyName);
  const isAmex = companyName === "Amex";
  const isProvider = ["Novair", "Intexim", "Z-Corps"].includes(companyName);
  const myGroups = {}; if (seesAll) { Object.assign(myGroups, GROUPS); } else if (GROUPS[companyName]) { myGroups[companyName] = GROUPS[companyName]; } else { Object.assign(myGroups, GROUPS); }
  const myHospitals = Object.values(myGroups).flat();
  const myComplaints = complaints.filter(c => myHospitals.includes(c.hospital));
  const totalComplaints = myComplaints.length; const totalOpen = myComplaints.filter(c => !isClosedStatus(c.status)).length;
  const canCommentOnHospital = (hospital) => { if (["Novair", "Amex"].includes(companyName)) return true; if (isProvider && getProvider(hospital) === companyName) return true; return false; };
  const handleRefresh = async () => { setRefreshing(true); await onRefresh(); setRefreshing(false); };
  const notifyTarget = (user.company || user.name || "").toLowerCase().replace(/[\s-]+/g, "");
  const handleAssign = async (id, assignedTo) => { await assignComplaint(id, assignedTo, user.name); const c = complaints.find(x => x.id === id); if (c) notifyUsers("assigned", `Ticket Assigned: ${c.hospital}`, `${c.title} — assigned to ${assignedTo}`, c.hospital, id, notifyTarget).catch(() => {}); await onRefresh(); };
  const handleLogVisit = async (id, visitDate) => { await logVisit(id, visitDate, user.name); await onRefresh(); };
  const handleMarkResolved = async (id) => { await markResolved(id, user.name); const c = complaints.find(x => x.id === id); if (c) { createNotification("amex", "resolved", `Ready for Verification: ${c.hospital}`, c.title, id, c.hospital).catch(() => {}); notifyUsers("resolved", `Ready for Verification: ${c.hospital}`, c.title, c.hospital, id, notifyTarget).catch(() => {}); } await onRefresh(); };
  const handleVerify = async (id) => { await verifyComplaint(id, user.name); const c = complaints.find(x => x.id === id); if (c) { createNotification(c.hospital.toLowerCase().replace(/\s+/g, ""), "resolved", `Issue Resolved & Verified: ${c.hospital}`, c.title, id, c.hospital).catch(() => {}); notifyUsers("resolved", `Issue Resolved & Verified: ${c.hospital}`, c.title, c.hospital, id, notifyTarget).catch(() => {}); } await onRefresh(); };
  const handleRejectVerify = async (id) => { await rejectVerification(id); await insertComment(id, user.name, "company", "Verification rejected — ticket reopened."); const c = complaints.find(x => x.id === id); if (c) { createNotification(c.hospital.toLowerCase().replace(/\s+/g, ""), "rejected", `Resolution Rejected: ${c.hospital}`, c.title, id, c.hospital).catch(() => {}); notifyUsers("rejected", `Resolution Rejected: ${c.hospital}`, c.title, c.hospital, id, notifyTarget).catch(() => {}); } await onRefresh(); };
  const staffOptions = (users || []).filter(u => u.role === "company" && (u.company_role === "engineer" || u.company_role === "technician" || u.company_role === "manager"));
  const funcCount = myHospitals.filter(h => isFunctional(h, complaints, siteNotes)).length;

  const NAV_ITEMS = [
    { id: "dashboard", icon: "dashboard", label: "Dashboard" },
    { id: "sites", icon: "sites", label: "Site Status" },
    { id: "equipment", icon: "equipment", label: "Equipment" },
    { id: "tickets", icon: "tickets", label: "Tickets" },
    { id: "maintenance", icon: "maintenance", label: "Maintenance" },
    { id: "analytics", icon: "analytics", label: "Analytics" },
  ];

  const PAGE_TITLES = {
    dashboard: "Dashboard", sites: "Site Status", equipment: "Equipment", tickets: "Tickets",
    maintenance: "Maintenance", analytics: "Analytics"
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <style>{`
        .sb-item:hover { background: rgba(94,234,212,0.06) !important; }
        .sb-item:hover span { color: rgba(255,255,255,0.85) !important; }
        
        
        
        @keyframes refresh-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .spinning { animation: refresh-spin 0.7s linear infinite; transform-origin: center; }
        @media (max-width: 768px) {
          .sidebar-nav { display: none !important; }
          .main-area { margin-left: 0 !important; }
        }
      `}</style>
      <SidebarNav items={NAV_ITEMS} active={tab} onSelect={(t) => { setTab(t); setSelected(null); }} />
      <div className="main-area" style={{ flex: 1, marginLeft: 180, background: "#f7f8fa", minHeight: "100vh" }}>
        <TopBar title="PSA Oxygen Plants" subtitle={`${PAGE_TITLES[tab] || "Dashboard"} · ${myHospitals.length} sites`} user={user} onRefresh={handleRefresh} onLogout={onLogout} refreshing={refreshing}>
          <NotificationBell user={user} onFocusComplaint={handleNotifFocus} onNavigate={(h) => { setTab("tickets"); setSelected(h); }} complaints={complaints} light={true} />
        </TopBar>
        <main style={{ maxWidth: 1060, margin: "0 auto", padding: "28px 32px" }}>
          <div key={tab} className="scale-in">
          {tab === "dashboard" && <HomeTab hospitals={myHospitals} groups={myGroups} complaints={complaints} siteNotes={siteNotes} onViewSite={(h) => { setTab("tickets"); setSelected(h); }} user={user} />}
          {tab === "sites" && <OverviewTab hospitals={myHospitals} complaints={complaints} siteNotes={siteNotes} notifEmails={[]} isAdmin={false} onRefresh={onRefresh} onViewSite={(h) => { setTab("tickets"); setSelected(h); }} />}
          {tab === "equipment" && <EquipmentTab hospitals={myHospitals} complaints={complaints} siteNotes={siteNotes} isAdmin={false} onRefresh={onRefresh} />}
          {tab === "tickets" && !selected && (<>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
              <button style={styles.tabActionBtn} onClick={() => downloadCSV(myComplaints, "All Tickets Data")}>↓ Download Data</button>
            </div>
            <GroupedHospitalList groups={myGroups} complaints={complaints} siteNotes={siteNotes} onSelect={setSelected} />
          </>)}
          {tab === "tickets" && selected && (<ComplaintListView hospital={selected} complaints={complaints} currentUser={user} canComment={canCommentOnHospital(selected)} isAdmin={false} onBack={() => setSelected(null)} onAssign={handleAssign} onLogVisit={handleLogVisit} onMarkResolved={handleMarkResolved} onVerify={handleVerify} onRejectVerify={handleRejectVerify} onDelete={() => {}} onRefresh={onRefresh} staffOptions={staffOptions} focusInfo={pendingFocus} />)}
          {tab === "maintenance" && <MaintenancePage />}
          {tab === "analytics" && <AnalyticsPage />}
          </div>
        </main>
        <PartnerFooter />
      </div>
    </div>
  );
}
const C = { bg: "#f0f2f4", white: "#ffffff", black: "#111111", text: "#111111", textMid: "#555555", textLight: "#999999", border: "#d0d0d0", borderLight: "#e0e0e0", red: "#c0392b", green: "#27ae60", teal: "#0d9488", tealDark: "#0f766e", tealLight: "#ccfbf1", tealBg: "#f0fdfa" };
const styles = {
  formSectionTeal: { background: C.white, borderRadius: 18, padding: 28, marginBottom: 28, border: `1px solid ${C.borderLight}`, boxShadow: "0 4px 16px rgba(15,118,110,0.08)" },
  sectionTitleTeal: { fontSize: 18, fontWeight: 800, color: C.black, margin: "0 0 20px", letterSpacing: -0.2, borderLeft: `4px solid ${C.teal}`, paddingLeft: 12 },
  inputTeal: { display: "block", width: "100%", padding: "14px 16px", fontSize: 14, border: `1.5px solid ${C.borderLight}`, borderRadius: 12, marginBottom: 14, outline: "none", boxSizing: "border-box", color: C.text, background: C.white, fontFamily: "'DM Sans', system-ui, sans-serif" },
  inputTealSelect: { display: "block", width: "100%", padding: "14px 16px", fontSize: 14, border: `1.5px solid ${C.teal}`, borderRadius: 12, marginBottom: 14, outline: "none", boxSizing: "border-box", color: C.text, background: C.tealBg, fontFamily: "'DM Sans', system-ui, sans-serif", fontWeight: 600, cursor: "pointer" },
  btnTeal: { display: "block", width: "100%", padding: "15px 0", fontSize: 14, fontWeight: 700, color: C.white, background: C.teal, border: "none", borderRadius: 12, cursor: "pointer", letterSpacing: 1.2, textTransform: "uppercase", boxShadow: "0 4px 12px rgba(13,148,136,0.3)" },
  successMsgTeal: { color: C.teal, fontSize: 14, fontWeight: 700, marginTop: 12, textAlign: "center" },
  cardTeal: { background: C.white, borderRadius: 18, marginBottom: 16, overflow: "hidden", border: "1px solid #e3efec", boxShadow: "0 2px 6px rgba(15,23,25,0.05), 0 8px 24px rgba(15,118,110,0.08)" },
  btnTealSmall: { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: "#fff", background: C.teal, border: "none", borderRadius: 9, padding: "8px 15px", cursor: "pointer", boxShadow: "0 2px 6px rgba(13,148,136,0.2)", letterSpacing: 0.2 },

  loadWrap: { minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: C.bg, fontFamily: "'DM Sans', system-ui, sans-serif" },
  loadLogo: { fontSize: 56, fontWeight: 800, color: C.black, letterSpacing: -3 },
  loginBg: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(180deg, #062825 0%, #0f766e 80%, #14a89a 100%)", fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif', padding: 20 },
  loginCard: { background: C.white, borderRadius: 2, padding: "48px 40px", width: "100%", maxWidth: 420, border: `1px solid ${C.border}` },
  loginBrand: { display: "flex", alignItems: "center", gap: 10, marginBottom: 32 },
  brandMark: { fontSize: 32, fontWeight: 800, color: C.black, letterSpacing: -2 },
  brandText: { fontSize: 14, fontWeight: 400, color: C.textMid, letterSpacing: 1, textTransform: "uppercase" },
  loginTitle: { fontSize: 28, fontWeight: 300, color: C.black, margin: "0 0 4px", letterSpacing: -0.5 },
  loginSub: { fontSize: 14, color: C.textLight, margin: "0 0 28px" },
  input: { display: "block", width: "100%", padding: "12px 14px", fontSize: 14, border: `1.5px solid ${C.tealLight}`, borderRadius: 10, marginBottom: 14, outline: "none", boxSizing: "border-box", color: C.text, background: C.white, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' },
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
  formSection: { background: C.white, borderRadius: 16, padding: 28, marginBottom: 28, border: `1px solid ${C.tealLight}`, boxShadow: "0 4px 16px rgba(15,118,110,0.06)", fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' },
  listSection: { marginBottom: 28 },
  sectionTitle: { fontSize: 17, fontWeight: 800, color: C.tealDark, margin: "0 0 20px", letterSpacing: 0.3, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' },
  card: { background: C.white, borderRadius: 0, padding: "20px 24px", marginBottom: 12, border: `1px solid ${C.borderLight}` },
  cardTop: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 8, flexWrap: "wrap" },
  cardTitle: { fontSize: 15, fontWeight: 600, color: C.black },
  cardDate: { fontSize: 12, color: C.textLight, whiteSpace: "nowrap", marginTop: 2 },
  cardDesc: { fontSize: 13.5, color: "#5f6b7a", margin: 0, lineHeight: 1.65 },
  empty: { fontSize: 14, color: C.textLight, fontStyle: "italic" },
  successMsg: { color: C.green, fontSize: 14, fontWeight: 600, marginTop: 12, textAlign: "center" },
  statsBar: { display: "flex", gap: 32, marginBottom: 28, flexWrap: "wrap", justifyContent: "center" },
  statBox: { textAlign: "center" },
  statNum: { fontSize: 40, fontWeight: 300, color: C.black, letterSpacing: -1 },
  statLabel: { fontSize: 10, color: C.textLight, marginTop: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1.5 },
  hospitalGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 12 },
  hospitalBtn: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, width: "100%", padding: "16px 18px", background: C.white, border: `1px solid ${C.tealLight}`, borderRadius: 14, cursor: "pointer", textAlign: "left", boxShadow: "0 2px 8px rgba(15,118,110,0.06)", transition: "transform 0.15s, box-shadow 0.15s, border-color 0.15s" },
  hospitalName: { flex: 1, fontSize: 14.5, fontWeight: 600, color: C.black },
  hospitalBadge: { fontSize: 12, fontWeight: 700, color: C.tealDark, background: C.tealBg, border: `1px solid ${C.tealLight}`, borderRadius: 10, padding: "3px 11px" },
  openBadge: { fontSize: 11, fontWeight: 700, color: C.red, background: "#fbeaea", borderRadius: 10, padding: "3px 9px" },
  backBtn: { fontSize: 12, fontWeight: 600, color: C.tealDark, background: "none", border: "none", cursor: "pointer", padding: "0 0 16px", display: "block", letterSpacing: 0.5, textTransform: "uppercase" },
  resolveBtn: { fontSize: 12, fontWeight: 600, color: C.white, background: C.green, border: "none", borderRadius: 0, padding: "8px 20px", cursor: "pointer", letterSpacing: 0.5, textTransform: "uppercase" },
  deleteBtn: { fontSize: 12, fontWeight: 600, color: C.white, background: C.red, border: "none", borderRadius: 0, padding: "8px 20px", cursor: "pointer", letterSpacing: 0.5, textTransform: "uppercase" },
  groupSection: { marginBottom: 32 },
  groupHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 8, paddingBottom: 12, borderBottom: `1px solid ${C.tealLight}` },
  groupTitle: { fontSize: 15, fontWeight: 800, color: C.tealDark, margin: 0, letterSpacing: 0.8, textTransform: "uppercase" },
  groupBadge: { fontSize: 12, fontWeight: 600, color: C.textMid, background: C.white, borderRadius: 20, padding: "4px 14px", border: `1px solid ${C.tealLight}` },
  tabBar: { display: "flex", gap: 8, maxWidth: 980, margin: "0 auto", padding: "16px 24px 20px", flexWrap: "wrap", justifyContent: "center" },
  tabActive: { padding: "10px 24px", fontSize: 12, fontWeight: 700, color: C.white, background: C.teal, border: `1px solid ${C.teal}`, borderRadius: 10, cursor: "pointer", letterSpacing: 1, textTransform: "uppercase", boxShadow: "0 3px 8px rgba(13,148,136,0.25)" },
  tabInactive: { padding: "10px 24px", fontSize: 12, fontWeight: 600, color: C.tealDark, background: C.white, border: `1px solid ${C.tealLight}`, borderRadius: 10, cursor: "pointer", letterSpacing: 1, textTransform: "uppercase" },
  tabActionBtn: { padding: "10px 20px", fontSize: 12, fontWeight: 700, color: C.tealDark, background: C.tealBg, border: `1px solid ${C.tealLight}`, borderRadius: 10, cursor: "pointer", letterSpacing: 0.8, textTransform: "uppercase" },
  fieldLabel: { display: "block", fontSize: 12, fontWeight: 700, color: C.tealDark, marginBottom: 6, marginTop: 4, textTransform: "uppercase", letterSpacing: 0.5 },
  tealInput: { width: "100%", padding: "12px 14px", fontSize: 14, border: `1.5px solid ${C.tealLight}`, borderRadius: 10, outline: "none", boxSizing: "border-box", marginBottom: 14, background: "#fff", color: "#111", fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' },
  pwCard: { background: C.white, borderRadius: 12, padding: "14px 18px", marginBottom: 8, border: `1px solid ${C.tealLight}`, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' },
  pwRow: { display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 },
  pwName: { fontSize: 15, fontWeight: 600, color: C.black, marginRight: 8 },
  pwRole: { fontSize: 10, fontWeight: 700, color: C.white, background: C.teal, borderRadius: 20, padding: "3px 10px", letterSpacing: 1, textTransform: "uppercase" },
  pwRight: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" },
  pwCurrent: { fontSize: 13, color: C.textLight },
  pwChangeBtn: { fontSize: 12, fontWeight: 700, color: C.tealDark, background: C.tealBg, border: `1px solid ${C.tealLight}`, borderRadius: 8, padding: "6px 16px", cursor: "pointer", textTransform: "uppercase", letterSpacing: 0.3 },
  pwEditRow: { display: "flex", gap: 6, alignItems: "center" },
  pwInput: { padding: "9px 12px", fontSize: 13, border: `1.5px solid ${C.tealLight}`, borderRadius: 9, width: 140, outline: "none", fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' },
  pwSaveBtn: { fontSize: 12, fontWeight: 700, color: C.white, background: C.teal, border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer", letterSpacing: 0.5, textTransform: "uppercase" },
  pwCancelBtn: { fontSize: 13, color: C.textLight, background: "none", border: "none", cursor: "pointer", padding: "6px" },
  commentToggle: { fontSize: 12, fontWeight: 700, color: C.tealDark, background: "none", border: "none", cursor: "pointer", padding: 0, letterSpacing: 0.5, textTransform: "uppercase", fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' },
  commentBox: { marginTop: 10, padding: "16px 18px", background: C.tealBg, borderRadius: 12, border: `1px solid ${C.tealLight}`, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' },
  commentItem: { padding: "10px 0", borderBottom: `1px solid ${C.tealLight}` },
  commentHeader: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  commentInputRow: { display: "flex", gap: 8, marginTop: 12 },
  commentInput: { flex: 1, padding: "11px 14px", fontSize: 13, border: `1.5px solid ${C.tealLight}`, borderRadius: 10, outline: "none", background: C.white, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' },
  commentSendBtn: { fontSize: 12, fontWeight: 700, color: C.white, background: C.teal, border: "none", borderRadius: 10, padding: "10px 24px", cursor: "pointer", letterSpacing: 0.5, textTransform: "uppercase", boxShadow: "0 3px 8px rgba(13,148,136,0.25)" },
  overviewTable: { background: "linear-gradient(135deg, #edf7f4, #f2faf8)", borderRadius: 16, border: "1px solid #d5ece5", overflow: "auto", WebkitOverflowScrolling: "touch" },
  overviewHeaderRow: { display: "flex", padding: "0", background: "rgba(13,148,136,0.08)", borderBottom: "1px solid #d5ece5", fontWeight: 700, fontSize: 10.5, color: "#0f766e", gap: 0, minWidth: 900, letterSpacing: 1, textTransform: "uppercase", position: "sticky", top: 0, zIndex: 2 },
  overviewRow: { display: "flex", padding: "0", borderBottom: "1px solid #ddf0eb", gap: 0, alignItems: "stretch", minWidth: 900, transition: "background 0.15s" },
  ovCell: { padding: "16px 16px", fontSize: 13, display: "flex", flexDirection: "column", justifyContent: "center" },
  ovCellHeader: { padding: "13px 16px", fontSize: 10.5, display: "flex", alignItems: "center", justifyContent: "flex-start" },
  ovCellSr: { width: 40, flexShrink: 0, justifyContent: "center", alignItems: "center" },
  ovCellSite: { width: 160, flexShrink: 0 },
  ovCellProvider: { width: 100, flexShrink: 0 },
  ovCellStatus: { width: 140, flexShrink: 0, alignItems: "center", justifyContent: "flex-start" },
  ovCellOpen: { flex: 1, minWidth: 170 },
  ovCellNote: { flex: 1, minWidth: 170, borderRight: "none" },
};
