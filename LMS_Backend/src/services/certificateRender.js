import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

// Map a font family + bold/italic to a pdf-lib StandardFont.
const FONT_VARIANTS = {
  Helvetica: { base: 'Helvetica', bold: 'HelveticaBold', italic: 'HelveticaOblique', boldItalic: 'HelveticaBoldOblique' },
  Times: { base: 'TimesRoman', bold: 'TimesRomanBold', italic: 'TimesRomanItalic', boldItalic: 'TimesRomanBoldItalic' },
  Courier: { base: 'Courier', bold: 'CourierBold', italic: 'CourierOblique', boldItalic: 'CourierBoldOblique' },
};
function fontFor(family, bold, italic) {
  const set = FONT_VARIANTS[family] || FONT_VARIANTS.Helvetica;
  const key = bold && italic ? 'boldItalic' : bold ? 'bold' : italic ? 'italic' : 'base';
  return StandardFonts[set[key]];
}

/**
 * Draw one line of text on the page. (xPercent, yPercent) anchor from the
 * left/top; `align` decides whether x is the text's left edge, centre, or right
 * edge. Size is `fontScale` % of the page height. Clamps to stay on the page.
 */
async function drawField(pdfDoc, page, { text, xPercent, yPercent, fontScale, family, bold, italic, align }) {
  const clean = String(text || '').trim();
  if (!clean) return;
  const { width, height } = page.getSize();
  const font = await pdfDoc.embedFont(fontFor(family, bold, italic));
  const size = Math.max(6, (Number(fontScale) / 100) * height);
  const textWidth = font.widthOfTextAtSize(clean, size);
  const anchorX = width * (Number(xPercent) / 100);
  let x;
  if (align === 'left') x = anchorX;
  else if (align === 'right') x = anchorX - textWidth;
  else x = anchorX - textWidth / 2; // center
  x = Math.max(0, Math.min(width - textWidth, x));
  // yPercent is from the TOP; pdf-lib's y origin is the bottom.
  const y = height * (1 - Number(yPercent) / 100) - size / 2;
  page.drawText(clean, { x, y, size, font, color: rgb(0.12, 0.12, 0.14) });
}

/**
 * Render a completion certificate PDF: the admin's template (PDF or PNG/JPG image)
 * with the student's name — and, if enabled, the certificate ID — drawn on it at
 * the configured position / font / alignment. Returns the PDF bytes (Uint8Array).
 */
export async function renderCertificatePdf({
  buffer, mimeType, name, certificateId,
  nameXPercent = 50, nameYPercent = 55, fontScale = 6,
  nameFont = 'Helvetica', nameBold = true, nameItalic = false, nameAlign = 'center',
  idEnabled = false, idXPercent = 50, idYPercent = 90, idFontScale = 2.2,
  idFont = 'Helvetica', idBold = false, idItalic = false, idAlign = 'center',
}) {
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

  await drawField(pdfDoc, page, {
    text: String(name || '').trim() || 'Student',
    xPercent: nameXPercent, yPercent: nameYPercent, fontScale,
    family: nameFont, bold: nameBold, italic: nameItalic, align: nameAlign,
  });

  if (idEnabled && certificateId) {
    await drawField(pdfDoc, page, {
      text: certificateId,
      xPercent: idXPercent, yPercent: idYPercent, fontScale: idFontScale,
      family: idFont, bold: idBold, italic: idItalic, align: idAlign,
    });
  }

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
