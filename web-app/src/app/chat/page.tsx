'use client';

import { useRef, useEffect, useState, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/AuthContext";
import { useBilling } from "@/lib/BillingContext";
import { logError } from "@/lib/errorLogger";
import { useProfileComplete } from "@/lib/useProfileComplete";
import FeedbackModal from "@/components/FeedbackModal";
import ToolCallBlock from "@/components/ToolCallBlock";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { createClient } from "@/lib/supabaseClient";
import EmptyStateChat from "@/components/EmptyStateChat";

interface Message {
  id: string;
  role: "user" | "assistant" | "tool_call" | "tool_output";
  content: string;
  toolName?: string;
  callId?: string;
  toolArguments?: string;
}

type RenderItem =
  | { type: "message"; message: Message }
  | { type: "tool_pair"; id: string; call: Message; output: Message | null };

interface Session {
  id: string;
  created_at: string;
  display_name?: string | null;
  is_pinned: boolean;
  initiated_by: string;
  last_read_at: string | null;
  last_message_at: string;
}

function ChatPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { session, signOut } = useAuth();
  const { creditsRemaining, planName, refetch: refetchBilling } = useBilling();
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const hasInitialized = useRef(false);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
  const getToken = () => session?.access_token ?? "";

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
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
                id: `realtime-${row.id ?? Date.now()}`,
                role: "assistant" as const,
                content: text,
              },
            ]);
            return;
          }

          // Handle agent-initiated messages written by background tasks (e.g. welcome session)
          if (item?.type === "message" && item?.role === "assistant") {
            const content = item.content as Array<{ text?: string }> | undefined;
            const text = content?.[0]?.text;
            if (!text) return;
            setMessages((prev) => {
              // Avoid duplicates if the message is already in state
              const id = `realtime-${row.id ?? Date.now()}`;
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
    router.push("/chat");
  };

  const loadSession = async (sessionId: string) => {
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
              const text = item?.content?.[0]?.text;
              if (!role || !text || !["user", "assistant"].includes(role)) continue;
              mapped.push({
                id: `${sessionId}-${mapped.length}`,
                role,
                content: text,
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

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const body: Record<string, unknown> = { prompt: input };
      if (activeSessionId) body.agent_session_id = activeSessionId;
      if (sessionMetadata) body.session_metadata = sessionMetadata;

      const response = await fetch(`${apiBaseUrl}/run`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify(body),
      });

      if (response.status === 402) {
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
              setActiveSessionId(eventData.agent_session_id);
              fetchSessions();
            } else if (eventData.type === "tool_call") {
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
      refetchBilling();
    } catch (error) {
      console.error("Error sending message:", error);
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
      {/* Sidebar */}
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
                        setOpenMenuId((prev) => (prev === s.id ? null : s.id));
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

      {/* Main Chat Column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-6 py-4">
          <div>
            <h1 className="text-lg font-semibold text-zinc-900">Product Manager Agent</h1>
            <p className="mt-1 text-sm text-zinc-500">
              Chat with your AI-powered product strategy assistant
            </p>
          </div>
          <div className="flex items-center gap-3">
            {creditsRemaining !== null && (
              <div className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm">
                <span className="text-zinc-500">Credits</span>
                <span className="ml-1.5 font-medium text-zinc-900">{creditsRemaining}</span>
              </div>
            )}
            <button
              onClick={() => setShowFeedbackModal(true)}
              className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-500 focus:ring-offset-2"
            >
              Feedback
            </button>
            <Link
              href="/settings"
              className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-500 focus:ring-offset-2"
            >
              Settings
            </Link>
            <div className="border-l border-zinc-200 pl-3">
              <button
                onClick={handleSignOut}
                className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-500 focus:ring-offset-2"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div ref={chatContainerRef} className="flex-1 overflow-y-auto px-6 py-8">
          <div className="mx-auto max-w-2xl space-y-6">
            {messages.length === 0 ? (
              !sessionsLoaded ? null : activeSession?.initiated_by === "agent" ? (
                <div className="flex h-full items-center justify-center text-center">
                  <div>
                    <p className="text-lg text-zinc-600">Your agent is preparing a welcome...</p>
                    <p className="mt-2 text-sm text-zinc-400">
                      It&apos;s reviewing your profile and will be right with you.
                    </p>
                  </div>
                </div>
              ) : (
                <EmptyStateChat onPromptSelect={(p) => setInput(p)} />
              )
            ) : (
              renderItems.map((item) => {
                if (item.type === "tool_pair") {
                  return (
                    <div key={item.id} className="flex justify-start">
                      <ToolCallBlock
                        toolName={item.call.toolName ?? item.call.content}
                        toolArguments={item.call.toolArguments ?? item.call.content}
                        output={item.output ? item.output.content : null}
                      />
                    </div>
                  );
                }
                const message = item.message;
                return (
                  <div
                    key={message.id}
                    className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-lg rounded-lg px-4 py-3 ${
                        message.role === "user"
                          ? "bg-zinc-900 text-white"
                          : "bg-zinc-100 text-zinc-900"
                      }`}
                    >
                      {message.role === "user" ? (
                        <p className="whitespace-pre-wrap text-sm leading-relaxed">
                          {message.content}
                        </p>
                      ) : (
                        <div className="prose prose-sm prose-zinc max-w-none text-zinc-900 [&_a]:text-blue-600 [&_a]:underline [&_a]:break-all [&_pre]:bg-zinc-800 [&_pre]:text-zinc-100 [&_code:not(pre_code)]:bg-zinc-200 [&_code:not(pre_code)]:px-1 [&_code:not(pre_code)]:rounded [&_code:not(pre_code)]:text-zinc-800">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {message.content}
                          </ReactMarkdown>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
            {isLoading && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-lg bg-zinc-100 px-4 py-3">
                  <div className="flex gap-1">
                    <div className="h-2 w-2 animate-bounce rounded-full bg-zinc-400" />
                    <div className="h-2 w-2 animate-bounce rounded-full bg-zinc-400 animation-delay-200" />
                    <div className="h-2 w-2 animate-bounce rounded-full bg-zinc-400 animation-delay-400" />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

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
        {showUpgradeBanner && (
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

        {/* Input Area */}
        <div className="shrink-0 border-t border-zinc-200 bg-white px-6 py-4">
          <form onSubmit={handleSendMessage} className="mx-auto max-w-2xl">
            <div className="flex items-end gap-3">
              <textarea
                ref={textareaRef}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (!isLoading && input.trim()) handleSendMessage(e as unknown as React.FormEvent);
                  }
                }}
                disabled={isLoading}
                placeholder="Ask me anything..."
                className="flex-1 max-h-40 resize-none overflow-y-auto rounded-lg border border-zinc-300 bg-white px-4 py-3 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 disabled:bg-zinc-50 disabled:text-zinc-500"
              />
              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                className="shrink-0 rounded-lg bg-zinc-900 px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
              >
                Send
              </button>
            </div>
          </form>
        </div>
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
