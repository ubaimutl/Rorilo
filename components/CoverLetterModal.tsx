'use client';

import React, { useState } from 'react';
import { X, Download, Copy, Check, Save, FileText } from 'lucide-react';
import { downloadCoverLetterPdf, CoverLetterPdfData, CoverLetterTemplate, COVER_LETTER_TEMPLATES } from '@/lib/pdf/generatePdf';
import { useI18n } from '@/components/I18nProvider';
import { notify } from '@/components/AppNotifications';

export interface CoverLetterModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentId?: string;
  initialContent: string;
  jobTitle: string;
  companyName: string;
  candidateName: string;
  candidateEmail?: string;
  candidatePhone?: string;
  candidateLocation?: string;
}

export function CoverLetterModal({
  isOpen,
  onClose,
  documentId,
  initialContent,
  jobTitle,
  companyName,
  candidateName,
  candidateEmail,
  candidatePhone,
  candidateLocation,
}: CoverLetterModalProps) {
  const [content, setContent] = useState(initialContent);
  const [copied, setCopied] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [template, setTemplate] = useState<CoverLetterTemplate>('german_din');
  const { t } = useI18n();

  if (!isOpen) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      alert(t('coverletter.copyFailed'));
    }
  };

  const handleSave = async () => {
    if (!documentId) return;
    setIsSaving(true);
    try {
      const res = await fetch('/api/documents', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId, content }),
      });
      if (res.ok) {
        setSaveMessage(t('coverletter.saved'));
        setTimeout(() => setSaveMessage(null), 2000);
      } else {
        alert(t('coverletter.saveFailed'));
      }
    } catch {
      alert(t('coverletter.saveFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownloadPdf = () => {
    const pdfData: CoverLetterPdfData = {
      candidateName,
      candidateTitle: 'Software Engineer',
      candidateEmail,
      candidatePhone,
      candidateLocation,
      companyName,
      jobTitle,
      content,
      template,
    };
    downloadCoverLetterPdf(pdfData, `Cover_Letter_${companyName.replace(/\s+/g, '_')}.pdf`);
    notify({
      type: 'success',
      title: 'PDF download started',
      message: 'Check your Downloads folder.',
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
      <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-600">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Cover Letter Review & PDF Export</h2>
              <p className="text-xs text-slate-500">
                {companyName} • {jobTitle}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body / Text Editor */}
        <div className="p-6 flex-1 overflow-y-auto">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-700">Editable Document Text</span>
            <span className="text-xs text-slate-400">Edit before generating PDF</span>
          </div>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={16}
            className="w-full text-xs font-mono leading-relaxed p-4 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-slate-800 bg-slate-50/50"
          />
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Copy Text'}</span>
            </button>
            {documentId && (
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{isSaving ? 'Saving...' : saveMessage || 'Save Changes'}</span>
              </button>
            )}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <select
              value={template}
              onChange={(e) => setTemplate(e.target.value as any)}
              aria-label="Cover letter template"
              className="h-8 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-800 outline-none cursor-pointer shadow-xs"
            >
              {COVER_LETTER_TEMPLATES.map((tmpl) => (
                <option key={tmpl.id} value={tmpl.id}>
                  {tmpl.name} ({tmpl.tagline})
                </option>
              ))}
            </select>

            <button
              onClick={onClose}
              className="text-xs font-medium text-slate-600 hover:text-slate-800 px-3 py-1.5 rounded-lg"
            >
              Done
            </button>
            <button
              onClick={handleDownloadPdf}
              className="text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors shadow-xs"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download PDF</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
