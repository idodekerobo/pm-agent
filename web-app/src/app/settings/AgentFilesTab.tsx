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

function buildTree(entries: FileEntry[]): DirectoryNode[] {
  return entries.map((entry) => ({
    entry,
    children: entry.type === 'directory' ? null : undefined as never,
    isOpen: false,
  }));
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
    if (!selectedPath) return;
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
    if (!selectedPath) return;
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

      if (entry.type === 'directory') {
        return (
          <div key={entry.path}>
            <button
              onClick={() => handleToggleDir(node)}
              className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-xs text-zinc-600 transition-colors hover:bg-zinc-100"
              style={{ paddingLeft: `${8 + indent}px` }}
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 10 10"
                fill="none"
                className={`flex-shrink-0 transition-transform ${node.isOpen ? 'rotate-90' : ''}`}
              >
                <path d="M3 2L7 5L3 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="flex-shrink-0 text-zinc-400">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
              <span className="truncate" style={{ fontFamily: 'var(--font-geist-mono)' }}>
                {entry.name}
              </span>
            </button>
            {node.isOpen && node.children && (
              <div>{renderTree(node.children, depth + 1)}</div>
            )}
          </div>
        );
      }

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
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={`flex-shrink-0 ${isSelected ? 'text-zinc-300' : 'text-zinc-400'}`}>
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
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
                </div>
              </div>

              {/* Editor body */}
              {fileLoading ? (
                <div className="flex flex-1 items-center justify-center gap-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-600" />
                  <span className="text-xs text-zinc-400">Loading file…</span>
                </div>
              ) : (
                <textarea
                  value={editorContent}
                  onChange={(e) => {
                    setEditorContent(e.target.value);
                    setSaveStatus('idle');
                  }}
                  spellCheck={false}
                  className="flex-1 resize-none border-none p-4 text-xs text-zinc-800 outline-none"
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
