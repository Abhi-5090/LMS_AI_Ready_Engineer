import { useRef } from 'react';
import { BookOpen, Download, UploadCloud } from 'lucide-react';
import { Button, Card, CardHeader, EmptyState, ErrorState, Spinner, useToast } from '@/components/ui';
import { PageHeader } from '@/components/PageHeader';
import { apiErrorMessage, fileSrc } from '@/lib/api';
import { useProgramBrochure, useUploadProgramBrochure } from '@/lib/organizations';
import './program.css';

/** Super admin: view (and upload/replace) the AI Ready Engineer program brochure PDF. */
export function ProgramBrochurePage() {
  const { data, isLoading, isError, error, refetch } = useProgramBrochure();
  const upload = useUploadProgramBrochure();
  const toast = useToast();
  const fileRef = useRef(null);

  const url = data?.url || '';
  const src = url ? `${fileSrc(url)}#toolbar=1&navpanes=0` : '';

  async function onFile(e) {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = '';
    if (!file) return;
    try {
      await upload.mutateAsync(file);
      toast.success('Program brochure updated.');
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  return (
    <>
      <PageHeader
        title="Program Brochure"
        subtitle="The AI Ready Engineer program brochure."
      />

      <div className="toolbar">
        <span />
        <div className="toolbar__right">
          <input ref={fileRef} type="file" accept="application/pdf,.pdf" onChange={onFile} hidden />
          {url && (
            <a className="btn btn--outline" href={fileSrc(url)} target="_blank" rel="noreferrer">
              <Download size={15} style={{ marginRight: 6 }} /> Open / download
            </a>
          )}
          <Button onClick={() => fileRef.current?.click()} loading={upload.isPending}>
            <UploadCloud size={15} style={{ marginRight: 6 }} /> {url ? 'Replace PDF' : 'Upload PDF'}
          </Button>
        </div>
      </div>

      <Card>
        {isError ? (
          <ErrorState message={apiErrorMessage(error)} onRetry={refetch} />
        ) : isLoading && !data ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-10)' }}><Spinner size={30} /></div>
        ) : !url ? (
          <EmptyState
            icon={<BookOpen size={26} />}
            title="No brochure uploaded yet"
            description="Upload the program brochure PDF to display it here."
            action={<Button onClick={() => fileRef.current?.click()} loading={upload.isPending}><UploadCloud size={15} style={{ marginRight: 6 }} /> Upload PDF</Button>}
          />
        ) : (
          <object data={src} type="application/pdf" className="program-pdf" aria-label="Program brochure">
            <p className="lms-muted" style={{ padding: 'var(--space-4)' }}>
              Your browser can’t display the PDF inline — <a href={fileSrc(url)} target="_blank" rel="noreferrer">open it in a new tab</a>.
            </p>
          </object>
        )}
      </Card>
    </>
  );
}
