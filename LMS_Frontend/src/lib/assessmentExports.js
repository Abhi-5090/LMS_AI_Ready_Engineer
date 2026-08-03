import ExcelJS from 'exceljs';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

// The app's green primary — used to theme both exports.
const GREEN_HEX = 'FF008738'; // ARGB for ExcelJS
const GREEN_RGB = [0, 135, 56]; // RGB for jsPDF
const GREEN_TINT = [240, 250, 244];

const COLUMNS = ['S.No', 'Student', 'Email', 'Attempt', 'Status', 'Score', 'Result', 'Warnings', 'Submitted'];

const slug = (t) => String(t || 'assessment').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'assessment';

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** rows: [{ sno, student, email, attempt, status, score, result, warnings, submitted }] */
function toMatrix(rows) {
  return rows.map((r, i) => [i + 1, r.student, r.email, r.attempt, r.status, r.score, r.result, r.warnings, r.submitted]);
}

/** Download the consolidated submissions as a styled .xlsx (centered cells, green header). */
export async function exportSubmissionsExcel(rows, { title = 'Assessment' } = {}) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Submissions', { views: [{ state: 'frozen', ySplit: 1 }] });

  ws.columns = COLUMNS.map((h, i) => ({ header: h, width: [7, 26, 32, 10, 14, 9, 12, 11, 22][i] }));
  toMatrix(rows).forEach((row) => ws.addRow(row));

  // Center every cell.
  ws.eachRow((row) => {
    row.height = 20;
    row.eachCell((cell) => { cell.alignment = { horizontal: 'center', vertical: 'middle' }; });
  });
  // Green header band.
  const header = ws.getRow(1);
  header.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN_HEX } };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  const buf = await wb.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `${slug(title)}-submissions.xlsx`,
  );
}

/** Download the consolidated submissions as a styled PDF (centered, green theme). */
export function exportSubmissionsPdf(rows, { title = 'Assessment', generatedAt = '' } = {}) {
  const doc = new jsPDF({ orientation: 'landscape' });
  doc.setFontSize(15);
  doc.setTextColor(...GREEN_RGB);
  doc.text(`${title} — Submissions`, 14, 15);
  doc.setFontSize(9);
  doc.setTextColor(110);
  doc.text(`${rows.length} submission${rows.length === 1 ? '' : 's'}${generatedAt ? ` · generated ${generatedAt}` : ''}`, 14, 21);

  autoTable(doc, {
    startY: 26,
    head: [COLUMNS],
    body: toMatrix(rows),
    theme: 'grid',
    styles: { halign: 'center', valign: 'middle', fontSize: 9, cellPadding: 2.5, lineColor: [220, 230, 224], lineWidth: 0.1 },
    headStyles: { fillColor: GREEN_RGB, textColor: 255, fontStyle: 'bold', halign: 'center' },
    alternateRowStyles: { fillColor: GREEN_TINT },
    columnStyles: { 1: { halign: 'center' }, 2: { halign: 'center' } },
  });
  doc.save(`${slug(title)}-submissions.pdf`);
}
