'use client';

import { useRef, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/AuthContext";

interface Message {
  id: string;
  role: "user" | "assistant" | "tool_call" | "tool_output";
  content: string;
  toolName?: string;
}

interface Session {
  id: string;
  created_at: string;
}

export default function ChatPage() {
  const router = useRouter();
  const { session, signOut } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const hasInitialized = useRef(false);
  const isCreatingSession = useRef(false);

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
    const init = async () => {
      await fetchSessions();
      await createNewSession();
    };
    init();
  }, [session]);

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
    }
  };

  const createNewSession = async () => {
    if (isCreatingSession.current) return;
    isCreatingSession.current = true;
    try {
      const res = await fetch(`${apiBaseUrl}/sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        setActiveSessionId(data.agent_session_id);
        setMessages([]);
        await fetchSessions();
      }
    } catch (e) {
      console.error("Failed to create session:", e);
    } finally {
      isCreatingSession.current = false;
    }
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
              });
            } else if (item?.type === "function_call_output") {
              const out = typeof item.output === "string" ? item.output : JSON.stringify(item.output);
              mapped.push({
                id: `${sessionId}-${mapped.length}`,
                role: "tool_output",
                content: out.length > 200 ? out.slice(0, 200) + "..." : out,
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
      }
    } catch (e) {
      console.error("Failed to load session:", e);
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
      const response = await fetch(`${apiBaseUrl}/run`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          prompt: input,
          agent_session_id: activeSessionId,
        }),
      });

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

            if (eventData.type === "tool_call") {
              setMessages((prev) => [
                ...prev,
                {
                  id: `tool-${Date.now()}-${Math.random()}`,
                  role: "tool_call" as const,
                  content: eventData.content ?? "",
                  toolName: eventData.content,
                },
              ]);
              // next text chunk should open a fresh assistant bubble
              currentAssistantId = null;
              currentAssistantContent = "";
            } else if (eventData.type === "tool_output") {
              setMessages((prev) => [
                ...prev,
                {
                  id: `output-${Date.now()}-${Math.random()}`,
                  role: "tool_output" as const,
                  content: eventData.content ?? "",
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
    } catch (error) {
      console.error("Error sending message:", error);
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
                onClick={createNewSession}
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
                <button
                  key={s.id}
                  onClick={() => loadSession(s.id)}
                  className={`w-full rounded-lg px-3 py-2.5 text-left text-xs transition-colors ${
                    s.id === activeSessionId
                      ? "bg-zinc-200 text-zinc-900"
                      : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                  }`}
                >
                  <span className="block truncate font-medium">Session</span>
                  <span className="mt-0.5 block truncate text-[11px] text-zinc-400">
                    {formatSessionTime(s.created_at)}
                  </span>
                </button>
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
              onClick={createNewSession}
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
              <div className="flex h-full items-center justify-center text-center">
                <div>
                  <p className="text-lg text-zinc-600">
                    Start a conversation with your Product Manager Agent
                  </p>
                  <p className="mt-2 text-sm text-zinc-400">
                    Ask questions about product strategy, market analysis, or feature prioritization
                  </p>
                </div>
              </div>
            ) : (
              messages.map((message) => {
                if (message.role === "tool_call") {
                  return (
                    <div key={message.id} className="flex justify-start">
                      <div className="max-w-lg rounded-lg border border-zinc-200 bg-white px-3 py-2">
                        <p className="font-mono text-xs font-semibold text-zinc-500">
                          🛠 {message.toolName}
                        </p>
                        <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all font-mono text-xs text-zinc-400">
                          {message.content}
                        </pre>
                      </div>
                    </div>
                  );
                }
                if (message.role === "tool_output") {
                  return (
                    <div key={message.id} className="flex justify-start">
                      <div className="max-w-lg rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
                        <p className="font-mono text-xs font-semibold text-zinc-400">
                          📋 Output
                        </p>
                        <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all font-mono text-xs text-zinc-400">
                          {message.content}
                        </pre>
                      </div>
                    </div>
                  );
                }
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
                      <p className="whitespace-pre-wrap text-sm leading-relaxed">
                        {message.content}
                      </p>
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

        {/* Input Area */}
        <div className="shrink-0 border-t border-zinc-200 bg-white px-6 py-4">
          <form onSubmit={handleSendMessage} className="mx-auto max-w-2xl">
            <div className="flex gap-3">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={isLoading}
                placeholder="Ask me anything..."
                className="flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-3 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 disabled:bg-zinc-50 disabled:text-zinc-500"
              />
              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                className="rounded-lg bg-zinc-900 px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
              >
                Send
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
