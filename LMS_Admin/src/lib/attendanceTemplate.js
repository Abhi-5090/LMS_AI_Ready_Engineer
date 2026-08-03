import * as XLSX from 'xlsx';

/**
 * Build and download an attendance template pre-filled with a class's enrolled
 * students. Exactly four columns — the ones the attendance importer reads:
 *
 *   Email · First Join · Leave Time · In-Meeting Duration
 *
 * Fill each attendee's "First Join" (e.g. 9:32 AM); optionally Leave Time and/or
 * In-Meeting Duration (if Duration is blank it's derived from Leave − First Join).
 * Leave absentees blank, then re-upload via "Import attendance". Joins within the
 * grace period count as Present, later joins as Late, and blank rows as Absent.
 *
 * @param {{ date:string, title?:string, startTime?:string }} cls
 * @param {{ email?:string }[]} roster  enrolled students (email is all we need)
 */
export function downloadAttendanceTemplate(cls, roster) {
  const dayIso = new Date(cls?.date ?? Date.now()).toISOString().slice(0, 10);
  const header = ['Email', 'First Join', 'Leave Time', 'In-Meeting Duration'];
  const body = (roster ?? []).map((r) => [r.email ?? '', '', '', '']);
  const ws = XLSX.utils.aoa_to_sheet([header, ...body]);
  ws['!cols'] = [{ wch: 32 }, { wch: 16 }, { wch: 16 }, { wch: 20 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Attendance');

  const slug = String(cls?.title || 'class')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'class';
  XLSX.writeFile(wb, `attendance-${slug}-${dayIso}.xlsx`);
}
