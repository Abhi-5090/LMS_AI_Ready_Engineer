import { useState } from 'react';
import * as XLSX from 'xlsx';
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, UploadCloud } from 'lucide-react';
import { Button } from '@/components/ui';
import { apiErrorMessage } from '@/lib/api';
import { useImportSyllabus } from '@/lib/modules';

const TEMPLATE_HEADERS = ['Topic', 'Subtopic', 'Description'];

/** Map a spreadsheet header to a field (case/space/punctuation tolerant). */
function fieldFor(header) {
  const k = String(header).toLowerCase().replace(/[^a-z]/g, '');
  if (k === 'topic' || k === 'topicname' || k === 'module' || k === 'section' || k === 'unit') return 'topic';
  if (k === 'subtopic' || k === 'subtopicname' || k === 'concept' || k === 'subconcept' || k === 'subject') return 'subtopic';
  if (k === 'description' || k === 'desc' || k === 'details' || k === 'delivery' || k === 'whatsdelivered' || k === 'content') return 'description';
  return null;
}

/**
 * Parse rows into grouped topics. The Topic cell is "filled forward" (blank
 * cells inherit the previous topic), so a sheet can list a topic once then its
 * subtopics on the following rows. Each non-empty subtopic/description becomes a
 * subtopic of its topic.
 */
function groupTopics(raw) {
  const order = [];
  const byTitle = new Map();
  let lastTopic = '';
  for (const row of raw) {
    let topic = '';
    let subtopic = '';
    let description = '';
    for (const [header, value] of Object.entries(row)) {
      const f = fieldFor(header);
      const v = value == null ? '' : String(value).trim();
      if (f === 'topic') topic = v;
      else if (f === 'subtopic') subtopic = v;
      else if (f === 'description') description = v;
    }
    if (topic) lastTopic = topic;
    const title = topic || lastTopic;
    if (!title) continue;
    if (!byTitle.has(title)) {
      const entry = { title, subtopics: [] };
      byTitle.set(title, entry);
      order.push(entry);
    }
    if (subtopic || description) byTitle.get(title).subtopics.push({ title: subtopic, description });
  }
  return order;
}

/**
 * Bulk-import a syllabus from an .xlsx/.csv. Renders the body of a Modal (parent
 * provides the <Modal> wrapper). Topics matched by name get their subtopics
 * replaced; new topics are appended.
 */
