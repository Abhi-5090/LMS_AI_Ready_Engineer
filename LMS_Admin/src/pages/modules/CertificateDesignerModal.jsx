import { useEffect, useMemo, useRef, useState } from 'react';
import { AlignCenter, AlignLeft, AlignRight, Bold, Eye, Italic, Trash2, UploadCloud } from 'lucide-react';
import { Badge, Button, Input, Modal, Select, useConfirm, useToast } from '@/components/ui';
import { apiErrorMessage, fileSrc } from '@/lib/api';
import { openCertPreview, useDeleteCertTemplate, usePutCertTemplate } from '@/lib/certificateTemplates';

const FONT_OPTIONS = [
  { value: 'Helvetica', label: 'Helvetica · sans-serif' },
  { value: 'Times', label: 'Times · serif' },
  { value: 'Courier', label: 'Courier · monospace' },
];
const CSS_FONT = {
  Helvetica: 'Helvetica, Arial, sans-serif',
  Times: '"Times New Roman", Times, serif',
  Courier: '"Courier New", Courier, monospace',
};
const DEFAULTS = {
  nameXPercent: 50, nameYPercent: 55, fontScale: 6, nameFont: 'Helvetica', nameBold: true, nameItalic: false, nameAlign: 'center',
  idEnabled: false, idXPercent: 50, idYPercent: 90, idFontScale: 2.2, idFont: 'Helvetica', idBold: false, idItalic: false, idAlign: 'center',
};
const isImage = (mime) => typeof mime === 'string' && mime.startsWith('image/');

/** Only the style keys, pulled off a saved template. */
function pickStyle(tpl) {
  if (!tpl) return {};
  const out = {};
  for (const key of Object.keys(DEFAULTS)) if (tpl[key] != null) out[key] = tpl[key];
  return out;
}

function AlignPicker({ value, onChange }) {
  const opts = [['left', AlignLeft], ['center', AlignCenter], ['right', AlignRight]];
  return (
    <div className="cert-align">
      {opts.map(([val, Icon]) => (
        <button type="button" key={val} className={`cert-iconbtn${value === val ? ' is-on' : ''}`} onClick={() => onChange(val)} aria-label={val} title={val}>
          <Icon size={15} />
        </button>
      ))}
    </div>
  );
}

/** A text overlay on the live preview, positioned/sized to mirror the PDF render. */
function Overlay({ text, xPercent, yPercent, fontScale, font, bold, italic, align, boxH }) {
  if (!text) return null;
  const tx = align === 'left' ? '0' : align === 'right' ? '-100%' : '-50%';
  return (
    <span
      className="cert-overlay"
      style={{
        left: `${xPercent}%`,
        top: `${yPercent}%`,
        transform: `translate(${tx}, -50%)`,
        fontSize: boxH ? `${(fontScale / 100) * boxH}px` : '1rem',
        fontFamily: CSS_FONT[font] || CSS_FONT.Helvetica,
        fontWeight: bold ? 700 : 400,
        fontStyle: italic ? 'italic' : 'normal',
        textAlign: align,
      }}
    >
      {text}
    </span>
  );
}

