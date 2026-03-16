'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';

interface FileEntry {
  name: string;
  type: 'file' | 'directory';
  path: string;
  size?: number;
}

interface DirectoryNode {
  entry: FileEntry;
  children: DirectoryNode[] | null; // null = not yet loaded
  isOpen: boolean;
}

interface EventLogEntry {
  ts?: string;
  provider?: string;
  type?: string;
  resource?: string;
  // shared
  raw_ref?: string;
  // slack-specific
  actor_id?: string;
  actor_display_name?: string;
  actor_real_name?: string;
  text?: string;
  // github-specific
  author?: string;
  pr_title?: string;
  pr_number?: number;
  // linear-specific
  actor?: string;
  issue_title?: string;
  comment_body?: string;
  [key: string]: unknown;
}

function buildTree(entries: FileEntry[]): DirectoryNode[] {
  return entries.map((entry) => ({
    entry,
    children: entry.type === 'directory' ? null : undefined as never,
    isOpen: false,
  }));
}

function isEventLogPath(path: string): boolean {
  return path === 'event_logs' || path.startsWith('event_logs/');
}

function formatEventTs(ts: string): string {
  try {
    return new Date(ts).toLocaleString('en-US', {
      month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });
  } catch {
    return ts;
  }
}

function parseJsonlEvents(content: string): Array<{ raw: string; parsed: EventLogEntry | null }> {
  return content
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => {
      try {
        return { raw: line, parsed: JSON.parse(line) as EventLogEntry };
      } catch {
        return { raw: line, parsed: null };
      }
    });
}

function resolveSlackActor(e: EventLogEntry): string | null {
  return e.actor_real_name ?? e.actor_display_name ?? e.actor_id ?? null;
}

function EventCard({ e }: { e: EventLogEntry }) {
  const { ts, type, provider, raw_ref } = e;
  const showRawRef = provider !== 'slack' && raw_ref;

  // Actor label
  let actorLabel: string | null = null;
  if (provider === 'slack') {
    actorLabel = resolveSlackActor(e);
  } else if (provider === 'github') {
    actorLabel = e.author ?? null;
  } else if (provider === 'linear') {
    actorLabel = e.actor ?? null;
  }

  // Primary content line
  let primaryContent: string | null = null;
  if (provider === 'github' && e.pr_title) {
    primaryContent = e.pr_number ? `#${e.pr_number} ${e.pr_title}` : e.pr_title;
  } else if (provider === 'linear') {
    primaryContent = e.issue_title ?? null;
  }

  // Body text
  let bodyText: string | null = null;
  if (provider === 'slack' && e.text) {
    bodyText = e.text;
  } else if (provider === 'linear' && type === 'comment.created' && e.comment_body) {
    bodyText = e.comment_body;
  }

  return (
    <div className="rounded-lg border border-zinc-100 bg-white px-3.5 py-3">
      <div className="mb-1.5 flex items-center gap-2">
        {type && (
          <span
            className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[10px] font-medium text-zinc-600"
            style={{ fontFamily: 'var(--font-geist-mono)' }}
          >
            {type}
          </span>
        )}
        {actorLabel && <span className="text-xs font-medium text-zinc-900">{actorLabel}</span>}
        {ts && (
          <span
            className="ml-auto text-[10px] text-zinc-400"
            style={{ fontFamily: 'var(--font-geist-mono)' }}
          >
            {formatEventTs(ts)}
          </span>
        )}
      </div>
      {primaryContent && (
        <p className="text-xs font-medium leading-relaxed text-zinc-900">{primaryContent}</p>
      )}
      {bodyText && (
        <p className="mt-1 text-xs leading-relaxed text-zinc-800">{bodyText}</p>
      )}
      {showRawRef && (
        <a
          href={raw_ref}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1.5 inline-flex items-center gap-1 text-[10px] text-zinc-400 transition-colors hover:text-zinc-700"
          style={{ fontFamily: 'var(--font-geist-mono)' }}
        >
          View original
          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
        </a>
      )}
    </div>
  );
}

