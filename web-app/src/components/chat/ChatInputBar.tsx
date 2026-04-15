'use client';

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { AttachedFile } from "@/app/chat/types";
import { useBridge } from "@/lib/BridgeContext";

interface FsEntry { name: string; path: string; }

interface ChatInputBarProps {
  input: string;
  setInput: (value: string) => void;
  isLoading: boolean;
  attachedFiles: AttachedFile[];
  setAttachedFiles: React.Dispatch<React.SetStateAction<AttachedFile[]>>;
  attachmentError: string | null;
  isDragging: boolean;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onSubmit: (e: React.FormEvent) => void;
  onDragEnter: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  processFiles: (files: File[]) => void;
  workingDir?: string | null;
  onWorkingDirChange?: (path: string | null) => void;
  hasMessages?: boolean;
}

function homeify(p: string): string {
  return p.replace(/^\/Users\/[^/]+/, "~").replace(/^\/home\/[^/]+/, "~");
}

export default function ChatInputBar({
  input,
  setInput,
  isLoading,
  attachedFiles,
  setAttachedFiles,
  attachmentError,
  isDragging,
  textareaRef,
  fileInputRef,
  onSubmit,
  onDragEnter,
  onDragLeave,
  onDragOver,
  onDrop,
  onFileSelect,
  processFiles,
  workingDir,
  onWorkingDirChange,
  hasMessages = true,
}: ChatInputBarProps) {
  const { isLocal, bridgeUrl } = useBridge();

  // ── Popover state ──────────────────────────────────────────────────────────
  const [popoverOpen, setPopoverOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // ── File browser state ─────────────────────────────────────────────────────
  const [browsePath, setBrowsePath] = useState("");
  const [browseParent, setBrowseParent] = useState<string | null>(null);
  const [browseEntries, setBrowseEntries] = useState<FsEntry[]>([]);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browseError, setBrowseError] = useState<string | null>(null);
  // manualPath: editable fallback; stays in sync with browse navigation
  const [manualPath, setManualPath] = useState("");
  const manualInputRef = useRef<HTMLInputElement>(null);

  // ── Fetch a directory listing ──────────────────────────────────────────────
  const fetchDir = useCallback(async (path?: string) => {
    setBrowseLoading(true);
    setBrowseError(null);
    try {
      const url = path
        ? `${bridgeUrl}/fs/list?path=${encodeURIComponent(path)}`
        : `${bridgeUrl}/fs/list`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to read directory");
      const data = await res.json();
      setBrowsePath(data.path);
      setManualPath(data.path);
      setBrowseParent(data.parent);
      setBrowseEntries(data.entries);
    } catch {
      setBrowseError("Could not read directory");
    } finally {
      setBrowseLoading(false);
    }
  }, [bridgeUrl]);

  // Open popover → seed manual path + fetch listing
  useEffect(() => {
    if (popoverOpen) {
      const seed = workingDir ?? "";
      setManualPath(seed);
      fetchDir(workingDir ?? undefined);
    }
  }, [popoverOpen]); // intentionally omitting fetchDir/workingDir

  // Close on outside click
  useEffect(() => {
    if (!popoverOpen) return;
    function handle(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setPopoverOpen(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [popoverOpen]);

  function handleSelectCurrent() {
    const path = manualPath.trim() || browsePath;
    if (!path) return;
    onWorkingDirChange?.(path);
    setPopoverOpen(false);
  }

  function handleClear() {
    onWorkingDirChange?.(null);
  }

  // New session prompt: local mode, no messages sent yet, no dir chosen
  const showDirPrompt = isLocal && !hasMessages && !workingDir;

  return (
    <div className="shrink-0 border-t border-zinc-200 bg-white px-6 py-4">
      <form onSubmit={onSubmit} className="mx-auto max-w-3xl">

        {/* New-session dir prompt */}
        {showDirPrompt && (
          <div className="mb-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="shrink-0 text-amber-500">
              <path d="M20 6h-8l-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2z" />
            </svg>
            <p className="flex-1 text-xs text-amber-700">
              Choose a working directory so Claude Code knows where to run.
            </p>
            <button
              type="button"
              onClick={() => setPopoverOpen(true)}
              className="shrink-0 rounded-md bg-amber-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-amber-700 transition-colors"
            >
              Choose
            </button>
          </div>
        )}

        {/* Attachment error */}
        {attachmentError && (
          <p className="mb-2 text-xs text-red-600">{attachmentError}</p>
        )}

        <div
          className={`relative rounded-lg border bg-white focus-within:ring-1 focus-within:ring-zinc-900 transition-colors ${
            isDragging
              ? "border-zinc-900 ring-1 ring-zinc-900 bg-zinc-50"
              : "border-zinc-300 focus-within:border-zinc-900"
          }`}
          onDragEnter={onDragEnter}
          onDragLeave={onDragLeave}
          onDragOver={onDragOver}
          onDrop={onDrop}
        >
          {/* Drag overlay */}
          {isDragging && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-lg">
              <p className="text-sm font-medium text-zinc-500">Drop image to attach</p>
            </div>
          )}

          {/* Thumbnails strip */}
          {attachedFiles.length > 0 && (
            <div className="flex flex-wrap gap-2 border-b border-zinc-100 px-3 pt-3 pb-2">
              {attachedFiles.map((f) => (
                <div key={f.id} className="relative shrink-0">
                  {f.kind === "image" ? (
                    <img src={f.previewUrl!} alt={f.file.name} className="h-16 w-16 rounded-md object-cover" />
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded-md border border-zinc-200 bg-zinc-100 px-1">
                      <div className="flex flex-col items-center gap-1">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-zinc-500">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                        </svg>
                        <span className="w-full truncate text-center text-[9px] leading-tight text-zinc-600">{f.file.name}</span>
                      </div>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      if (f.kind === "image" && f.previewUrl) URL.revokeObjectURL(f.previewUrl);
                      setAttachedFiles((prev) => prev.filter((x) => x.id !== f.id));
                    }}
                    className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-zinc-700 text-[9px] text-white hover:bg-zinc-900"
                    aria-label="Remove attachment"
                  >✕</button>
                </div>
              ))}
            </div>
          )}

          {/* Textarea row */}
          <div className="flex items-center">
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  const canSend = !isLoading && (input.trim() || attachedFiles.length > 0) && !attachedFiles.some((f) => f.kind === "text" && f.textContent === null);
                  if (canSend) onSubmit(e as unknown as React.FormEvent);
                }
              }}
              disabled={isLoading}
              placeholder="Ask me anything..."
              className="flex-1 max-h-40 resize-none overflow-y-auto bg-transparent px-4 py-3 text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none disabled:text-zinc-500"
              onPaste={(e) => {
                const pastedFiles = Array.from(e.clipboardData.items)
                  .filter((item) => item.kind === "file")
                  .map((item) => item.getAsFile())
                  .filter((f): f is File => f !== null);
                if (pastedFiles.length > 0) { e.preventDefault(); processFiles(pastedFiles); }
              }}
            />

            {/* Folder button — bridge only */}
            {isLocal && (
              <div className="relative" ref={popoverRef}>
                <button
                  type="button"
                  onClick={() => setPopoverOpen((o) => !o)}
                  disabled={isLoading}
                  title={workingDir ? `Workspace: ${workingDir}` : "Set working directory"}
                  className={`shrink-0 p-3 transition-colors disabled:cursor-not-allowed ${
                    workingDir ? "text-zinc-900 hover:text-zinc-600" : "text-zinc-400 hover:text-zinc-700"
                  }`}
                  aria-label="Set working directory"
                >
                  {workingDir ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                      <path d="M20 6h-8l-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2z" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                    </svg>
                  )}
                </button>

                {/* Popover */}
                {popoverOpen && (
                  <div className="absolute bottom-full right-0 mb-2 w-[480px] rounded-xl border border-zinc-200 bg-white shadow-xl z-50 overflow-hidden">

                    {/* Header — current browsed path */}
                    <div className="flex items-center gap-2 border-b border-zinc-100 px-3 py-2.5 bg-zinc-50">
                      <button
                        type="button"
                        onClick={() => browseParent && fetchDir(browseParent)}
                        disabled={!browseParent || browseLoading}
                        className="shrink-0 rounded p-1 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        aria-label="Go up"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="15 18 9 12 15 6" />
                        </svg>
                      </button>
                      <span className="flex-1 text-xs font-mono text-zinc-600 break-all leading-snug">
                        {browsePath ? homeify(browsePath) : "…"}
                      </span>
                      {browseLoading && (
                        <svg className="animate-spin shrink-0 text-zinc-400" xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                        </svg>
                      )}
                    </div>

                    {/* Directory listing */}
                    <div className="max-h-48 overflow-y-auto">
                      {browseError ? (
                        <div className="px-4 py-4">
                          <p className="mb-2 text-xs text-red-500">{browseError} — type a path manually:</p>
                          <input
                            ref={manualInputRef}
                            type="text"
                            value={manualPath}
                            onChange={(e) => setManualPath(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") { e.preventDefault(); handleSelectCurrent(); }
                              if (e.key === "Escape") setPopoverOpen(false);
                            }}
                            placeholder="/path/to/project"
                            className="w-full rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-xs font-mono text-zinc-900 placeholder-zinc-400 focus:border-zinc-400 focus:outline-none"
                            autoFocus
                          />
                        </div>
                      ) : browseEntries.length === 0 && !browseLoading ? (
                        <p className="px-4 py-6 text-center text-xs text-zinc-400">No subdirectories</p>
                      ) : (
                        <ul>
                          {browseEntries.map((entry) => (
                            <li key={entry.path}>
                              <button
                                type="button"
                                onClick={() => fetchDir(entry.path)}
                                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-zinc-50 transition-colors group"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="shrink-0 text-zinc-400 group-hover:text-zinc-600">
                                  <path d="M20 6h-8l-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2z" />
                                </svg>
                                <span className="flex-1 text-zinc-700 group-hover:text-zinc-900">{entry.name}</span>
                                <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-zinc-300 group-hover:text-zinc-500">
                                  <polyline points="9 18 15 12 9 6" />
                                </svg>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    {/* Footer — manual input (non-error) + select */}
                    {!browseError && (
                      <div className="border-t border-zinc-100 px-3 py-2">
                        <input
                          type="text"
                          value={manualPath}
                          onChange={(e) => setManualPath(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") { e.preventDefault(); handleSelectCurrent(); }
                            if (e.key === "Escape") setPopoverOpen(false);
                          }}
                          placeholder="Or type a path…"
                          className="w-full rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-xs font-mono text-zinc-700 placeholder-zinc-400 focus:border-zinc-400 focus:outline-none"
                        />
                      </div>
                    )}

                    <div className="flex items-center justify-between gap-2 border-t border-zinc-100 px-3 py-2.5">
                      {workingDir ? (
                        <button
                          type="button"
                          onClick={() => { handleClear(); setPopoverOpen(false); }}
                          className="text-[11px] text-zinc-400 hover:text-zinc-600 transition-colors"
                        >
                          Reset to bridge default
                        </button>
                      ) : <span />}
                      <button
                        type="button"
                        onClick={handleSelectCurrent}
                        disabled={!manualPath.trim() && !browsePath}
                        className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 disabled:bg-zinc-200 disabled:text-zinc-400 disabled:cursor-not-allowed transition-colors"
                      >
                        Select this folder
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Paperclip button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading}
              className="shrink-0 p-3 text-zinc-400 transition-colors hover:text-zinc-700 disabled:cursor-not-allowed"
              aria-label="Attach image"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
              </svg>
            </button>

            {/* Send button */}
            <button
              type="submit"
              disabled={isLoading || (!input.trim() && attachedFiles.length === 0) || attachedFiles.some((f) => f.kind === "text" && f.textContent === null)}
              className="shrink-0 mr-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
            >
              Send
            </button>
          </div>
        </div>

        {/* Active working dir pill */}
        {isLocal && workingDir && (
          <div className="mt-1.5 flex items-center gap-1.5">
            <div className="flex items-center gap-1.5 border-l-2 border-zinc-300 pl-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="currentColor" className="shrink-0 text-zinc-400">
                <path d="M20 6h-8l-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2z" />
              </svg>
              <span className="text-[11px] text-zinc-500 font-mono break-all">
                {homeify(workingDir)}
              </span>
              <button
                type="button"
                onClick={handleClear}
                className="ml-0.5 shrink-0 text-zinc-400 hover:text-zinc-600 transition-colors"
                aria-label="Clear working directory"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Hidden file input */}
        <input ref={fileInputRef} type="file" multiple className="hidden" onChange={onFileSelect} />
      </form>
    </div>
  );
}