function StyleControls({ prefix, form, set }) {
  const k = prefix === 'name'
    ? { font: 'nameFont', bold: 'nameBold', italic: 'nameItalic', align: 'nameAlign', x: 'nameXPercent', y: 'nameYPercent', scale: 'fontScale' }
    : { font: 'idFont', bold: 'idBold', italic: 'idItalic', align: 'idAlign', x: 'idXPercent', y: 'idYPercent', scale: 'idFontScale' };
  return (
    <div className="cert-controls">
      <div className="cert-controls__row">
        <Select label="Font" value={form[k.font]} onChange={(e) => set(k.font)(e.target.value)} options={FONT_OPTIONS} />
        <div className="cert-controls__style">
          <span className="certfield__label">Style</span>
          <div className="cert-controls__btns">
            <button type="button" className={`cert-iconbtn${form[k.bold] ? ' is-on' : ''}`} onClick={() => set(k.bold)(!form[k.bold])} aria-label="Bold" title="Bold"><Bold size={15} /></button>
            <button type="button" className={`cert-iconbtn${form[k.italic] ? ' is-on' : ''}`} onClick={() => set(k.italic)(!form[k.italic])} aria-label="Italic" title="Italic"><Italic size={15} /></button>
            <AlignPicker value={form[k.align]} onChange={set(k.align)} />
          </div>
        </div>
      </div>
      <div className="certfield">
        <span className="certfield__label">Horizontal — <b>{form[k.x]}%</b> from left {form[k.x] === 50 ? '(centered)' : ''}</span>
        <input type="range" min="0" max="100" value={form[k.x]} onChange={(e) => set(k.x)(Number(e.target.value))} />
      </div>
      <div className="certfield">
        <span className="certfield__label">Vertical — <b>{form[k.y]}%</b> from top</span>
        <input type="range" min="0" max="100" value={form[k.y]} onChange={(e) => set(k.y)(Number(e.target.value))} />
      </div>
      <div className="certfield certfield--num">
        <span className="certfield__label">Font size</span>
        <div className="certfield__num">
          <Input type="number" min="0.5" max="20" step="0.1" value={form[k.scale]} onChange={(e) => set(k.scale)(Number(e.target.value) || 1)} />
          <span className="certfield__unit">% of height</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Full certificate designer: a live preview of the template with the student
 * name + (optional) certificate ID overlaid, and a side panel to set each
 * field's position, font, bold/italic and alignment. "Preview exact PDF" renders
 * the true server PDF; "Save changes" persists the placement.
 */
export function CertificateDesignerModal({ open, onClose, moduleId, moduleName, moduleCode, tpl }) {
  const put = usePutCertTemplate();
  const del = useDeleteCertTemplate();
  const toast = useToast();
  const confirm = useConfirm();
  const [form, setForm] = useState(DEFAULTS);
  const [file, setFile] = useState(null);
  const fileRef = useRef(null);
  const stageRef = useRef(null);
  const [boxH, setBoxH] = useState(0);

  const set = (key) => (val) => setForm((f) => ({ ...f, [key]: val }));

  useEffect(() => {
    if (!open) return;
    setForm({ ...DEFAULTS, ...pickStyle(tpl) });
    setFile(null);
  }, [open, tpl]);

  // Track the rendered preview height so overlay font sizes track "% of height".
  useEffect(() => {
    const el = stageRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => setBoxH(el.clientHeight));
    ro.observe(el);
    setBoxH(el.clientHeight);
    return () => ro.disconnect();
  }, [open]);

  const previewSrc = useMemo(() => {
    if (file && file.type.startsWith('image/')) return URL.createObjectURL(file);
    if (tpl?.fileUrl && isImage(tpl.mimeType)) return fileSrc(tpl.fileUrl);
    return null;
  }, [file, tpl]);
  useEffect(() => () => { if (previewSrc?.startsWith('blob:')) URL.revokeObjectURL(previewSrc); }, [previewSrc]);

  const sampleId = `AIRE2028-${(moduleCode || 'MOD').toUpperCase().replace(/[^A-Z0-9]/g, '')}-00001`;
  const hasTemplate = Boolean(tpl) || Boolean(file);

  async function save() {
    if (!tpl && !file) { toast.error('Choose a template file (PDF, PNG or JPG).'); return; }
    try {
      await put.mutateAsync({ moduleId, file, ...form });
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
      toast.success('Certificate template saved.');
      onClose();
    } catch (e) { toast.error(apiErrorMessage(e)); }
  }
  async function serverPreview() {
    if (!tpl) { toast.error('Save the template first to preview the exact PDF.'); return; }
    try { await openCertPreview(moduleId, 'Student Name', { ...form, certificateId: sampleId }); }
    catch (e) { toast.error(apiErrorMessage(e)); }
  }
  async function remove() {
    if (!(await confirm({ title: 'Remove this certificate template?', message: 'This deletes the uploaded template and all its placement styling. New certificates will fall back to the default design.', confirmLabel: 'Remove', tone: 'danger' }))) return;
    try { await del.mutateAsync(moduleId); toast.success('Template removed.'); onClose(); }
    catch (e) { toast.error(apiErrorMessage(e)); }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={`Design certificate — ${moduleName}`}
      footer={(
        <>
          {tpl && <Button variant="ghost" onClick={remove} loading={del.isPending}><Trash2 size={15} style={{ marginRight: 6 }} /> Remove</Button>}
          <Button variant="outline" onClick={serverPreview}><Eye size={15} style={{ marginRight: 6 }} /> Preview exact PDF</Button>
          <Button onClick={save} loading={put.isPending}>Save changes</Button>
        </>
      )}
    >
      <div className="cert-designer">
        {/* Live preview */}
        <div className="cert-designer__stage">
          {previewSrc ? (
            <div className="cert-designer__frame" ref={stageRef}>
              <img src={previewSrc} alt="" className="cert-designer__img" />
              <Overlay text="Student Name" xPercent={form.nameXPercent} yPercent={form.nameYPercent} fontScale={form.fontScale} font={form.nameFont} bold={form.nameBold} italic={form.nameItalic} align={form.nameAlign} boxH={boxH} />
              {form.idEnabled && <Overlay text={sampleId} xPercent={form.idXPercent} yPercent={form.idYPercent} fontScale={form.idFontScale} font={form.idFont} bold={form.idBold} italic={form.idItalic} align={form.idAlign} boxH={boxH} />}
            </div>
          ) : (
            <div className="cert-designer__empty">
              {hasTemplate ? 'PDF template — use “Preview exact PDF” to check placement.' : 'Upload a template to see a live preview here.'}
            </div>
          )}
        </div>

        {/* Control panel */}
        <div className="cert-designer__panel">
          <label className={`certdrop certdrop--sm${hasTemplate ? ' certdrop--set' : ''}`}>
            <input ref={fileRef} type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={(e) => setFile(e.target.files?.[0] ?? null)} hidden />
            <span className="certdrop__text">
              <span className="certdrop__name">{file ? file.name : tpl ? (tpl.fileName || 'Template attached') : 'Upload template (PDF, PNG, JPG)'}</span>
              {file && <Badge tone="primary">New file</Badge>}
            </span>
            <span className="certdrop__icon"><UploadCloud size={22} /></span>
          </label>

          <div className="cert-group">
            <div className="cert-group__head"><span className="cert-group__title">Student name</span></div>
            <StyleControls prefix="name" form={form} set={set} />
          </div>

          <div className="cert-group">
            <div className="cert-group__head">
              <span className="cert-group__title">Certificate ID</span>
              <label className="cert-toggle">
                <input type="checkbox" checked={form.idEnabled} onChange={(e) => set('idEnabled')(e.target.checked)} /> Show on certificate
              </label>
            </div>
            {form.idEnabled
              ? <StyleControls prefix="id" form={form} set={set} />
              : <p className="cert-hint">Enable to place the certificate ID (e.g. {sampleId}) on the template.</p>}
          </div>
        </div>
      </div>
    </Modal>
  );
}
