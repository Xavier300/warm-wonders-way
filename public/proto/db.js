// db.js — Supabase sync layer for the Official EcoBarangay HTML prototypes.
// Loaded as an ES module by signin.html, resident.html, ecobarangay.html.
// Mirrors DB rows into the localStorage keys the existing prototype code
// already reads, and pushes local mutations back through window.EB.*.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const SUPABASE_URL = 'https://woqlyjvotgzifrdpidfh.supabase.co';
const SUPABASE_KEY = 'sb_publishable_lnxcSpkHyDTxgpnZ1BReKA_cExyb4Dq';

const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storage: window.localStorage,
    storageKey: 'sb-eb-auth',
  },
});
window.supabase = sb;

const state = { session: null, profile: null, role: null, ready: false };

// ---------- helpers ----------
function fmtDate(d) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
}
function shortDate(d) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function safeSet(k, v) {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {}
  window.dispatchEvent(new StorageEvent('storage', { key: k, newValue: localStorage.getItem(k) }));
}
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

// ---------- session / auth ----------
async function loadSession() {
  const { data: { session } } = await sb.auth.getSession();
  state.session = session;
  if (!session) { state.profile = null; state.role = null; localStorage.removeItem('eb_auth'); return; }
  const [{ data: p }, { data: r }] = await Promise.all([
    sb.from('profiles').select('*').eq('id', session.user.id).maybeSingle(),
    sb.from('user_roles').select('role').eq('user_id', session.user.id),
  ]);
  state.profile = p || null;
  state.role = r?.[0]?.role || 'resident';
  const roleUi = state.role === 'resident' ? 'Resident' : 'Official';
  const zoneRaw = (p?.zone || '').trim();
  const zoneMobile = /^(Z1|Z2|Z3|Z4)$/i.test(zoneRaw) ? zoneRaw.toUpperCase() : 'Z1';
  safeSet('eb_auth', {
    userId: session.user.id,
    role: roleUi,
    dbRole: state.role,
    email: p?.email || session.user.email || '',
    name: p?.full_name || '',
    phone: p?.phone || '',
    zone: zoneMobile,
    zoneRaw,
    position: p?.position || '',
    points: p?.points || 0,
    tier: p?.tier || 'Bronze',
    status: p?.status || 'Active',
    at: Date.now(),
  });
}

async function signIn(email, password) {
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  await loadSession();
  return state;
}
async function signUp({ email, password, full_name, phone, zone, position, role }) {
  const meta = { full_name, phone, zone, position, role };
  const { error } = await sb.auth.signUp({
    email, password,
    options: { data: meta, emailRedirectTo: window.location.origin + '/proto/signin.html' },
  });
  if (error) throw error;
  // If email confirmation is on, no session yet; otherwise attempt sign-in.
  const { data: sess } = await sb.auth.getSession();
  if (!sess.session) {
    try { await sb.auth.signInWithPassword({ email, password }); } catch (_) {}
  }
  await loadSession();
  return state;
}
async function signInWithGoogle() {
  const { error } = await sb.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + '/proto/signin.html' },
  });
  if (error) throw error;
}
async function signOut() {
  try { await sb.auth.signOut(); } catch (_) {}
  ['eb_auth', 'eb_reports', 'eb_forms', 'eb_announcements', 'eb_users', 'eb_schedules', 'eb_logs', 'eb_ann_full']
    .forEach(k => localStorage.removeItem(k));
  location.href = '/proto/signin.html';
}

