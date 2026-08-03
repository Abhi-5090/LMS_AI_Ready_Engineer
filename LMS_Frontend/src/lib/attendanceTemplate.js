import * as XLSX from 'xlsx';

/**
 * Build and download an attendance template pre-filled with a class's enrolled
 * students. The column headers match exactly what the Teams-attendance importer
 * reads back, so a filled-in template grades identically to a real Teams export:
 *
 *   Name · Email · Role · First Join · In-Meeting Duration
 *
 * Fill each attendee's "First Join" (e.g. 9:32 AM), leave absentees blank, then
 * re-upload the file via "Import Teams attendance". Joins within the grace period
 * count as Present, later joins as Late, and blank/missing rows as Absent.
 *
 * @param {{ date:string, title?:string, startTime?:string }} cls
 * @param {{ name?:string, email?:string }[]} roster  enrolled students (name + email)
 */
export function downloadAttendanceTemplate(cls, roster) {
  const dayIso = new Date(cls?.date ?? Date.now()).toISOString().slice(0, 10);
  const header = ['Name', 'Email', 'Role', 'First Join', 'In-Meeting Duration'];
  const body = (roster ?? []).map((r) => [r.name ?? '', r.email ?? '', 'Attendee', '', '']);
  const ws = XLSX.utils.aoa_to_sheet([header, ...body]);
  ws['!cols'] = [{ wch: 26 }, { wch: 32 }, { wch: 12 }, { wch: 18 }, { wch: 20 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Attendance');

  const slug = String(cls?.title || 'class')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'class';
  XLSX.writeFile(wb, `attendance-${slug}-${dayIso}.xlsx`);
}
