"use client";

import { useState } from "react";

export default function CsvUpload({
  title,
  description,
  expectedPattern,
  confirmLabel,
  onUpload,
}: {
  title: string;
  description: string;
  expectedPattern: string;
  confirmLabel: string;
  onUpload: (filename: string, csv: string, confirm: boolean) => Promise<{ ok: boolean; message: string }>;
}) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [csvText, setCsvText] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [dragActive, setDragActive] = useState(false);

  function readFile(file: File) {
    setResult(null);
    setFileName(file.name);
    setConfirmed(false);
    const reader = new FileReader();
    reader.onload = () => setCsvText(reader.result as string);
    reader.readAsText(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) readFile(file);
  }

  async function submit() {
    if (!fileName || !csvText) return;
    setUploading(true);
    setResult(null);
    const res = await onUpload(fileName, csvText, confirmed);
    setUploading(false);
    setResult(res);
    if (res.ok) {
      setFileName(null);
      setCsvText(null);
      setConfirmed(false);
    }
  }

  return (
    <div className="rounded-md border border-surface2 bg-surface px-5 py-5">
      <h3 className="font-display text-lg">{title}</h3>
      <p className="mt-1 text-sm text-muted">{description}</p>
      <p className="mt-2 text-xs text-gold">Expected filename: {expectedPattern}</p>

      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
        className={`mt-4 flex cursor-pointer flex-col items-center justify-center rounded-md border border-dashed px-4 py-8 text-center text-sm transition-colors ${
          dragActive ? "border-gold bg-gold/5 text-gold" : "border-surface2 text-muted hover:border-gold/50"
        }`}
      >
        {fileName ? (
          <span className="text-parchment">{fileName}</span>
        ) : (
          <span>Drag a .csv file here, or click to choose one</span>
        )}
        <input
          type="file"
          accept=".csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) readFile(file);
          }}
        />
      </label>

      {fileName && (
        <div className="mt-4">
          <label className="flex items-start gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-0.5"
            />
            <span>{confirmLabel}</span>
          </label>
          <button
            onClick={submit}
            disabled={!confirmed || uploading}
            className="mt-3 rounded-md bg-ember px-5 py-2 text-sm font-medium text-jungle hover:opacity-90 disabled:opacity-40"
          >
            {uploading ? "Uploading…" : "Upload"}
          </button>
        </div>
      )}

      {result && (
        <p className={`mt-3 text-sm ${result.ok ? "text-gold" : "text-rust"}`}>{result.message}</p>
      )}
    </div>
  );
}
