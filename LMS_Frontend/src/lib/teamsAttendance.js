import * as XLSX from 'xlsx';

// Parse a Microsoft Teams attendance export (or any sheet with an email column and
// a join-time column) into { email → earliest join as an absolute timestamp (ms) }.
// Grading compares that full datetime against the class start + grace window, so a
// join is judged by the actual moment it happened, not just the time of day.

const norm = (h) => String(h ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
// A cell that carries a calendar date (e.g. "6/12/2025", "2025-06-12", "12.06.2025").
const HAS_DATE = /\d{1,4}[/.-]\d{1,2}[/.-]\d{1,4}/;

/** Find the header row + the email/join (+ optional leave/duration/name/role) columns. */
function findColumns(rows) {
  const isDuration = (k) => k.includes('inmeetingduration') || k === 'duration' || k.includes('duration') || k.includes('watchtime');
  // "Leave" / "Last Leave" / "Exit time" / "Time out" — when a class ends.
  const isLeave = (k) =>
    k.includes('lastleave') || k.includes('leavetime') || k.includes('leave') || k.includes('timeexited') ||
    k.includes('exittime') || k === 'timeout' || k === 'outtime';
  const isName = (k) => k === 'name';
  const isRole = (k) => k === 'role';
  const scan = (test) => {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] ?? [];
      let emailCol = -1;
      let joinCol = -1;
      let leaveCol = -1;
      let durationCol = -1;
      let nameCol = -1;
      let roleCol = -1;
      row.forEach((cell, c) => {
        const k = norm(cell);
        if (emailCol < 0 && test.email(k)) emailCol = c;
        // A leave column also contains "…time"/"…join"-ish words, so match it FIRST
        // and skip it for the join column (else "Leave time" can steal the join slot).
        if (leaveCol < 0 && isLeave(k)) { leaveCol = c; return; }
        if (joinCol < 0 && test.join(k)) joinCol = c;
        if (durationCol < 0 && isDuration(k)) durationCol = c;
        if (nameCol < 0 && isName(k)) nameCol = c;
        if (roleCol < 0 && isRole(k)) roleCol = c;
      });
      if (emailCol >= 0 && joinCol >= 0) return { headerRow: i, emailCol, joinCol, leaveCol, durationCol, nameCol, roleCol };
    }
    return null;
  };
  // "Entry"/"First entry"/"Time in" are common non-Teams headers for the join column.
  const joinStrict = (k) =>
    k.includes('firstjoin') || k.includes('jointime') || k.includes('timejoined') || k.includes('joinedat') ||
    k.includes('firstjoined') || k.includes('firstentry') || k.includes('entrytime') || k === 'entry' ||
    k === 'timein' || k === 'intime';
  return (
    scan({
      email: (k) => k === 'email' || k === 'upn' || k === 'userprincipalname' || k.includes('email'),
      join: joinStrict,
    }) ||
    scan({ email: (k) => k.includes('email') || k.includes('mail'), join: (k) => k.includes('join') || k.includes('entry') })
  );
}

/** Extract {h, m} time-of-day from a string, or null. */
function extractTimeOfDay(s) {
  let m = s.match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp])[Mm]/);
  if (m) { let h = Number(m[1]) % 12; if (/p/i.test(m[3])) h += 12; return { h, m: Number(m[2]) }; }
  m = s.match(/\b(\d{1,2}):(\d{2})\b/);
  if (m) return { h: Number(m[1]), m: Number(m[2]) };
  return null;
}

/**
 * A Teams join cell → absolute timestamp (ms, local time). A cell with a date uses
 * its own full datetime; a time-only cell is placed on the class day so it can still
 * be compared as a full datetime.
 */
