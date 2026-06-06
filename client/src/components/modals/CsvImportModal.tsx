import { useState, useRef } from 'react';
import { Upload, Download, CheckCircle2, RefreshCw, AlertTriangle, X } from 'lucide-react';
import { csvImportApi, type CsvImportPreview } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

interface CsvImportModalProps {
  mode: 'teams' | 'players';
  seasonId?: string;
  onClose: () => void;
  onImported: () => void;
}

type Stage = 'idle' | 'previewing' | 'preview' | 'importing' | 'done' | 'error';

export function CsvImportModal({ mode, seasonId, onClose, onImported }: CsvImportModalProps) {
  const [stage,   setStage]   = useState<Stage>('idle');
  const [csv,     setCsv]     = useState<string>('');
  const [preview, setPreview] = useState<CsvImportPreview | null>(null);
  const [result,  setResult]  = useState<CsvImportPreview | null>(null);
  const [errMsg,  setErrMsg]  = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const title = mode === 'teams' ? 'Import Teams from CSV' : 'Import Players from CSV';

  async function downloadTemplate() {
    try {
      const res = await (mode === 'teams' ? csvImportApi.templateTeams() : csvImportApi.templatePlayers());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = mode === 'teams' ? 'teams-template.csv' : 'players-template.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      setErrMsg((e as Error).message ?? 'Failed to download template.');
      setStage('error');
    }
  }

  function readFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setCsv(text);
      runPreview(text);
    };
    reader.readAsText(file);
  }

  async function runPreview(csvText: string) {
    setStage('previewing');
    setErrMsg(null);
    try {
      const res = mode === 'teams'
        ? await csvImportApi.previewTeams(csvText)
        : await csvImportApi.previewPlayers(csvText, seasonId);
      setPreview(res);
      setStage('preview');
    } catch (e: unknown) {
      setErrMsg((e as Error).message ?? 'Preview failed.');
      setStage('error');
    }
  }

  async function runCommit() {
    setStage('importing');
    try {
      const res = mode === 'teams'
        ? await csvImportApi.commitTeams(csv)
        : await csvImportApi.commitPlayers(csv, seasonId);
      setResult(res);
      setStage('done');
      onImported();
    } catch (e: unknown) {
      setErrMsg((e as Error).message ?? 'Import failed.');
      setStage('error');
    }
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) readFile(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) readFile(file);
  }

  // Determine if confirm button should be enabled
  const hasValidRows = preview
    ? mode === 'teams'
      ? (preview.created?.length ?? 0) > 0 || (preview.updated?.length ?? 0) > 0
      : (preview.valid?.length ?? 0) > 0
    : false;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-[#1A1A1A] border border-white/10 rounded-xl w-full max-w-lg shadow-2xl">
        {/* Header */}
        <div className="px-6 py-5 border-b border-white/10 flex items-center justify-between">
          <h3 className="font-display font-extrabold italic uppercase text-[16px]">{title}</h3>
          <button onClick={onClose} className="text-[#555] hover:text-white transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* IDLE */}
          {stage === 'idle' && (
            <>
              <p className="text-[13px] text-[#888]">
                {mode === 'teams'
                  ? 'Upload a CSV to create or update teams. Download the template to see the required format.'
                  : 'Upload a CSV to import players. Download the template to see the required format.'}
              </p>
              <Button variant="ghost" size="sm" onClick={downloadTemplate} className="gap-1.5">
                <Download size={13} /> Download Template
              </Button>
              {/* Drop zone */}
              <div
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                className={cn(
                  'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors',
                  dragging ? 'border-brand bg-brand/[0.06] text-white' : 'border-white/20 text-[#555] hover:border-white/40 hover:text-[#888]',
                )}
              >
                <Upload size={20} className="mx-auto mb-2 opacity-60" />
                <p className="text-[13px]">Drop CSV here or click to browse</p>
                <p className="text-[11px] mt-1 opacity-60">Accepts .csv files</p>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleFileInput}
              />
            </>
          )}

          {/* PREVIEWING */}
          {stage === 'previewing' && (
            <div className="flex items-center gap-2 text-[#888] text-[13px] py-4">
              <RefreshCw size={13} className="animate-spin" /> Parsing CSV…
            </div>
          )}

          {/* PREVIEW */}
          {stage === 'preview' && preview && (
            <>
              <p className="text-[13px] text-[#888]">{preview.message}</p>

              {/* Teams mode: created */}
              {mode === 'teams' && (preview.created?.length ?? 0) > 0 && (
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-[#555] mb-1">Will Create ({preview.created!.length})</p>
                  <ul className="space-y-1 max-h-40 overflow-y-auto">
                    {preview.created!.map((t, i) => (
                      <li key={i} className="text-[13px] text-green-400 flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />
                        {t.name}{t.division ? ` — ${t.division}` : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Teams mode: updated */}
              {mode === 'teams' && (preview.updated?.length ?? 0) > 0 && (
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-[#555] mb-1">Will Update ({preview.updated!.length})</p>
                  <ul className="space-y-1 max-h-40 overflow-y-auto">
                    {preview.updated!.map((t, i) => (
                      <li key={i} className="text-[13px] text-yellow-400 flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 shrink-0" />
                        {t.name} → {t.division}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Teams mode: skipped */}
              {mode === 'teams' && (preview.skipped?.length ?? 0) > 0 && (
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-[#555] mb-1">Unchanged ({preview.skipped!.length})</p>
                  <p className="text-[12px] text-[#555]">{preview.skipped!.join(', ')}</p>
                </div>
              )}

              {/* Players mode: valid rows */}
              {mode === 'players' && (preview.valid?.length ?? 0) > 0 && (
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-[#555] mb-1">Valid Players ({preview.valid!.length})</p>
                  <ul className="space-y-1 max-h-48 overflow-y-auto">
                    {preview.valid!.map((v, i) => (
                      <li key={i} className={cn(
                        'text-[13px] flex items-center gap-2',
                        v.teamFound ? 'text-green-400' : 'text-yellow-400',
                      )}>
                        <span className={cn(
                          'w-1.5 h-1.5 rounded-full shrink-0',
                          v.teamFound ? 'bg-green-400' : 'bg-yellow-400',
                        )} />
                        {v.firstName} {v.lastName}
                        <span className="text-[11px] opacity-70">— {v.teamName}{!v.teamFound ? ' (team not found)' : ''}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Errors */}
              {preview.errors.length > 0 && (
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-[#E07070] mb-1 flex items-center gap-1">
                    <AlertTriangle size={11} /> Errors ({preview.errors.length})
                  </p>
                  <ul className="space-y-1 max-h-40 overflow-y-auto">
                    {preview.errors.map((err, i) => (
                      <li key={i} className="text-[13px] text-[#E07070]">
                        Row {err.row}: {err.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <Button variant="ghost" onClick={onClose} className="flex-1">Cancel</Button>
                <Button
                  variant="primary"
                  onClick={runCommit}
                  disabled={!hasValidRows}
                  className="flex-1"
                >
                  Confirm Import
                </Button>
              </div>
            </>
          )}

          {/* IMPORTING */}
          {stage === 'importing' && (
            <div className="flex items-center gap-2 text-[#888] text-[13px] py-4">
              <RefreshCw size={13} className="animate-spin" /> Importing…
            </div>
          )}

          {/* DONE */}
          {stage === 'done' && result && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-green-400 text-[13px]">
                <CheckCircle2 size={15} /> {result.message}
              </div>
              <Button variant="primary" onClick={onClose} className="w-full">Done</Button>
            </div>
          )}

          {/* ERROR */}
          {stage === 'error' && (
            <div className="space-y-3">
              <p className="text-[13px] text-[#E07070]">{errMsg}</p>
              <div className="flex gap-3">
                <Button variant="ghost" onClick={onClose} className="flex-1">Close</Button>
                <Button variant="outline" onClick={() => { setStage('idle'); setCsv(''); }} className="flex-1">
                  <RefreshCw size={13} /> Retry
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
