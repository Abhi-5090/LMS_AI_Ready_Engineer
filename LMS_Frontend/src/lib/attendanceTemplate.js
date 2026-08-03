import * as XLSX from 'xlsx';

/**
 * Build and download an attendance template pre-filled with a class's enrolled
 * students. The column headers match exactly what the attendance importer reads,
 * so a filled-in template grades identically to a Teams export:
 *
 *   Name · Email · First Join · Leave Time · In-Meeting Duration
 *
 * Fill each attendee's "First Join" (e.g. 9:32 AM); optionally Leave Time and/or
 * In-Meeting Duration (if Duration is blank it's derived from Leave − First Join).
 * Leave absentees blank, then re-upload via "Import attendance". Joins within the
 * grace period count as Present, later joins as Late, and blank rows as Absent.
 *
 * @param {{ date:string, title?:string, startTime?:string }} cls
 * @param {{ name?:string, email?:string }[]} roster  enrolled students (name + email)
 */
export function downloadAttendanceTemplate(cls, roster) {
  const dayIso = new Date(cls?.date ?? Date.now()).toISOString().slice(0, 10);
  const header = ['Name', 'Email', 'First Join', 'Leave Time', 'In-Meeting Duration'];
  const body = (roster ?? []).map((r) => [r.name ?? '', r.email ?? '', '', '', '']);
  const ws = XLSX.utils.aoa_to_sheet([header, ...body]);
  ws['!cols'] = [{ wch: 26 }, { wch: 32 }, { wch: 16 }, { wch: 16 }, { wch: 20 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Attendance');

  const slug = String(cls?.title || 'class')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'class';
  XLSX.writeFile(wb, `attendance-${slug}-${dayIso}.xlsx`);
}