// ---------- hydration ----------
async function hydrateAll() {
  if (!state.session) return;
  const uid = state.session.user.id;
  const isAdmin = state.role !== 'resident';

  // Reports (RLS scopes for residents automatically)
  const { data: reports = [] } = await sb.from('reports')
    .select('*').order('created_at', { ascending: false });

  // Announcements
  const { data: ann = [] } = await sb.from('announcements')
    .select('*').order('created_at', { ascending: false });

  // Compliance forms
  const { data: forms = [] } = await sb.from('compliance_forms')
    .select('*').order('created_at', { ascending: false });

  // Schedules
  const { data: sched = [] } = await sb.from('schedules')
    .select('*').order('created_at', { ascending: false });

  // Profiles + roles (admin) — RLS lets admin/staff read all
  let profiles = [], roleRows = [];
  if (isAdmin) {
    const [pR, rR] = await Promise.all([
      sb.from('profiles').select('*'),
      sb.from('user_roles').select('user_id, role'),
    ]);
    profiles = pR.data || []; roleRows = rR.data || [];
  }

  // System logs (admin)
  let logs = [];
  if (isAdmin) {
    const { data } = await sb.from('system_logs')
      .select('*').order('created_at', { ascending: false }).limit(200);
    logs = data || [];
  }

  const currentEmail = state.profile?.email || state.session.user.email || '';

  // eb_reports (resident-shape used by both resident.html and admin normalizer)
  const residentReports = (reports || []).map(r => ({
    id: r.id,
    waste: (r.title && ['Bio','Recyc','Resid','Spec'].includes(r.title)) ? r.title : 'Bio',
    severity: r.severity === 'Med' ? 'Medium' : r.severity, // resident uses Medium
    location: r.location || '',
    description: r.description || '',
    status: r.status,
    createdAt: new Date(r.created_at).getTime(),
    when: r.created_at,
    reporter: currentEmail, // let existing myReports() filter match
    reporterId: r.reporter_id,
    reporterName: r.reporter_name || '',
    points: 10,
    _dbId: r.id,
  }));
  safeSet('eb_reports', residentReports);

  // eb_forms — same shape both sides use
  const residentForms = (forms || []).map(f => ({
    id: f.id,
    name: f.household_name || 'Household',
    reporter: currentEmail,
    reporterId: f.resident_id,
    address: f.household_address || '',
    date: f.missed_date,
    waste: f.waste_types || [],
    remarks: f.remarks || '',
    status: f.status === 'Under Review' ? 'Pending' : f.status,
    pct: f.pct ?? 75,
    createdAt: new Date(f.created_at).getTime(),
    _dbId: f.id,
  }));
  safeSet('eb_forms', residentForms);

  // eb_announcements (published only — used by resident Eco screen)
  const pubAnn = (ann || []).filter(a => a.status === 'Published').map(a => ({
    id: a.id,
    title: a.title,
    type: a.audience || '✅ Notice',
    msg: a.body || '',
    date: shortDate(a.published_at || a.created_at),
    waste: a.waste_types || [],
  }));
  safeSet('eb_announcements', pubAnn);

  // eb_ann_full (admin needs Draft/Scheduled too)
  const fullAnn = (ann || []).map(a => ({
    id: a.id,
    title: a.title,
    type: a.audience || '✅ Notice',
    msg: a.body || '',
    date: shortDate(a.scheduled_at || a.published_at || a.created_at),
    waste: a.waste_types || [],
    reach: 342,
    status: a.status,
    scheduled_at: a.scheduled_at,
  }));
  safeSet('eb_ann_full', fullAnn);

  // eb_schedules
  safeSet('eb_schedules', sched || []);

  // eb_users (admin only)
  if (isAdmin) {
    const roleMap = new Map(roleRows.map(r => [r.user_id, r.role]));
    const users = (profiles || []).map(p => {
      const dbRole = roleMap.get(p.id) || 'resident';
      const uiRole = dbRole === 'resident' ? 'Resident'
        : dbRole === 'collector' ? 'Collector'
        : dbRole === 'staff' ? 'Admin'
        : 'Admin';
      return {
        id: p.id,
        name: p.full_name || p.email || '(unknown)',
        email: p.email || '',
        role: uiRole,
        zone: p.zone || (dbRole === 'resident' ? 'Zone 1' : 'Office'),
        joined: fmtDate(p.created_at),
        last: 'Recent',
        status: p.status || 'Active',
        _dbId: p.id,
        _dbRole: dbRole,
      };
    });
    safeSet('eb_users', users);

    // eb_logs
    const uiLogs = (logs || []).map(l => ({
      id: l.id,
      ts: new Date(l.created_at),
      level: (l.level || 'INFO').charAt(0) + (l.level || 'INFO').slice(1).toLowerCase(),
      cat: l.category || 'System',
      user: (l.details && l.details.user) || 'system',
      action: l.action,
      ip: (l.details && l.details.ip) || '—',
    }));
    safeSet('eb_logs', uiLogs);
  }

  document.dispatchEvent(new CustomEvent('eb:data'));
}