export function AddSyllabusModal({ module, onClose }) {
  const [topics, setTopics] = useState(null);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const importSyllabus = useImportSyllabus();

  const subtopicCount = (topics ?? []).reduce((n, t) => n + t.subtopics.length, 0);

  // Pre-import diff: which parsed topics already exist (their concepts will be
  // REPLACED on import) vs which are brand-new (appended). Matched case-insensitively,
  // mirroring the backend importSyllabus logic.
  const existingTitles = new Set((module.topics ?? []).map((t) => String(t.title).trim().toLowerCase()));
  const willOverwrite = (t) => existingTitles.has(String(t.title).trim().toLowerCase());
  const overwriteCount = (topics ?? []).filter(willOverwrite).length;
  const newCount = (topics?.length ?? 0) - overwriteCount;

  async function onFile(e) {
    setError('');
    setResult(null);
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      const grouped = groupTopics(raw);
      if (!grouped.length) setError('No topics found. Make sure there is a "Topic" column.');
      setTopics(grouped);
    } catch {
      setError('Could not read that file. Use a .xlsx or .csv export.');
      setTopics(null);
    }
  }

  function downloadTemplate() {
    const ws = XLSX.utils.aoa_to_sheet([
      TEMPLATE_HEADERS,
      ['Generative AI', 'What is GenAI', 'Overview of generative models & where they’re used'],
      ['Generative AI', 'Prompting basics', 'Crafting effective prompts; roles, context, format'],
      ['RAG', 'Embeddings', 'Vectorizing text; similarity search intuition'],
      ['RAG', 'Retrieval pipeline', 'Chunking, indexing, and grounding answers in sources'],
    ]);
    ws['!cols'] = [{ wch: 22 }, { wch: 26 }, { wch: 60 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Syllabus');
    XLSX.writeFile(wb, 'syllabus-template.xlsx');
  }

  async function submit() {
    setError('');
    try {
      const res = await importSyllabus.mutateAsync({ id: module.id, topics });
      setResult(res);
    } catch (e2) {
      setError(apiErrorMessage(e2));
    }
  }

  if (result) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', color: 'var(--color-success)' }}>
          <CheckCircle2 size={20} />
          <strong>{result.added} topic(s) added{result.updated ? `, ${result.updated} updated` : ''}.</strong>
        </div>
        <p className="lms-muted" style={{ fontSize: 'var(--font-size-sm)', margin: 0 }}>
          Open a topic to fine-tune its concepts, or attach learning resources.
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button onClick={onClose}>Done</Button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <p className="lms-muted" style={{ fontSize: 'var(--font-size-sm)', margin: 0 }}>
        Upload an Excel/CSV with columns <strong>Topic</strong>, <strong>Subtopic</strong>, and{' '}
        <strong>Description</strong> (what’s delivered in class). List a topic once and add a row per subtopic.
      </p>

      <button type="button" className="btn btn--ghost btn--sm" style={{ alignSelf: 'flex-start' }} onClick={downloadTemplate}>
        <Download size={15} style={{ marginRight: 6 }} /> Download template
      </button>

      <label className="bulk-drop">
        <input type="file" accept=".xlsx,.xls,.csv" onChange={onFile} style={{ display: 'none' }} />
        <UploadCloud size={28} />
        <span>{fileName || 'Choose a .xlsx or .csv file'}</span>
      </label>

      {topics && (
        <>
          <div style={{ fontSize: 'var(--font-size-sm)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <FileSpreadsheet size={16} style={{ color: 'var(--color-primary)' }} />
            <span>
              <strong>{topics.length}</strong> topic(s) · <strong>{subtopicCount}</strong> concept(s) —{' '}
              <strong style={{ color: 'var(--color-success)' }}>{newCount} new</strong>
              {overwriteCount > 0 && <>, <strong style={{ color: 'var(--color-warning)' }}>{overwriteCount} will be updated</strong></>}.
            </span>
          </div>

          {overwriteCount > 0 && (
            <div className="field__error" style={{ display: 'flex', alignItems: 'flex-start', gap: 6, color: 'var(--color-warning)' }}>
              <AlertTriangle size={15} style={{ marginTop: 2, flexShrink: 0 }} />
              <span>
                {overwriteCount} topic(s) already exist in this module — importing will <strong>replace their concepts</strong> with the sheet’s.
                New concepts are added; topics not in the sheet are left untouched.
              </span>
            </div>
          )}

          <div className="syllabus-preview">
            {topics.slice(0, 8).map((t, i) => {
              const dup = willOverwrite(t);
              return (
                <div key={i} className="syllabus-preview__topic">
                  <strong>{t.title}</strong>
                  <span
                    style={{
                      marginLeft: 8,
                      fontSize: 'var(--font-size-xs)',
                      fontWeight: 'var(--font-weight-semibold)',
                      color: dup ? 'var(--color-warning)' : 'var(--color-success)',
                    }}
                  >
                    {dup ? 'Will overwrite' : 'New'}
                  </span>
                  <span className="lms-muted"> — {t.subtopics.length} concept{t.subtopics.length === 1 ? '' : 's'}</span>
                </div>
              );
            })}
            {topics.length > 8 && <div className="lms-muted" style={{ fontSize: 'var(--font-size-sm)' }}>+{topics.length - 8} more…</div>}
          </div>
        </>
      )}

      {error && <div className="field__error" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><AlertTriangle size={15} /> {error}</div>}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} loading={importSyllabus.isPending} disabled={!topics?.length}>
          Import syllabus
        </Button>
      </div>
    </div>
  );
}
