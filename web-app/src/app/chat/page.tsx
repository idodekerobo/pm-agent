'use client';

import { useRef, useEffect, useState, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/AuthContext";
import { useBilling } from "@/lib/BillingContext";
import { useBridge } from "@/lib/BridgeContext";
import { usePostHog } from "posthog-js/react";
import { EVENTS } from "@/lib/analytics";
import { logError } from "@/lib/errorLogger";
import { useProfileComplete } from "@/lib/useProfileComplete";
import FeedbackModal from "@/components/FeedbackModal";
import { createClient } from "@/lib/supabaseClient";
import ChatSidebar from "@/components/chat/ChatSidebar";
import ChatHeader from "@/components/chat/ChatHeader";
import ChatMessageFeed from "@/components/chat/ChatMessageFeed";
import ChatInputBar from "@/components/chat/ChatInputBar";
import type { Message, AttachedFile, RenderItem, Session } from "@/app/chat/types";


const ACCEPTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

// Known binary/proprietary formats we can't process — show a targeted error
const KNOWN_UNSUPPORTED_EXTENSIONS = new Set([
  "pdf", "doc", "docx", "ppt", "pptx", "xls", "xlsx",
  "zip", "tar", "gz", "rar", "7z",
  "exe", "dmg", "pkg", "deb", "rpm",
  "mp3", "mp4", "wav", "avi", "mov", "mkv",
  "ttf", "otf", "woff", "woff2",
]);


function ChatPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { session, signOut } = useAuth();
  const { creditsRemaining, planName, refetch: refetchBilling } = useBilling();
  const { isLocal, bridgeUrl } = useBridge();
  const profileComplete = useProfileComplete();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showUpgradeBanner, setShowUpgradeBanner] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionsLoaded, setSessionsLoaded] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sessionMetadata, setSessionMetadata] = useState<{ timezone: string; location?: string } | null>(null);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [hoveredSessionId, setHoveredSessionId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [workingDir, setWorkingDir] = useState<string | null>(null);
  const [providerSessionId, setProviderSessionId] = useState<string | null>(null);
  const dragCounterRef = useRef(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const hasInitialized = useRef(false);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const ph = usePostHog();
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
  const getToken = () => session?.access_token ?? "";

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    const el = chatContainerRef.current;
    if (!el) return;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    if (isNearBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  useEffect(() => {
    if (!session || hasInitialized.current) return;
    hasInitialized.current = true;
    fetchSessions();
    const sessionFromUrl = searchParams.get("s");
    if (sessionFromUrl) loadSession(sessionFromUrl);
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    fetch("https://ipapi.co/json/")
      .then((r) => r.json())
      .then((data) => {
        const loc = [data.city, data.region_code, data.country_code].filter(Boolean).join(", ");
        setSessionMetadata({ timezone: tz, location: loc || undefined });
      })
      .catch(() => setSessionMetadata({ timezone: tz }));
  }, [session]);

  // Subscribe to live code task progress updates for the active session
  useEffect(() => {
    if (!activeSessionId) return;

    const supabase = createClient();
    const channel = supabase
      .channel(`code-task-updates-${activeSessionId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "conversation_items",
          filter: `agent_session_id=eq.${activeSessionId}`,
        },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          const item = row.item as Record<string, unknown> | undefined;
          console.log("[realtime] INSERT received — type:", item?.type, "status:", item?.code_task_status, "id:", row.id);
          // Handle code task progress updates
          if (item?.type === "code_task_update") {
            const content = item.content as Array<{ text?: string }> | undefined;
            const text = content?.[0]?.text;
            if (!text) return;
            setMessages((prev) => [
              ...prev,
              {
                id: `${row.id ?? Date.now()}`,
                role: "assistant" as const,
                content: text,
              },
            ]);
            return;
          }

          // Handle assistant messages written by background workers (e.g. Slack-initiated runs).
          // We explicitly exclude source_platform "web" because those messages are already
          // delivered and rendered via the active SSE stream in handleSendMessage — letting
          // Realtime also handle them causes a duplicate-key collision when both paths race
          // to insert the same DB row ID into React state.
          if (item?.type === "message" && item?.role === "assistant" && row.source_platform !== "web") {
            const content = item.content as Array<{ text?: string }> | undefined;
            const text = content?.[0]?.text;
            if (!text) return;
            setMessages((prev) => {
              // Avoid duplicates — SSE path re-keys its message to the DB row ID
              // via the item_created event, so this check catches both paths.
              const id = `${row.id ?? Date.now()}`;
              if (prev.some((m) => m.id === id)) return prev;
              return [...prev, { id, role: "assistant" as const, content: text }];
            });
            // Message is visible to the user — mark read locally and on the server
            // so navigating away doesn't leave a stale unread dot.
            const now = new Date().toISOString();
            setSessions((prev) =>
              prev.map((s) =>
                s.id === activeSessionId
                  ? { ...s, last_message_at: now, last_read_at: now }
                  : s
              )
            );
            fetch(`${apiBaseUrl}/sessions/${activeSessionId}/read`, {
              method: "POST",
              headers: { Authorization: `Bearer ${getToken()}` },
            }).catch(() => {});
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeSessionId]);

  useEffect(() => {
    if (!session?.user?.id) return;

    const supabase = createClient();
    const channel = supabase
      .channel("session-name-updates")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "agent_sessions",
          filter: `user_id=eq.${session.user.id}`,
        },
        (payload) => {
          const updated = payload.new as { id: string; display_name?: string };
          if (!updated.display_name) return;
          setSessions((prev) =>
            prev.map((s) =>
              s.id === updated.id ? { ...s, display_name: updated.display_name } : s
            )
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session?.user?.id]);

  useEffect(() => {
    if (!activeSessionId || providerSessionId) return;
    const session = sessions.find((s) => s.id === activeSessionId);
    if (session?.provider_session_id) {
      setProviderSessionId(session.provider_session_id);
    }
  }, [sessions, activeSessionId]);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!openMenuId) return;
    const close = () => setOpenMenuId(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [openMenuId]);

  // Focus rename input when rename mode activates
  useEffect(() => {
    if (renamingSessionId) {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }
  }, [renamingSessionId]);

  // Auto-resize textarea as content changes
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [input]);

  const fetchSessions = async () => {
    try {
      const res = await fetch(`${apiBaseUrl}/sessions`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) {
        const data = await res.json();
        setSessions(data);
      }
    } catch (e) {
      console.error("Failed to fetch sessions:", e);
      logError(getToken, "Failed to fetch sessions", { action: "fetchSessions" });
    } finally {
      setSessionsLoaded(true);
    }
  };

  const startNewSession = () => {
    setActiveSessionId(null);
    setMessages([]);
    setProviderSessionId(null);
    router.push("/chat");
  };

  const loadSession = async (sessionId: string) => {
    setProviderSessionId(null);
    ph?.capture(EVENTS.SESSION_OPENED, { session_id: sessionId });
    try {
      const res = await fetch(`${apiBaseUrl}/sessions/${sessionId}/messages`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) {
        const items = await res.json();
        const mapped: Message[] = [];
        for (const item of items) {
          try {
            if (item?.type === "function_call") {
              mapped.push({
                id: `${sessionId}-${mapped.length}`,
                role: "tool_call",
                content: item.arguments ?? "",
                toolName: item.name,
                callId: item.call_id ?? "",
                toolArguments: item.arguments ?? "",
              });
            } else if (item?.type === "function_call_output") {
              const out = typeof item.output === "string" ? item.output : JSON.stringify(item.output);
              mapped.push({
                id: `${sessionId}-${mapped.length}`,
                role: "tool_output",
                content: out,
                callId: item.call_id ?? "",
              });
            } else {
              const role = item?.role as "user" | "assistant";
              if (!role || !["user", "assistant"].includes(role)) continue;
              const contentArr = item?.content as Array<{ type: string; text?: string; image_url?: string }> | undefined;
              const text = contentArr?.find((c) => c.type === "input_text" || c.type === "output_text")?.text ?? "";
              const imgUrls = contentArr?.filter((c) => c.type === "input_image" && c.image_url).map((c) => c.image_url!) ?? [];
              if (!text && imgUrls.length === 0) continue;
              mapped.push({
                id: `${sessionId}-${mapped.length}`,
                role,
                content: text,
                ...(imgUrls.length > 0 ? { imageUrls: imgUrls } : {}),
              });
            }
          } catch (error) {
            console.log("error when forming session messages", error);
          }
        }
        setActiveSessionId(sessionId);
        setMessages(mapped);
        router.push(`/chat?s=${sessionId}`);
        // Mark as read and update local session state so the unread dot clears
        fetch(`${apiBaseUrl}/sessions/${sessionId}/read`, {
          method: "POST",
          headers: { Authorization: `Bearer ${getToken()}` },
        }).catch(() => {});
        const now = new Date().toISOString();
        setSessions((prev) =>
          prev.map((s) => (s.id === sessionId ? { ...s, last_read_at: now } : s))
        );
      }
    } catch (e) {
      console.error("Failed to load session:", e);
      logError(getToken, "Failed to load session", { action: "loadSession", sessionId });
    }
  };

  const handleRenameSubmit = async (sessionId: string) => {
    const trimmed = renameValue.trim();
    setRenamingSessionId(null);
    if (!trimmed) return;
    try {
      const res = await fetch(`${apiBaseUrl}/sessions/${sessionId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ display_name: trimmed }),
      });
      if (res.ok) {
        ph?.capture(EVENTS.SESSION_RENAMED, { session_id: sessionId });
        setSessions((prev) =>
          prev.map((s) => (s.id === sessionId ? { ...s, display_name: trimmed } : s))
        );
      }
    } catch (e) {
      console.error("Failed to rename session:", e);
    }
  };

  const handleTogglePin = async (sessionId: string, currentlyPinned: boolean) => {
    const newPinned = !currentlyPinned;
    ph?.capture(newPinned ? EVENTS.SESSION_PINNED : EVENTS.SESSION_UNPINNED, { session_id: sessionId });
    setSessions((prev) =>
      prev
        .map((s) => (s.id === sessionId ? { ...s, is_pinned: newPinned } : s))
        .sort((a, b) => {
          if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        })
    );
    try {
      await fetch(`${apiBaseUrl}/sessions/${sessionId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ is_pinned: newPinned }),
      });
    } catch (e) {
      console.error("Failed to toggle pin:", e);
    }
  };

  const handleDelete = async (sessionId: string) => {
    if (!window.confirm("Delete this session? This cannot be undone.")) return;
    try {
      const res = await fetch(`${apiBaseUrl}/sessions/${sessionId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) {
        ph?.capture(EVENTS.SESSION_DELETED, { session_id: sessionId });
        setSessions((prev) => prev.filter((s) => s.id !== sessionId));
        if (activeSessionId === sessionId) {
          setActiveSessionId(null);
          setMessages([]);
        }
      }
    } catch (e) {
      console.error("Failed to delete session:", e);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      router.push("/auth/sign-in");
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  const handleUpgrade = async () => {
    ph?.capture(EVENTS.UPGRADE_CLICKED, { trigger: 'banner' });
    try {
      const res = await fetch(`${apiBaseUrl}/billing/checkout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error();
      const { checkout_url } = await res.json();
      window.location.href = checkout_url;
    } catch {
      console.error("Failed to create checkout session");
    }
  };

  const handlePortal = async () => {
    try {
      const res = await fetch(`${apiBaseUrl}/billing/portal`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error();
      const { portal_url } = await res.json();
      window.location.href = portal_url;
    } catch {
      console.error("Failed to create portal session");
    }
  };

  const processFiles = (files: File[]) => {
    setAttachmentError(null);
    for (const file of files) {
      if (ACCEPTED_IMAGE_TYPES.has(file.type)) {
        if (file.size > MAX_FILE_SIZE_BYTES) {
          setAttachmentError("File must be under 10MB.");
          continue;
        }
        const previewUrl = URL.createObjectURL(file);
        setAttachedFiles((prev) => [
          ...prev,
          { id: crypto.randomUUID(), file, kind: "image", previewUrl, textContent: null, error: null },
        ]);
        continue;
      }

      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      if (KNOWN_UNSUPPORTED_EXTENSIONS.has(ext)) {
        setAttachmentError("PDF, Word, PowerPoint, and spreadsheet files aren't supported yet. Try plain text or code files.");
        continue;
      }

      // Attempt to read as text — catches all code files, .txt, .csv, etc.
      const fileId = crypto.randomUUID();
      setAttachedFiles((prev) => [
        ...prev,
        { id: fileId, file, kind: "text", previewUrl: null, textContent: null, error: null },
      ]);
      file.text().then((content) => {
        setAttachedFiles((prev) =>
          prev.map((f) => (f.id === fileId ? { ...f, textContent: content } : f))
        );
      }).catch(() => {
        setAttachedFiles((prev) => prev.filter((f) => f.id !== fileId));
        setAttachmentError(`"${file.name}" couldn't be read as text.`);
      });
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    processFiles(Array.from(e.target.files ?? []));
    e.target.value = ""; // reset so the same file can be re-selected
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current += 1;
    if (dragCounterRef.current === 1) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current === 0) setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault(); // required to allow drop
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setIsDragging(false);
    processFiles(Array.from(e.dataTransfer.files));
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && attachedFiles.length === 0) || isLoading) return;

    const pendingFiles = [...attachedFiles];
    const promptText = input;
    const newSessionId = !activeSessionId ? crypto.randomUUID() : null;

    setInput("");
    attachedFiles.forEach((f) => { if (f.kind === "image" && f.previewUrl) URL.revokeObjectURL(f.previewUrl); });
    setAttachedFiles([]);
    setAttachmentError(null);
    scrollToBottom();
    let toolCallsCount = 0;

    try {
      // ── LOCAL PATH (bridge connected) ─────────────────────────────────────
      if (isLocal) {
        // Build prompt — inline text file content, images not supported in Phase 1
        const textParts: string[] = [promptText];
        for (const f of pendingFiles.filter((f) => f.kind === 'text' && f.textContent)) {
          textParts.push(`\n\n--- ${f.file.name} ---\n${f.textContent}`);
        }
        const fullPrompt = textParts.join('');

        const userMessage: Message = {
          id: Date.now().toString(),
          role: 'user',
          content: promptText,
          ...(pendingFiles.filter((f) => f.kind === 'text').length > 0
            ? { textFileNames: pendingFiles.filter((f) => f.kind === 'text').map((f) => f.file.name) }
            : {}),
        };
        setMessages((prev) => [...prev, userMessage]);

        ph?.capture(EVENTS.AGENT_RUN_STARTED, {
          session_id: activeSessionId,
          is_new_session: !activeSessionId,
          message_length: promptText.length,
          mode: 'local',
        });

        // Pre-create session if this is the first message
        let sessionId = activeSessionId;
        if (!sessionId) {
          const newId = crypto.randomUUID();
          const sessionRes = await fetch(`${apiBaseUrl}/sessions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${getToken()}`,
            },
            body: JSON.stringify({
            session_id: newId,
            execution_environment: 'local_bridge',
            provider: 'claude_code',
          }),
          });
          if (!sessionRes.ok) throw new Error('Failed to create session');
          const { agent_session_id } = await sessionRes.json();
          sessionId = agent_session_id;
          ph?.capture(EVENTS.SESSION_CREATED, { session_id: sessionId });
          setActiveSessionId(agent_session_id);
          fetchSessions();
          router.push(`/chat?s=${agent_session_id}`);
        }

        const response = await fetch(`${bridgeUrl}/run-local`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${getToken()}`,
          },
          body: JSON.stringify({
            session_id: sessionId,
            prompt: fullPrompt,
            jwt: getToken(),
            ...(providerSessionId ? { provider_session_id: providerSessionId } : {}),
            ...(workingDir ? { workspace_path: workingDir } : {}),
          }),
        });

        if (!response.ok) throw new Error('Bridge run failed');

        const reader = response.body?.getReader();
        if (!reader) throw new Error('No response body');

        const decoder = new TextDecoder();
        let buffer = '';
        let currentAssistantId: string | null = null;
        let currentAssistantContent = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine || !trimmedLine.startsWith('data: ')) continue;
            try {
              const eventData = JSON.parse(trimmedLine.slice(6));
              if (eventData.type === 'session_provider_id') {
                setProviderSessionId(eventData.provider_session_id);
                continue;
              }
              if (eventData.type === 'tool_call') {
                toolCallsCount++;
                setMessages((prev) => [
                  ...prev,
                  {
                    id: `tool-${Date.now()}-${Math.random()}`,
                    role: 'tool_call' as const,
                    content: eventData.content ?? '',
                    toolName: eventData.name ?? '',
                    callId: eventData.call_id ?? '',
                    toolArguments: eventData.arguments ?? '',
                  },
                ]);
                currentAssistantId = null;
                currentAssistantContent = '';
              } else if (eventData.type === 'tool_output') {
                setMessages((prev) => [
                  ...prev,
                  {
                    id: `output-${Date.now()}-${Math.random()}`,
                    role: 'tool_output' as const,
                    content: eventData.content ?? '',
                    callId: eventData.call_id ?? '',
                  },
                ]);
              } else if (eventData.type === 'message') {
                const chunk = eventData.content ?? '';
                if (!currentAssistantId) {
                  currentAssistantId = `asst-${Date.now()}-${Math.random()}`;
                  currentAssistantContent = chunk;
                  const newId = currentAssistantId;
                  setMessages((prev) => [
                    ...prev,
                    { id: newId, role: 'assistant' as const, content: chunk },
                  ]);
                } else {
                  currentAssistantContent += chunk;
                  const targetId = currentAssistantId;
                  const snapshot = currentAssistantContent;
                  setMessages((prev) =>
                    prev.map((m) => (m.id === targetId ? { ...m, content: snapshot } : m))
                  );
                }
              } else if (eventData.type === 'item_created' && eventData.role === 'assistant') {
                const dbId = eventData.id as string;
                const targetId = currentAssistantId;
                if (targetId && dbId) {
                  setMessages((prev) =>
                    prev.map((m) => (m.id === targetId ? { ...m, id: dbId } : m))
                  );
                  currentAssistantId = dbId;
                }
              } else if (eventData.type === 'error') {
                setMessages((prev) => [
                  ...prev,
                  {
                    id: `err-${Date.now()}`,
                    role: 'assistant' as const,
                    content: `❌ ${eventData.content}`,
                  },
                ]);
              }
            } catch (e) {
              console.error('Error parsing SSE event:', e, trimmedLine);
            }
          }
        }

        ph?.capture(EVENTS.AGENT_RUN_COMPLETED, {
          session_id: sessionId,
          tool_calls_count: toolCallsCount,
          mode: 'local',
        });
        return; // done — skip cloud path below
      }
      // ── END LOCAL PATH ────────────────────────────────────────────────────

      // Upload all attachments to Supabase Storage under a shared session path
      const imageFiles = pendingFiles.filter((f) => f.kind === "image");
      const textFiles = pendingFiles.filter((f) => f.kind === "text" && f.textContent !== null);

      const imageUrls: string[] = [];
      const textFilePayloads: { filename: string; content: string }[] = [];

      if (imageFiles.length > 0 || textFiles.length > 0) {
        const supabase = createClient();
        const userId = session?.user?.id;
        if (!userId) throw new Error("Not authenticated");
        const sessionPath = activeSessionId ?? newSessionId!;

        await Promise.all([
          ...imageFiles.map(async (f) => {
            const fileExt = f.file.name.split(".").pop()?.toLowerCase() ?? "jpg";
            const originalName = f.file.name.includes(".") ? f.file.name.slice(0, f.file.name.lastIndexOf(".")) : f.file.name;
            const path = `${userId}/${sessionPath}/${crypto.randomUUID()}-${originalName}.${fileExt}`;
            const { error: uploadError } = await supabase.storage
              .from("conversation-attachments")
              .upload(path, f.file, { contentType: f.file.type, upsert: false });
            if (uploadError) throw uploadError;
            const { data: { publicUrl } } = supabase.storage
              .from("conversation-attachments")
              .getPublicUrl(path);
            imageUrls.push(publicUrl);
          }),
          ...textFiles.map(async (f) => {
            const fileExt = f.file.name.split(".").pop()?.toLowerCase() ?? "txt";
            const originalName = f.file.name.includes(".") ? f.file.name.slice(0, f.file.name.lastIndexOf(".")) : f.file.name;
            const path = `${userId}/${sessionPath}/${crypto.randomUUID()}-${originalName}.${fileExt}`;
            const { error: uploadError } = await supabase.storage
              .from("conversation-attachments")
              .upload(path, f.file, { contentType: f.file.type || "text/plain", upsert: false });
            if (uploadError) throw uploadError;
            textFilePayloads.push({ filename: f.file.name, content: f.textContent! });
          }),
        ]);
      }

      const userMessage: Message = {
        id: Date.now().toString(),
        role: "user",
        content: promptText,
        ...(imageUrls.length > 0 ? { imageUrls } : {}),
        ...(textFilePayloads.length > 0 ? { textFileNames: textFilePayloads.map((f) => f.filename) } : {}),
      };

      ph?.capture(EVENTS.AGENT_RUN_STARTED, {
        session_id: activeSessionId,
        is_new_session: !activeSessionId,
        message_length: promptText.length,
      });

      setMessages((prev) => [...prev, userMessage]);

      const body: Record<string, unknown> = { prompt: promptText };
      if (activeSessionId) body.agent_session_id = activeSessionId;
      if (newSessionId) body.new_session_id = newSessionId;
      if (sessionMetadata) body.session_metadata = sessionMetadata;
      if (imageUrls.length > 0) body.image_urls = imageUrls;
      if (textFilePayloads.length > 0) body.text_files = textFilePayloads;

      const response = await fetch(`${apiBaseUrl}/run`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify(body),
      });

      if (response.status === 402) {
        ph?.capture(EVENTS.UPGRADE_PROMPTED, { trigger: 'agent_run' });
        setShowUpgradeBanner(true);
        return;
      }
      if (!response.ok) throw new Error("Failed to get response from server");

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";
      let currentAssistantId: string | null = null;
      let currentAssistantContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine || !trimmedLine.startsWith("data: ")) continue;

          try {
            const eventData = JSON.parse(trimmedLine.slice(6));

            if (eventData.type === "session_created") {
              ph?.capture(EVENTS.SESSION_CREATED, { session_id: eventData.agent_session_id });
              setActiveSessionId(eventData.agent_session_id);
              fetchSessions();
            } else if (eventData.type === "tool_call") {
              toolCallsCount++;
              setMessages((prev) => [
                ...prev,
                {
                  id: `tool-${Date.now()}-${Math.random()}`,
                  role: "tool_call" as const,
                  content: eventData.content ?? "",
                  toolName: eventData.name ?? "",
                  callId: eventData.call_id ?? "",
                  toolArguments: eventData.arguments ?? "",
                },
              ]);
              currentAssistantId = null;
              currentAssistantContent = "";
            } else if (eventData.type === "tool_output") {
              setMessages((prev) => [
                ...prev,
                {
                  id: `output-${Date.now()}-${Math.random()}`,
                  role: "tool_output" as const,
                  content: eventData.content ?? "",
                  callId: eventData.call_id ?? "",
                },
              ]);
            } else if (eventData.type === "message") {
              const chunk = eventData.content ?? "";
              if (!currentAssistantId) {
                currentAssistantId = `asst-${Date.now()}-${Math.random()}`;
                currentAssistantContent = chunk;
                const newId = currentAssistantId;
                setMessages((prev) => [
                  ...prev,
                  { id: newId, role: "assistant" as const, content: chunk },
                ]);
              } else {
                currentAssistantContent += chunk;
                const targetId = currentAssistantId;
                const snapshot = currentAssistantContent;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === targetId ? { ...m, content: snapshot } : m
                  )
                );
              }
            } else if (eventData.type === "item_created" && eventData.role === "assistant") {
              // Re-key the in-flight message to its DB row ID so the Realtime
              // dedup check can find it and skip the duplicate.
              const dbId = eventData.id as string;
              const targetId = currentAssistantId;
              if (targetId && dbId) {
                setMessages((prev) =>
                  prev.map((m) => (m.id === targetId ? { ...m, id: dbId } : m))
                );
                currentAssistantId = dbId;
              }
            } else if (eventData.type === "error") {
              setMessages((prev) => [
                ...prev,
                {
                  id: `err-${Date.now()}`,
                  role: "assistant" as const,
                  content: `❌ ${eventData.content}`,
                },
              ]);
            }
          } catch (e) {
            console.error("Error parsing SSE event:", e, trimmedLine);
          }
        }
      }
      ph?.capture(EVENTS.AGENT_RUN_COMPLETED, {
        session_id: activeSessionId,
        tool_calls_count: toolCallsCount,
      });
      refetchBilling();
    } catch (error) {
      console.error("Error sending message:", error);
      ph?.capture(EVENTS.AGENT_RUN_FAILED, {
        session_id: activeSessionId,
        error_type: error instanceof Error ? error.message : 'unknown',
      });
      logError(getToken, error instanceof Error ? error.message : "Error sending message", {
        action: "sendMessage",
        session_id: activeSessionId,
      });
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 2).toString(),
          role: "assistant",
          content: "Sorry, I encountered an error processing your request.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const formatSessionTime = (createdAt: string) => {
    const date = new Date(createdAt);
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  };

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeSessionId) ?? null,
    [sessions, activeSessionId]
  );

  const renderItems = useMemo((): RenderItem[] => {
    const items: RenderItem[] = [];
    const callIdToIndex = new Map<string, number>();

    for (const msg of messages) {
      if (msg.role === "tool_call" && msg.callId) {
        const idx = items.length;
        callIdToIndex.set(msg.callId, idx);
        items.push({ type: "tool_pair", id: msg.id, call: msg, output: null });
      } else if (msg.role === "tool_output" && msg.callId && callIdToIndex.has(msg.callId)) {
        const idx = callIdToIndex.get(msg.callId)!;
        const existing = items[idx] as { type: "tool_pair"; id: string; call: Message; output: Message | null };
        items[idx] = { ...existing, output: msg };
      } else if (msg.role !== "tool_call" && msg.role !== "tool_output") {
        items.push({ type: "message", message: msg });
      } else {
        // Orphaned tool message (no callId or no matching pair) — render as plain text fallback
        items.push({ type: "message", message: msg });
      }
    }

    return items;
  }, [messages]);

  return (
    <div className="flex h-screen overflow-hidden bg-white">
      <ChatSidebar
        sessions={sessions}
        activeSessionId={activeSessionId}
        sidebarOpen={sidebarOpen}
        hoveredSessionId={hoveredSessionId}
        openMenuId={openMenuId}
        renamingSessionId={renamingSessionId}
        renameValue={renameValue}
        renameInputRef={renameInputRef}
        setSidebarOpen={setSidebarOpen}
        setHoveredSessionId={setHoveredSessionId}
        setOpenMenuId={setOpenMenuId}
        setRenamingSessionId={setRenamingSessionId}
        setRenameValue={setRenameValue}
        startNewSession={startNewSession}
        loadSession={loadSession}
        handleRenameSubmit={handleRenameSubmit}
        handleTogglePin={handleTogglePin}
        handleDelete={handleDelete}
        formatSessionTime={formatSessionTime}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <ChatHeader
          creditsRemaining={creditsRemaining}
          onFeedbackClick={() => setShowFeedbackModal(true)}
          onSignOut={handleSignOut}
        />

        <ChatMessageFeed
          renderItems={renderItems}
          isLoading={isLoading}
          sessionsLoaded={sessionsLoaded}
          activeSession={activeSession}
          messagesEndRef={messagesEndRef}
          chatContainerRef={chatContainerRef}
          onPromptSelect={(p) => setInput(p)}
        />

        {/* Incomplete profile banner */}
        {profileComplete === false && (
          <div className="shrink-0 border-t border-blue-200 bg-blue-50 px-6 py-3">
            <div className="mx-auto flex max-w-2xl items-center justify-between gap-4">
              <p className="text-sm text-blue-800">
                Your profile isn&apos;t set up yet — your agent won&apos;t have context about you or your product.
              </p>
              <Link
                href="/onboarding"
                className="shrink-0 rounded-lg bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
              >
                Complete setup →
              </Link>
            </div>
          </div>
        )}

        {/* Upgrade Banner */}
        {showUpgradeBanner && !isLocal && (
          <div className="shrink-0 border-t border-amber-200 bg-amber-50 px-6 py-4">
            <div className="mx-auto flex max-w-2xl items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-amber-900">You&apos;ve used all your credits for this period.</p>
                <p className="mt-0.5 text-xs text-amber-700">Upgrade to Pro for 50 credits per month.</p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                {planName !== 'pro' ? (
                  <button
                    onClick={handleUpgrade}
                    className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
                  >
                    Upgrade to Pro
                  </button>
                ) : (
                  <button
                    onClick={handlePortal}
                    className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
                  >
                    Manage Billing
                  </button>
                )}
                <button
                  onClick={() => setShowUpgradeBanner(false)}
                  className="text-xs text-amber-600 hover:text-amber-900"
                  aria-label="Dismiss"
                >
                  ✕
                </button>
              </div>
            </div>
          </div>
        )}

        <ChatInputBar
          input={input}
          setInput={setInput}
          isLoading={isLoading}
          attachedFiles={attachedFiles}
          setAttachedFiles={setAttachedFiles}
          attachmentError={attachmentError}
          isDragging={isDragging}
          textareaRef={textareaRef}
          fileInputRef={fileInputRef}
          onSubmit={handleSendMessage}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onFileSelect={handleFileSelect}
          processFiles={processFiles}
          workingDir={workingDir}
          onWorkingDirChange={setWorkingDir}
          hasMessages={messages.length > 0}
        />
      </div>

      {showFeedbackModal && (
        <FeedbackModal onClose={() => setShowFeedbackModal(false)} />
      )}
    </div>
  );
}

export default function ChatPageWrapper() {
  return (
    <Suspense>
      <ChatPage />
    </Suspense>
  );
}