// ---------- realtime ----------
function subscribeRealtime() {
  const refresh = debounce(hydrateAll, 300);
  sb.channel('eb-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'reports' }, refresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'compliance_forms' }, refresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'announcements' }, refresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'schedules' }, refresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, refresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'user_roles' }, refresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'system_logs' }, refresh)
    .subscribe();
}

// ---------- write API ----------
async function addReport({ waste, severity, location, description }) {
  const uid = state.session?.user?.id;
  const sev = severity === 'Medium' ? 'Med' : severity;
  const { data, error } = await sb.from('reports').insert({
    reporter_id: uid, title: waste, description, location, severity: sev, status: 'Pending',
  }).select().single();
  if (error) throw error;
  await hydrateAll();
  return data;
}
async function addComplianceForm({ address, date, waste, remarks, name }) {
  const uid = state.session?.user?.id;
  const { data, error } = await sb.from('compliance_forms').insert({
    resident_id: uid, household_address: address, missed_date: date,
    waste_types: waste, remarks, status: 'Under Review',
  }).select().single();
  if (error) throw error;
  await hydrateAll();
  await logAction({ level: 'INFO', category: 'Compliance', action: `Compliance form submitted by ${name || 'resident'}` });
  return data;
}
async function addAnnouncement(a) {
  const patch = {
    title: a.title, body: a.msg, waste_types: a.waste, audience: a.type,
    status: a.status,
    scheduled_at: a.status === 'Scheduled' ? (a.scheduled_at || null) : null,
    published_at: a.status === 'Published' ? new Date().toISOString() : null,
    created_by: state.session?.user?.id,
  };
  const { data, error } = await sb.from('announcements').insert(patch).select().single();
  if (error) throw error;
  await hydrateAll();
  await logAction({ level: 'INFO', category: 'Announcement', action: `Announcement created: ${a.title}` });
  return data;
}
async function updateAnnouncement(id, a) {
  const patch = { title: a.title, body: a.msg, waste_types: a.waste, audience: a.type, status: a.status };
  if (a.status === 'Published') patch.published_at = new Date().toISOString();
  const { error } = await sb.from('announcements').update(patch).eq('id', id);
  if (error) throw error;
  await hydrateAll();
}
async function deleteAnnouncement(id) {
  await sb.from('announcements').delete().eq('id', id);
  await hydrateAll();
}
async function publishAnnouncement(id) {
  await sb.from('announcements').update({ status: 'Published', published_at: new Date().toISOString() }).eq('id', id);
  await hydrateAll();
}
async function setReportStatus(id, status) {
  await sb.from('reports').update({
    status, reviewed_by: state.session?.user?.id, reviewed_at: new Date().toISOString(),
  }).eq('id', id);
  await hydrateAll();
  await logAction({ level: 'INFO', category: 'Report', action: `Report ${status.toLowerCase()}` });
}
async function deleteReport(id) {
  await sb.from('reports').delete().eq('id', id);
  await hydrateAll();
}
async function setCompStatus(id, status) {
  const dbStatus = status === 'Verified' ? 'Verified' : status === 'Rejected' ? 'Rejected' : 'Under Review';
  await sb.from('compliance_forms').update({
    status: dbStatus, reviewed_by: state.session?.user?.id, reviewed_at: new Date().toISOString(),
  }).eq('id', id);
  await hydrateAll();
}
async function deleteComp(id) {
  await sb.from('compliance_forms').delete().eq('id', id);
  await hydrateAll();
}

// User management
async function saveUserRow(id, changes) {
  const patch = {};
  if ('name' in changes) patch.full_name = changes.name;
  if ('zone' in changes) patch.zone = changes.zone;
  if ('status' in changes) patch.status = changes.status;
  if ('phone' in changes) patch.phone = changes.phone;
  if (Object.keys(patch).length) await sb.from('profiles').update(patch).eq('id', id);
  if (changes.dbRole) {
    await sb.from('user_roles').delete().eq('user_id', id);
    await sb.from('user_roles').insert({ user_id: id, role: changes.dbRole });
  }
  await hydrateAll();
  await logAction({ level: 'INFO', category: 'User', action: `User updated (${changes.name || id})` });
}
async function deleteUserRow(id) {
  await sb.from('profiles').delete().eq('id', id);
  await hydrateAll();
}
async function updateSelfProfile({ name, phone, zone }) {
  const uid = state.session?.user?.id;
  if (!uid) return;
  const patch = {};
  if (name != null) patch.full_name = name;
  if (phone != null) patch.phone = phone;
  if (zone != null) patch.zone = zone;
  await sb.from('profiles').update(patch).eq('id', uid);
  await loadSession();
  await hydrateAll();
}

// Schedules — one DB row per zone-day
async function saveZone(zone) {
  const existing = zone.origName || zone.name;
  await sb.from('schedules').delete().eq('zone', existing);
  const rows = (zone.days || []).map(d => ({
    zone: zone.name,
    waste_type: (zone.waste || []).join(','),
    collector_id: zone.collector_id || null,
    day_of_week: d,
    time_start: zone.start,
    time_end: zone.end,
    status: 'Scheduled',
    notes: JSON.stringify({ color: zone.color, waste: zone.waste, collector: zone.collector, orig_id: zone.id }),
  }));
  if (rows.length) await sb.from('schedules').insert(rows);
  await hydrateAll();
}
async function deleteZone(name) {
  await sb.from('schedules').delete().eq('zone', name);
  await hydrateAll();
}

// System logs
async function logAction({ level, category, action, details }) {
  const uid = state.session?.user?.id;
  if (!uid) return;
  try {
    await sb.from('system_logs').insert({
      actor_id: uid, level: (level || 'INFO').toUpperCase(),
      category, action, details: { user: state.profile?.full_name || state.profile?.email || 'user', ...(details || {}) },
    });
  } catch (_) {}
}
async function clearLogs() {
  // Delete logs the current user can see
  const { data } = await sb.from('system_logs').select('id');
  const ids = (data || []).map(r => r.id);
  if (ids.length) await sb.from('system_logs').delete().in('id', ids);
  await hydrateAll();
}
async function deleteLog(id) {
  await sb.from('system_logs').delete().eq('id', id);
  await hydrateAll();
}

// ---------- expose ----------
window.EB = {
  supabase: sb, state,
  loadSession, signIn, signUp, signInWithGoogle, signOut,
  hydrateAll,
  addReport, addComplianceForm,
  addAnnouncement, updateAnnouncement, deleteAnnouncement, publishAnnouncement,
  setReportStatus, deleteReport, setCompStatus, deleteComp,
  saveUserRow, deleteUserRow, updateSelfProfile,
  saveZone, deleteZone,
  logAction, clearLogs, deleteLog,
};

// ---------- boot ----------
async function boot() {
  const path = location.pathname;
  const onSignin = /signin\.html$/.test(path);
  const onResident = /resident\.html$/.test(path);
  const onAdmin = /ecobarangay\.html$/.test(path);

  await loadSession();

  if (!state.session) {
    if (!onSignin) { location.replace('/proto/signin.html'); return; }
  } else {
    if (onAdmin && state.role === 'resident') { location.replace('/proto/resident.html'); return; }
    if (onResident && state.role !== 'resident') { location.replace('/proto/ecobarangay.html'); return; }
    await hydrateAll();
    subscribeRealtime();
    // Belt-and-braces refresh on tab focus.
    document.addEventListener('visibilitychange', () => { if (!document.hidden) hydrateAll(); });
  }

  sb.auth.onAuthStateChange(async (event) => {
    if (event === 'SIGNED_OUT') {
      ['eb_auth','eb_reports','eb_forms','eb_announcements','eb_users','eb_schedules','eb_logs','eb_ann_full']
        .forEach(k => localStorage.removeItem(k));
      if (!/signin\.html$/.test(location.pathname)) location.replace('/proto/signin.html');
    }
    if (event === 'SIGNED_IN' || event === 'USER_UPDATED' || event === 'TOKEN_REFRESHED') {
      await loadSession();
      if (state.session && !/signin\.html$/.test(location.pathname)) await hydrateAll();
    }
  });

  state.ready = true;
  document.dispatchEvent(new Event('eb:ready'));
}

boot().catch(err => {
  console.error('[EB] boot failed', err);
  document.dispatchEvent(new Event('eb:ready'));
});
