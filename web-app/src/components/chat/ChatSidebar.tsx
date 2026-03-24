'use client';

import React from "react";
import type { Session } from "@/app/chat/types";

interface ChatSidebarProps {
  sessions: Session[];
  activeSessionId: string | null;
  sidebarOpen: boolean;
  hoveredSessionId: string | null;
  openMenuId: string | null;
  renamingSessionId: string | null;
  renameValue: string;
  renameInputRef: React.RefObject<HTMLInputElement | null>;
  setSidebarOpen: (open: boolean) => void;
  setHoveredSessionId: (id: string | null) => void;
  setOpenMenuId: (id: string | null) => void;
  setRenamingSessionId: (id: string | null) => void;
  setRenameValue: (value: string) => void;
  startNewSession: () => void;
  loadSession: (id: string) => void;
  handleRenameSubmit: (id: string) => void;
  handleTogglePin: (id: string, currentlyPinned: boolean) => void;
  handleDelete: (id: string) => void;
  formatSessionTime: (createdAt: string) => string;
}

export default function ChatSidebar({
  sessions,
  activeSessionId,
  sidebarOpen,
  hoveredSessionId,
  openMenuId,
  renamingSessionId,
  renameValue,
  renameInputRef,
  setSidebarOpen,
  setHoveredSessionId,
  setOpenMenuId,
  setRenamingSessionId,
  setRenameValue,
  startNewSession,
  loadSession,
  handleRenameSubmit,
  handleTogglePin,
  handleDelete,
  formatSessionTime,
}: ChatSidebarProps) {
  return (
    <div
      className={`flex shrink-0 flex-col border-r border-zinc-200 bg-zinc-50 transition-all duration-200 ${
        sidebarOpen ? "w-64" : "w-10"
      }`}
    >
      {sidebarOpen ? (
        <>
          {/* Sidebar Header */}
          <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-4">
            <span className="text-sm font-semibold text-zinc-900">Chats</span>
            <button
              onClick={() => setSidebarOpen(false)}
              className="rounded p-1 text-zinc-500 transition-colors hover:bg-zinc-200 hover:text-zinc-900"
              aria-label="Collapse sidebar"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
          </div>

          {/* New Chat Button */}
          <div className="px-3 py-3">
            <button
              onClick={startNewSession}
              className="flex w-full items-center gap-2 rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
              New Chat
            </button>
          </div>

          {/* Session List */}
          <div className="flex-1 space-y-0.5 overflow-y-auto px-2 py-1">
            {sessions.map((s) => (
              <div
                key={s.id}
                className="relative"
                onMouseEnter={() => setHoveredSessionId(s.id)}
                onMouseLeave={() => setHoveredSessionId(null)}
              >
                {renamingSessionId === s.id ? (
                  <div className="rounded-lg px-3 py-2.5">
                    <input
                      ref={renameInputRef}
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleRenameSubmit(s.id);
                        if (e.key === "Escape") setRenamingSessionId(null);
                      }}
                      onBlur={() => handleRenameSubmit(s.id)}
                      className="w-full rounded border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-900 focus:border-zinc-900 focus:outline-none"
                    />
                  </div>
                ) : (
                  <button
                    onClick={() => loadSession(s.id)}
                    className={`w-full rounded-lg px-3 py-2.5 text-left text-xs transition-colors ${
                      s.id === activeSessionId
                        ? "bg-zinc-200 text-zinc-900"
                        : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                    }`}
                  >
                    <span className="flex items-center gap-1.5 pr-5">
                      {s.is_pinned && (
                        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="currentColor" className="shrink-0 text-zinc-400">
                          <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5v6h2v-6h5v-2l-2-2z"/>
                        </svg>
                      )}
                      <span className="truncate font-medium">
                        {s.display_name ?? formatSessionTime(s.created_at)}
                      </span>
                      {(!s.last_read_at || new Date(s.last_message_at) > new Date(s.last_read_at)) && s.id !== activeSessionId && (
                        <span className="ml-auto shrink-0 h-2 w-2 rounded-full bg-rose-700" />
                      )}
                    </span>
                    {s.display_name && (
                      <span className="mt-0.5 block truncate text-[11px] text-zinc-400">
                        {formatSessionTime(s.created_at)}
                      </span>
                    )}
                  </button>
                )}

                {/* Ellipsis button */}
                {renamingSessionId !== s.id && (hoveredSessionId === s.id || openMenuId === s.id) && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenMenuId(openMenuId === s.id ? null : s.id);
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700"
                    aria-label="Session options"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <circle cx="5" cy="12" r="2" />
                      <circle cx="12" cy="12" r="2" />
                      <circle cx="19" cy="12" r="2" />
                    </svg>
                  </button>
                )}

                {/* Dropdown menu */}
                {openMenuId === s.id && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="absolute right-2 top-full z-10 mt-1 w-32 rounded-lg border border-zinc-200 bg-white py-1 shadow-md"
                  >
                    <button
                      onClick={() => {
                        setOpenMenuId(null);
                        setRenamingSessionId(s.id);
                        setRenameValue(s.display_name ?? "");
                      }}
                      className="w-full px-3 py-1.5 text-left text-xs text-zinc-700 hover:bg-zinc-100"
                    >
                      Rename
                    </button>
                    <button
                      onClick={() => {
                        setOpenMenuId(null);
                        handleTogglePin(s.id, s.is_pinned);
                      }}
                      className="w-full px-3 py-1.5 text-left text-xs text-zinc-700 hover:bg-zinc-100"
                    >
                      {s.is_pinned ? "Unpin" : "Pin"}
                    </button>
                    <button
                      onClick={() => {
                        setOpenMenuId(null);
                        handleDelete(s.id);
                      }}
                      className="w-full px-3 py-1.5 text-left text-xs text-red-600 hover:bg-zinc-100"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      ) : (
        /* Collapsed icon strip */
        <div className="flex flex-col items-center gap-2 py-3">
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded p-1.5 text-zinc-500 transition-colors hover:bg-zinc-200 hover:text-zinc-900"
            aria-label="Expand sidebar"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
          <button
            onClick={startNewSession}
            className="rounded p-1.5 text-zinc-500 transition-colors hover:bg-zinc-200 hover:text-zinc-900"
            aria-label="New chat"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