function EventLogViewer({ content }: { content: string }) {
  const events = parseJsonlEvents(content);

  if (events.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-xs text-zinc-400">No events logged yet.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-2">
      {events.map((e, i) => {
        if (!e.parsed) {
          return (
            <div key={i} className="rounded border border-red-100 bg-red-50 px-3 py-2">
              <span
                className="text-[10px] font-medium uppercase tracking-wide text-red-400"
                style={{ fontFamily: 'var(--font-geist-mono)' }}
              >
                malformed
              </span>
              <p
                className="mt-1 break-all text-xs text-red-600"
                style={{ fontFamily: 'var(--font-geist-mono)' }}
              >
                {e.raw}
              </p>
            </div>
          );
        }
        return <EventCard key={i} e={e.parsed} />;
      })}
    </div>
  );
}

export default function AgentFilesTab() {
  const { session } = useAuth();
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL;

  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [agentRunStatus, setAgentRunStatus] = useState<'idle' | 'running'>('idle');
  const [tree, setTree] = useState<DirectoryNode[]>([]);
  const [treeLoading, setTreeLoading] = useState(true);
  const [treeError, setTreeError] = useState<string | null>(null);

  // Editor state
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [editorContent, setEditorContent] = useState('');
  const [fileLoading, setFileLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');

  // New file state
  const [showNewFileInput, setShowNewFileInput] = useState(false);
  const [newFilePath, setNewFilePath] = useState('');
  const [creating, setCreating] = useState(false);

  const saveStatusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const token = session?.access_token ?? '';

  const readOnly = selectedPath !== null && isEventLogPath(selectedPath);
  const isJsonl = selectedPath?.endsWith('.jsonl') ?? false;

  // ── Fetch workspace status + subscribe to realtime ───────────────────────

  useEffect(() => {
    if (!token) return;

    let channel: ReturnType<typeof supabase.channel> | null = null;
    const supabase = createClient();

    async function init() {
      const res = await fetch(`${apiBase}/filesystem/workspace-status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      setWorkspaceId(data.workspace_id);
      setAgentRunStatus(data.agent_run_status);

      // Subscribe to live updates
      channel = supabase
        .channel('workspace-agent-status')
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'workspaces',
            filter: `id=eq.${data.workspace_id}`,
          },
          (payload) => {
            const status = (payload.new as { agent_run_status: string }).agent_run_status;
            setAgentRunStatus(status as 'idle' | 'running');
          }
        )
        .subscribe();
    }

    init();
    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [token, apiBase]);

  // ── Load root directory ───────────────────────────────────────────────────

  const fetchDirectory = useCallback(
    async (path: string): Promise<DirectoryNode[]> => {
      const res = await fetch(
        `${apiBase}/filesystem?path=${encodeURIComponent(path)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) throw new Error('Failed to load directory');
      const data = await res.json();
      return buildTree(data.entries);
    },
    [apiBase, token]
  );

  useEffect(() => {
    if (!token) return;
    setTreeLoading(true);
    fetchDirectory('.')
      .then(setTree)
      .catch(() => setTreeError('Could not load workspace files.'))
      .finally(() => setTreeLoading(false));
  }, [token, fetchDirectory]);

  // ── File tree helpers ─────────────────────────────────────────────────────

  function updateNodeInTree(
    nodes: DirectoryNode[],
    targetPath: string,
    updater: (node: DirectoryNode) => DirectoryNode
  ): DirectoryNode[] {
    return nodes.map((node) => {
      if (node.entry.path === targetPath) return updater(node);
      if (node.children) {
        return { ...node, children: updateNodeInTree(node.children, targetPath, updater) };
      }
      return node;
    });
  }

  async function handleToggleDir(node: DirectoryNode) {
    const { path } = node.entry;

    if (node.isOpen) {
      setTree((prev) =>
        updateNodeInTree(prev, path, (n) => ({ ...n, isOpen: false }))
      );
      return;
    }

    if (node.children === null) {
      try {
        const children = await fetchDirectory(path);
        setTree((prev) =>
          updateNodeInTree(prev, path, (n) => ({ ...n, isOpen: true, children }))
        );
      } catch {
        // silently ignore directory load errors
      }
    } else {
      setTree((prev) =>
        updateNodeInTree(prev, path, (n) => ({ ...n, isOpen: true }))
      );
    }
  }

  async function handleSelectFile(path: string) {
    if (selectedPath === path) return;
    setSelectedPath(path);
    setEditorContent('');
    setSaveStatus('idle');
    setFileLoading(true);
    try {
      const res = await fetch(
        `${apiBase}/filesystem/file?path=${encodeURIComponent(path)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) throw new Error();
      const data = await res.json();
      setEditorContent(data.content);
    } catch {
      setEditorContent('');
    } finally {
      setFileLoading(false);
    }
  }

  async function handleSave() {
    if (!selectedPath || readOnly) return;
    setSaving(true);
    setSaveStatus('idle');
    try {
      const res = await fetch(`${apiBase}/filesystem/file`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ path: selectedPath, content: editorContent }),
      });
      if (!res.ok) throw new Error();
      setSaveStatus('saved');
      if (saveStatusTimer.current) clearTimeout(saveStatusTimer.current);
      saveStatusTimer.current = setTimeout(() => setSaveStatus('idle'), 2500);
    } catch {
      setSaveStatus('error');
    } finally {
      setSaving(false);
    }
  }

  function removePathFromTree(nodes: DirectoryNode[], targetPath: string): DirectoryNode[] {
    return nodes
      .filter((n) => n.entry.path !== targetPath)
      .map((n) =>
        n.children ? { ...n, children: removePathFromTree(n.children, targetPath) } : n
      );
  }

  function sortNodes(nodes: DirectoryNode[]): DirectoryNode[] {
    return [...nodes].sort((a, b) => {
      if (a.entry.type !== b.entry.type) return a.entry.type === 'directory' ? -1 : 1;
      return a.entry.name.localeCompare(b.entry.name);
    });
  }

  function addFileToTree(nodes: DirectoryNode[], parentPath: string, newNode: DirectoryNode): DirectoryNode[] {
    return nodes.map((node) => {
      if (node.entry.path === parentPath && node.children !== null) {
        return { ...node, isOpen: true, children: sortNodes([...(node.children ?? []), newNode]) };
      }
      if (node.children) {
        return { ...node, children: addFileToTree(node.children, parentPath, newNode) };
      }
      return node;
    });
  }

  async function handleCreateFile() {
    const trimmed = newFilePath.trim();
    if (!trimmed) return;
    setCreating(true);
    try {
      const res = await fetch(`${apiBase}/filesystem/file`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: trimmed, content: '' }),
      });
      if (!res.ok) throw new Error();

      setShowNewFileInput(false);
      setNewFilePath('');

      const parts = trimmed.split('/');
      const fileName = parts[parts.length - 1];
      const parentPath = parts.slice(0, -1).join('/');
      const newNode: DirectoryNode = {
        entry: { name: fileName, type: 'file', path: trimmed, size: 0 },
        children: undefined as never,
        isOpen: false,
      };

      if (!parentPath) {
        setTree((prev) => sortNodes([...prev, newNode]));
      } else {
        setTree((prev) => addFileToTree(prev, parentPath, newNode));
      }

      await handleSelectFile(trimmed);
    } catch {
      // TODO: show error toast
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete() {
    if (!selectedPath || readOnly) return;
    if (!window.confirm(`Delete ${selectedPath}? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      const res = await fetch(
        `${apiBase}/filesystem/file?path=${encodeURIComponent(selectedPath)}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) throw new Error();
      setTree((prev) => removePathFromTree(prev, selectedPath));
      setSelectedPath(null);
      setEditorContent('');
    } catch {
      // TODO: show error toast
    } finally {
      setDeleting(false);
    }
  }

  // ── Render helpers ────────────────────────────────────────────────────────

  function renderTree(nodes: DirectoryNode[], depth = 0): React.ReactNode {
    return nodes.map((node) => {
      const { entry } = node;
      const isSelected = selectedPath === entry.path;
      const indent = depth * 14;
      const isSystemDir = entry.type === 'directory' && isEventLogPath(entry.path);

      if (entry.type === 'directory') {
        return (
          <div key={entry.path}>
            <button
              onClick={() => handleToggleDir(node)}
              className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-xs transition-colors hover:bg-zinc-100"
              style={{ paddingLeft: `${8 + indent}px` }}
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 10 10"
                fill="none"
                className={`flex-shrink-0 transition-transform ${node.isOpen ? 'rotate-90' : ''} text-zinc-600`}
              >
                <path d="M3 2L7 5L3 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="flex-shrink-0 text-zinc-400">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
              <span
                className="truncate text-zinc-600"
                style={{ fontFamily: 'var(--font-geist-mono)' }}
              >
                {entry.name}
              </span>
              {isSystemDir && (
                <span
                  className="ml-1 flex-shrink-0 rounded border border-zinc-200 bg-zinc-100 px-1 py-px text-[9px] font-medium uppercase tracking-wide text-zinc-400"
                  style={{ fontFamily: 'var(--font-geist-mono)' }}
                >
                  system
                </span>
              )}
            </button>
            {node.isOpen && node.children && (
              <div>{renderTree(node.children, depth + 1)}</div>
            )}
          </div>
        );
      }

      const isSystemFile = isEventLogPath(entry.path);

      return (
        <button
          key={entry.path}
          onClick={() => handleSelectFile(entry.path)}
          className={`flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-xs transition-colors ${
            isSelected
              ? 'bg-zinc-900 text-white'
              : 'text-zinc-600 hover:bg-zinc-100'
          }`}
          style={{ paddingLeft: `${8 + indent}px` }}
        >
          {isSystemFile ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={`flex-shrink-0 ${isSelected ? 'text-zinc-400' : 'text-zinc-300'}`}>
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={`flex-shrink-0 ${isSelected ? 'text-zinc-300' : 'text-zinc-400'}`}>
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
          )}
          <span className="truncate" style={{ fontFamily: 'var(--font-geist-mono)' }}>
            {entry.name}
          </span>
        </button>
      );
    });
  }

  // ── Layout ────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col">
      <div className="mb-6">
        <h2 className="text-2xl font-semibold tracking-tight text-zinc-900">Agent Files</h2>
        <p className="mt-1.5 text-sm text-zinc-500">
          Browse and edit files stored in your agent&apos;s workspace.
        </p>
      </div>

      {/* Warning banner */}
      {agentRunStatus === 'running' && (
        <div className="mb-4 flex items-center gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0 text-amber-600">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span className="text-sm text-amber-800">
            Agent is currently running — file edits will take effect after the run completes.
          </span>
        </div>
      )}

      {/* Main content: tree + editor */}
      <div className="flex min-h-0 flex-1 overflow-hidden rounded-lg border border-zinc-200">

        {/* File tree */}
        <div className="flex w-56 flex-shrink-0 flex-col border-r border-zinc-200">
          <div className="flex items-center justify-between border-b border-zinc-100 px-3 py-2.5">
            <span
              className="text-[10px] font-medium uppercase tracking-widest text-zinc-400"
              style={{ fontFamily: 'var(--font-geist-mono)' }}
            >
              Workspace
            </span>
            {!showNewFileInput && (
              <button
                onClick={() => setShowNewFileInput(true)}
                title="New file"
                className="rounded p-0.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
            )}
          </div>

          {showNewFileInput && (
            <div className="flex items-center gap-1 border-b border-zinc-100 px-2 py-1.5">
              <input
                autoFocus
                value={newFilePath}
                onChange={(e) => setNewFilePath(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateFile();
                  if (e.key === 'Escape') { setShowNewFileInput(false); setNewFilePath(''); }
                }}
                placeholder="path/to/file.md"
                className="min-w-0 flex-1 rounded border border-zinc-300 px-1.5 py-0.5 text-[11px] outline-none focus:border-zinc-500"
                style={{ fontFamily: 'var(--font-geist-mono)' }}
              />
              <button
                onClick={handleCreateFile}
                disabled={creating || !newFilePath.trim()}
                className="rounded px-1.5 py-0.5 text-[11px] font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-40"
              >
                {creating ? '…' : 'Add'}
              </button>
              <button
                onClick={() => { setShowNewFileInput(false); setNewFilePath(''); }}
                className="text-zinc-400 hover:text-zinc-600"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-1.5">
            {treeLoading && (
              <div className="flex items-center gap-2 px-2 py-3">
                <div className="h-3 w-3 animate-spin rounded-full border border-zinc-300 border-t-zinc-600" />
                <span className="text-[11px] text-zinc-400" style={{ fontFamily: 'var(--font-geist-mono)' }}>
                  Loading...
                </span>
              </div>
            )}
            {treeError && (
              <p className="px-2 py-3 text-xs text-red-500">{treeError}</p>
            )}
            {!treeLoading && !treeError && tree.length === 0 && (
              <p className="px-2 py-3 text-xs text-zinc-400">No files yet.</p>
            )}
            {!treeLoading && !treeError && renderTree(tree)}
          </div>
        </div>

        {/* Editor pane */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {!selectedPath ? (
            <div className="flex flex-1 items-center justify-center">
              <p className="text-sm text-zinc-400">Select a file to view its contents.</p>
            </div>
          ) : (
            <>
              {/* Editor header */}
              <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-2.5">
                <span
                  className="text-xs text-zinc-500"
                  style={{ fontFamily: 'var(--font-geist-mono)' }}
                >
                  {selectedPath}
                </span>
                <div className="flex items-center gap-2">
                  {readOnly ? (
                    <div className="flex items-center gap-1.5 rounded border border-zinc-200 bg-zinc-50 px-2.5 py-1">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-400">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                      </svg>
                      <span className="text-[11px] text-zinc-500" style={{ fontFamily: 'var(--font-geist-mono)' }}>
                        System log · Read-only
                      </span>
                      <span className="mx-1 text-zinc-300">·</span>
                      <a
                        href="/settings?tab=integrations"
                        className="text-[11px] text-zinc-400 underline underline-offset-2 hover:text-zinc-700"
                        style={{ fontFamily: 'var(--font-geist-mono)' }}
                      >
                        Manage monitoring
                      </a>
                    </div>
                  ) : (
                    <>
                      {saveStatus === 'saved' && (
                        <span
                          className="text-[11px] text-green-600"
                          style={{ fontFamily: 'var(--font-geist-mono)' }}
                        >
                          Saved
                        </span>
                      )}
                      {saveStatus === 'error' && (
                        <span
                          className="text-[11px] text-red-500"
                          style={{ fontFamily: 'var(--font-geist-mono)' }}
                        >
                          Save failed
                        </span>
                      )}
                      <button
                        onClick={handleDelete}
                        disabled={deleting || fileLoading}
                        className="rounded border border-red-200 px-2.5 py-1 text-xs font-medium text-red-500 transition-colors hover:border-red-300 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {deleting ? 'Deleting…' : 'Delete'}
                      </button>
                      <button
                        onClick={handleSave}
                        disabled={saving || fileLoading}
                        className="rounded border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {saving ? 'Saving…' : 'Save'}
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Editor body */}
              {fileLoading ? (
                <div className="flex flex-1 items-center justify-center gap-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-600" />
                  <span className="text-xs text-zinc-400">Loading file…</span>
                </div>
              ) : readOnly && isJsonl ? (
                <EventLogViewer content={editorContent} />
              ) : (
                <textarea
                  value={editorContent}
                  onChange={readOnly ? undefined : (e) => {
                    setEditorContent(e.target.value);
                    setSaveStatus('idle');
                  }}
                  readOnly={readOnly}
                  spellCheck={false}
                  className={`flex-1 resize-none border-none p-4 text-xs text-zinc-800 outline-none ${readOnly ? 'bg-zinc-50 text-zinc-500' : ''}`}
                  style={{ fontFamily: 'var(--font-geist-mono)', lineHeight: '1.6' }}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
