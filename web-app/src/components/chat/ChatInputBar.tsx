'use client';

import React from "react";
import type { AttachedFile } from "@/app/chat/types";

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
}: ChatInputBarProps) {
  return (
    <div className="shrink-0 border-t border-zinc-200 bg-white px-6 py-4">
      <form onSubmit={onSubmit} className="mx-auto max-w-2xl">
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
                    <img
                      src={f.previewUrl!}
                      alt={f.file.name}
                      className="h-16 w-16 rounded-md object-cover"
                    />
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded-md border border-zinc-200 bg-zinc-100 px-1">
                      <div className="flex flex-col items-center gap-1">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-zinc-500">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                        </svg>
                        <span className="w-full truncate text-center text-[9px] leading-tight text-zinc-600">
                          {f.file.name}
                        </span>
                      </div>
                    </div>
                  )}
                  {/* Remove button */}
                  <button
                    type="button"
                    onClick={() => {
                      if (f.kind === "image" && f.previewUrl) URL.revokeObjectURL(f.previewUrl);
                      setAttachedFiles((prev) => prev.filter((x) => x.id !== f.id));
                    }}
                    className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-zinc-700 text-[9px] text-white hover:bg-zinc-900"
                    aria-label="Remove attachment"
                  >
                    ✕
                  </button>
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
                if (pastedFiles.length > 0) {
                  e.preventDefault();
                  processFiles(pastedFiles);
                }
              }}
            />

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

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={onFileSelect}
        />
      </form>
    </div>
  );
}
