import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

/**
 * Render a completion certificate PDF: the admin's template (PDF or PNG/JPG image)
 * with the student's name drawn on it — horizontally centered, at the configured
 * vertical position and size. Returns the PDF bytes (Uint8Array).
 */
export async function renderCertificatePdf({ buffer, mimeType, name, nameXPercent = 50, nameYPercent = 55, fontScale = 6 }) {
  let pdfDoc;
  let page;

  if (mimeType === 'application/pdf') {
    pdfDoc = await PDFDocument.load(buffer);
    page = pdfDoc.getPages()[0];
  } else {
    // Image template → embed it full-page into a new PDF.
    pdfDoc = await PDFDocument.create();
    const img = mimeType === 'image/png' ? await pdfDoc.embedPng(buffer) : await pdfDoc.embedJpg(buffer);
    page = pdfDoc.addPage([img.width, img.height]);
    page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
  }

  const { width, height } = page.getSize();
  const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontSize = Math.max(8, (Number(fontScale) / 100) * height);
  const text = String(name || '').trim() || 'Student';
  const textWidth = font.widthOfTextAtSize(text, fontSize);
  // Center the name on (nameXPercent, nameYPercent); clamp so it stays on the page.
  const centerX = width * (Number(nameXPercent) / 100);
  const x = Math.max(0, Math.min(width - textWidth, centerX - textWidth / 2));
  // nameYPercent is measured from the TOP; pdf-lib's y origin is the bottom.
  const y = height * (1 - Number(nameYPercent) / 100) - fontSize / 2;
  page.drawText(text, { x, y, size: fontSize, font, color: rgb(0.12, 0.12, 0.14) });

  return pdfDoc.save();
}

/** A plain fallback certificate when a module has no uploaded template. */
export async function renderDefaultCertificatePdf({ name, moduleName, certificateId }) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([842, 595]); // A4 landscape
  const { width, height } = page.getSize();
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const reg = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const centered = (t, font, size, y, color = rgb(0.12, 0.12, 0.14)) => {
    const w = font.widthOfTextAtSize(t, size);
    page.drawText(t, { x: (width - w) / 2, y, size, font, color });
  };
  page.drawRectangle({ x: 24, y: 24, width: width - 48, height: height - 48, borderColor: rgb(0.2, 0.3, 0.5), borderWidth: 2 });
  centered('Certificate of Completion', bold, 30, height - 150, rgb(0.15, 0.25, 0.45));
  centered('This certifies that', reg, 16, height - 210);
  centered(String(name || 'Student').trim(), bold, 34, height - 265);
  centered(`has successfully completed ${moduleName || 'the module'}`, reg, 16, height - 315);
  if (certificateId) centered(`Certificate ID: ${certificateId}`, reg, 11, 60, rgb(0.4, 0.4, 0.45));
  return pdfDoc.save();
}