export function joinCellToMs(val, classDayIso) {
  if (val instanceof Date && !Number.isNaN(val.getTime())) return val.getTime();
  const s = String(val ?? '').trim();
  if (!s) return null;
  if (HAS_DATE.test(s)) {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return d.getTime();
  }
  const t = extractTimeOfDay(s);
  if (t && classDayIso) {
    const ms = new Date(`${classDayIso}T${String(t.h).padStart(2, '0')}:${String(t.m).padStart(2, '0')}:00`).getTime();
    if (!Number.isNaN(ms)) return ms;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

/** "6m 31s" / "1h 5m 20s" / "30s" → seconds (the In-Meeting Duration = watch time). */
export function parseDurationToSeconds(val) {
  const s = String(val ?? '').trim().toLowerCase();
  if (!s) return null;
  const m = s.match(/^(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?\s*(?:(\d+)\s*s)?$/);
  if (!m || (m[1] === undefined && m[2] === undefined && m[3] === undefined)) return null;
  const secs = Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0);
  return secs > 0 ? secs : null;
}

/** Absolute ms of the class start (its calendar day at startTime, local time). */
export function classStartMs(classDate, startTime) {
  const day = new Date(classDate).toISOString().slice(0, 10); // YYYY-MM-DD
  const ms = new Date(`${day}T${startTime || '00:00'}:00`).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

/**
 * Grade a join against the class start + grace window (all absolute datetimes):
 *   no join → 'absent', joined within grace → 'present', later → 'late'.
 */
export function classifyJoin(joinMs, startMs, bufferMinutes) {
  if (joinMs == null) return 'absent';
  return joinMs <= startMs + (Number(bufferMinutes) || 0) * 60000 ? 'present' : 'late';
}

/**
 * @param {ArrayBuffer} arrayBuffer  the uploaded .xlsx/.csv
 * @param {string} [classDayIso]     the class calendar day (YYYY-MM-DD), used to
 *                                   place any time-only join cells on the right day
 * @returns {{ byEmail: Map<string, number>, participants: number }}
 */
export function parseTeamsAttendance(arrayBuffer, classDayIso) {
  const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
  const cols = findColumns(rows);
  if (!cols) throw new Error('Could not find an Email column and a Join-time column in that file.');

  const byEmail = new Map();
  const byEmailLeave = new Map(); // email → latest leave time (ms)
  const byEmailWatch = new Map(); // email → total in-meeting seconds (watch time)
  let organizer = null; // the trainer who ran the session (Role = Organizer)
  for (let i = cols.headerRow + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const emailMatch = String(row[cols.emailCol] ?? '').match(EMAIL_RE);
    if (!emailMatch) continue; // section breaks / blanks
    const email = emailMatch[0].toLowerCase();
    const ms = joinCellToMs(row[cols.joinCol], classDayIso);
    if (ms == null) continue;
    // A participant may appear on several rows — keep their earliest join + latest leave.
    if (!byEmail.has(email) || ms < byEmail.get(email)) byEmail.set(email, ms);
    const leaveMs = cols.leaveCol >= 0 ? joinCellToMs(row[cols.leaveCol], classDayIso) : null;
    if (leaveMs != null && leaveMs > (byEmailLeave.get(email) ?? -Infinity)) byEmailLeave.set(email, leaveMs);
    // Watch time: prefer an explicit duration; otherwise derive it from leave − join.
    let secs = cols.durationCol >= 0 ? parseDurationToSeconds(row[cols.durationCol]) : null;
    if (secs == null && leaveMs != null && leaveMs > ms) secs = Math.round((leaveMs - ms) / 1000);
    if (secs != null && secs > (byEmailWatch.get(email) ?? 0)) byEmailWatch.set(email, secs);

    // The organizer = when the trainer started/ran the session.
    const role = cols.roleCol >= 0 ? String(row[cols.roleCol] ?? '').toLowerCase() : '';
    if (role.includes('organizer')) {
      const oname = cols.nameCol >= 0 ? String(row[cols.nameCol] ?? '').trim() : '';
      if (!organizer) organizer = { name: oname || 'Organizer', email, joinMs: ms, watchSeconds: secs ?? null };
      else {
        if (ms < organizer.joinMs) organizer.joinMs = ms;
        if (secs != null && (organizer.watchSeconds == null || secs > organizer.watchSeconds)) organizer.watchSeconds = secs;
        if (oname && organizer.name === 'Organizer') organizer.name = oname;
      }
    }
  }
  if (byEmail.size === 0) throw new Error('No participant rows with an email and join time were found.');
  return { byEmail, byEmailLeave, byEmailWatch, organizer, participants: byEmail.size };
}
