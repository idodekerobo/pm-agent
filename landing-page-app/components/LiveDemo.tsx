"use client";

import { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.draftai.us";
const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://api.draftai.us";

const STORAGE_KEY = "draft_demo";

// ─── Types ────────────────────────────────────────────────────────────────────

// "url_entered" is transient (not persisted) — the question-selection screen
type Phase = "idle" | "url_entered" | "streaming" | "awaiting" | "gated";

interface Message {
  role: "assistant" | "user";
  content: string;
}

interface PersistedDemo {
  url: string;
  messages: Message[];
  phase: "idle" | "awaiting" | "gated";
  user_turns: number;
  demo_token: string | null;
}

// SSE event shapes from /demo/run
interface SseEvent {
  type: "session_created" | "message" | "tool_call" | "tool_output" | "final_output" | "error";
  content?: string;
  label?: string;
  call_id?: string;
  demo_token?: string;
  demo_session_id?: string;
}

// ─── Suggested questions ─────────────────────────────────────────────────────

const SUGGESTED_QUESTIONS = [
  "What's the biggest gap in our current positioning?",
  "What's the easiest conversion win we're missing?",
  "How should we think about product-led growth for this product?",
  "What's the most important strategic bet we should be making right now?",
];

// ─── Real SSE stream ──────────────────────────────────────────────────────────
//
// Calls POST /demo/run and yields SSE events as parsed objects.
// Callers handle session_created, message deltas, tool visibility, and final_output.

async function* streamDemoRun(body: {
  url: string;
  question: string;
  history: Message[];
  demo_token: string | null;
}): AsyncGenerator<SseEvent> {
  const res = await fetch(`${API_BASE}/demo/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok || !res.body) {
    if (res.status === 403) {
      // Turn limit hit server-side — shouldn't normally happen (client gates first)
      yield { type: "error", content: "turn_limit" };
    } else {
      yield { type: "error", content: `HTTP ${res.status}` };
    }
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      try {
        const event: SseEvent = JSON.parse(line.slice(6));
        yield event;
      } catch {
        // malformed chunk — skip
      }
    }
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function LiveDemo() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [demoUrl, setDemoUrl] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [questionInput, setQuestionInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const [toolLabel, setToolLabel] = useState<string | null>(null); // "Reading xyz.com..."
  const [replyInput, setReplyInput] = useState("");
  const [userTurns, setUserTurns] = useState(0);
  const [demoToken, setDemoToken] = useState<string | null>(null);
  const [signupUrl, setSignupUrl] = useState(`${APP_URL}/onboarding`);

  const questionRef = useRef<HTMLInputElement>(null);
  const replyRef = useRef<HTMLInputElement>(null);
  const unmountedRef = useRef(false);

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      unmountedRef.current = true;
    };
  }, []);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const saved = JSON.parse(raw) as PersistedDemo;
      setDemoUrl(saved.url);
      setMessages(saved.messages);
      setPhase(saved.phase);
      setUserTurns(saved.user_turns);
      if (saved.demo_token) {
        setDemoToken(saved.demo_token);
        const params = new URLSearchParams({ demo_token: saved.demo_token });
        if (saved.url) params.set("company_url", saved.url);
        setSignupUrl(`${APP_URL}/onboarding?${params.toString()}`);
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    if (phase === "url_entered") questionRef.current?.focus();
    if (phase === "awaiting") replyRef.current?.focus();
  }, [phase]);

  // ── Persistence ────────────────────────────────────────────────────────────

  function persist(
    url: string,
    msgs: Message[],
    p: "idle" | "awaiting" | "gated",
    turns: number,
    token: string | null
  ) {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ url, messages: msgs, phase: p, user_turns: turns, demo_token: token })
    );
  }

  // ── SSE runner — drives all streaming turns ────────────────────────────────

  async function runSseStream({
    url,
    question,
    history,
    currentToken,
    userMsg,
    newTurns,
  }: {
    url: string;
    question: string;
    history: Message[];
    currentToken: string | null;
    userMsg: Message;
    newTurns: number;
  }) {
    setStreamingText("");
    setToolLabel(null);
    let accumulated = "";
    let resolvedToken = currentToken;

    const gen = streamDemoRun({
      url,
      question,
      history,
      demo_token: currentToken,
    });

    for await (const evt of gen) {
      if (unmountedRef.current) return;

      if (evt.type === "session_created" && evt.demo_token) {
        resolvedToken = evt.demo_token;
        setDemoToken(resolvedToken);
        const params = new URLSearchParams({ demo_token: resolvedToken });
        if (url) params.set("company_url", url);
        setSignupUrl(`${APP_URL}/onboarding?${params.toString()}`);
      } else if (evt.type === "tool_call" && evt.label) {
        setToolLabel(evt.label);
      } else if (evt.type === "tool_output") {
        setToolLabel(null);
      } else if (evt.type === "message" && evt.content) {
        accumulated += evt.content;
        setStreamingText(accumulated);
      } else if (evt.type === "final_output" && evt.content) {
        accumulated = evt.content;
      } else if (evt.type === "error") {
        // Swallow errors gracefully — streaming stops naturally
        break;
      }
    }

    if (unmountedRef.current) return;

    setStreamingText("");
    setToolLabel(null);

    const withUser = history.length === 0
      ? [userMsg]
      : [...history, userMsg];

    const finalMsgs: Message[] = accumulated
      ? [...withUser, { role: "assistant" as const, content: accumulated }]
      : withUser;

    setMessages(finalMsgs);
    setPhase("awaiting");
    persist(url, finalMsgs, "awaiting", newTurns, resolvedToken);
  }

  // ── Handlers ───────────────────────────────────────────────────────────────

  function handleUrlSubmit(e: React.FormEvent) {
    e.preventDefault();
    const raw = urlInput.trim();
    if (!raw) return;
    const url = /^https?:\/\//.test(raw) ? raw : `https://${raw}`;
    setDemoUrl(url);
    setPhase("url_entered");
  }

  async function handleAsk(e: React.FormEvent) {
    e.preventDefault();
    const question = questionInput.trim();
    if (!question) return;

    setPhase("streaming");
    setMessages([]);
    setUserTurns(0);

    const userMsg: Message = { role: "user", content: question };
    setMessages([userMsg]);

    await runSseStream({
      url: demoUrl,
      question,
      history: [],
      currentToken: demoToken,
      userMsg,
      newTurns: 0,
    });
  }

  async function handleReply(e: React.FormEvent) {
    e.preventDefault();
    const text = replyInput.trim();
    if (!text || phase !== "awaiting") return;

    // Gate fires on 2nd reply attempt (userTurns is already 1 after first reply)
    if (userTurns >= 1) {
      setPhase("gated");
      persist(demoUrl, messages, "gated", userTurns, demoToken);
      // Ensure signupUrl has both params when gate fires
      if (demoToken) {
        const params = new URLSearchParams({ demo_token: demoToken });
        if (demoUrl) params.set("company_url", demoUrl);
        setSignupUrl(`${APP_URL}/onboarding?${params.toString()}`);
      }
      return;
    }

    setReplyInput("");
    const userMsg: Message = { role: "user", content: text };
    setPhase("streaming");
    const newTurns = userTurns + 1;
    setUserTurns(newTurns);

    await runSseStream({
      url: demoUrl,
      question: text,
      history: messages,
      currentToken: demoToken,
      userMsg,
      newTurns,
    });
  }

  function reset() {
    localStorage.removeItem(STORAGE_KEY);
    unmountedRef.current = false;
    setPhase("idle");
    setDemoUrl("");
    setUrlInput("");
    setQuestionInput("");
    setMessages([]);
    setStreamingText("");
    setToolLabel(null);
    setReplyInput("");
    setUserTurns(0);
    setDemoToken(null);
    setSignupUrl(`${APP_URL}/onboarding`);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        position: "relative",
        background: "var(--color-surface)",
        border: "1px solid var(--color-border-md)",
        borderRadius: "12px",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        height: "480px",
        boxShadow:
          "0 1px 2px rgba(28,22,16,0.04), 0 4px 16px rgba(28,22,16,0.06)",
      }}
    >
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0.75rem 1rem",
          borderBottom: "1px solid var(--color-border)",
          background: "var(--color-surface-2)",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: "#4ade80",
              display: "inline-block",
              animation: "livePulse 2s ease-in-out infinite",
            }}
          />
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.68rem",
              color: "var(--color-muted)",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            Live Demo
          </span>
          {demoUrl && (
            <>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.62rem",
                  color: "var(--color-faint)",
                }}
              >
                /
              </span>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.68rem",
                  color: "var(--color-accent)",
                  letterSpacing: "0.04em",
                  maxWidth: "140px",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {demoUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}
              </span>
            </>
          )}
        </div>

        {phase !== "idle" && (
          <button
            onClick={reset}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontFamily: "var(--font-mono)",
              fontSize: "0.62rem",
              color: "var(--color-faint)",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              padding: "2px 6px",
              transition: "color 0.15s",
            }}
            onMouseEnter={(e) =>
              ((e.currentTarget as HTMLElement).style.color = "var(--color-muted)")
            }
            onMouseLeave={(e) =>
              ((e.currentTarget as HTMLElement).style.color = "var(--color-faint)")
            }
          >
            Reset
          </button>
        )}
      </div>

      {/* ── Scrollable body ───────────────────────────────────────────────── */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "1rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.875rem",
        }}
      >
        {/* ── Idle: prompt to enter URL ──────────────────────────────────── */}
        {phase === "idle" && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              gap: "0.875rem",
              textAlign: "center",
              padding: "1rem",
            }}
          >
            {/* "Draft, PM Agent" badge */}
            <div
              style={{
                display: "inline-flex",
                alignItems: "baseline",
                gap: "0.3rem",
                padding: "0.3rem 0.875rem",
                border: "1px solid var(--color-border-md)",
                borderRadius: "100px",
                background: "var(--color-surface-2)",
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "0.85rem",
                  fontWeight: 500,
                  fontStyle: "italic",
                  color: "var(--color-accent)",
                }}
              >
                Draft
              </span>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.62rem",
                  color: "var(--color-muted)",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                }}
              >
                , PM Agent
              </span>
            </div>

            <p
              style={{
                fontFamily: "var(--font-body)",
                fontSize: "0.85rem",
                color: "var(--color-muted)",
                margin: 0,
                lineHeight: 1.65,
                maxWidth: "260px",
              }}
            >
              Want to test its product advice? Drop your URL and ask the
              question that&apos;s top of mind.
            </p>
          </div>
        )}

        {/* ── URL entered: question selection ───────────────────────────── */}
        {phase === "url_entered" && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.875rem",
              paddingTop: "0.25rem",
            }}
          >
            {/* Confirmed URL chip */}
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.375rem",
                alignSelf: "flex-start",
              }}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 16 16"
                fill="none"
                style={{ flexShrink: 0 }}
              >
                <circle
                  cx="8"
                  cy="8"
                  r="7"
                  stroke="var(--color-accent-2)"
                  strokeWidth="1.5"
                />
                <path
                  d="M5 8l2 2 4-4"
                  stroke="var(--color-accent-2)"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.72rem",
                  color: "var(--color-muted)",
                }}
              >
                {demoUrl.replace(/^https?:\/\//, "")}
              </span>
            </div>

            {/* Label */}
            <p
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "0.68rem",
                color: "var(--color-faint)",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                margin: 0,
              }}
            >
              Try asking:
            </p>

            {/* Suggested question chips */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
              }}
            >
              {SUGGESTED_QUESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => {
                    setQuestionInput(q);
                    questionRef.current?.focus();
                  }}
                  style={{
                    textAlign: "left",
                    background: "var(--color-surface-2)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "8px",
                    padding: "0.625rem 0.875rem",
                    fontFamily: "var(--font-body)",
                    fontSize: "0.82rem",
                    color: "var(--color-muted)",
                    cursor: "pointer",
                    lineHeight: 1.45,
                    transition: "border-color 0.15s, color 0.15s, background 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    const el = e.currentTarget;
                    el.style.borderColor = "rgba(168,110,32,0.35)";
                    el.style.color = "var(--color-primary)";
                    el.style.background = "var(--color-surface)";
                  }}
                  onMouseLeave={(e) => {
                    const el = e.currentTarget;
                    el.style.borderColor = "var(--color-border)";
                    el.style.color = "var(--color-muted)";
                    el.style.background = "var(--color-surface-2)";
                  }}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Messages ──────────────────────────────────────────────────────── */}
        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
              gap: "0.5rem",
              alignItems: "flex-start",
            }}
          >
            {msg.role === "assistant" && <AgentAvatar />}
            <div
              style={{
                maxWidth: "84%",
                padding:
                  msg.role === "user" ? "0.5rem 0.875rem" : "0.25rem 0",
                borderRadius:
                  msg.role === "user" ? "10px 10px 2px 10px" : undefined,
                background:
                  msg.role === "user"
                    ? "var(--color-surface-2)"
                    : "transparent",
                border:
                  msg.role === "user"
                    ? "1px solid var(--color-border)"
                    : "none",
                fontFamily: "var(--font-body)",
                fontSize: "0.83rem",
                lineHeight: 1.65,
                color: "var(--color-primary)",
              }}
            >
              {msg.role === "user" ? (
                msg.content
              ) : (
                <MarkdownMessage content={msg.content} />
              )}
            </div>
          </div>
        ))}

        {/* ── Streaming text ────────────────────────────────────────────────── */}
        {streamingText && (
          <div
            style={{
              display: "flex",
              justifyContent: "flex-start",
              gap: "0.5rem",
              alignItems: "flex-start",
            }}
          >
            <AgentAvatar />
            <div
              style={{
                maxWidth: "84%",
                padding: "0.25rem 0",
                fontFamily: "var(--font-body)",
                fontSize: "0.83rem",
                lineHeight: 1.65,
                color: "var(--color-primary)",
              }}
            >
              <MarkdownMessage content={streamingText} />
              <span
                style={{
                  display: "inline-block",
                  width: 2,
                  height: 13,
                  background: "var(--color-accent)",
                  marginLeft: 2,
                  verticalAlign: "middle",
                  animation: "demoCursor 0.9s step-end infinite",
                }}
              />
            </div>
          </div>
        )}

        {/* ── Tool call label ───────────────────────────────────────────────── */}
        {toolLabel && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.375rem",
              paddingLeft: "1.875rem",
            }}
          >
            <span
              style={{
                display: "inline-block",
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "var(--color-accent)",
                animation: "livePulse 1.4s ease-in-out infinite",
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "0.68rem",
                color: "var(--color-muted)",
                letterSpacing: "0.04em",
              }}
            >
              {toolLabel}
            </span>
          </div>
        )}

        {/* ── Typing dots ───────────────────────────────────────────────────── */}
        {phase === "streaming" && !streamingText && !toolLabel && (
          <div
            style={{
              display: "flex",
              gap: "0.4rem",
              alignItems: "center",
              paddingLeft: "1.875rem",
            }}
          >
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: "50%",
                  background: "var(--color-faint)",
                  display: "inline-block",
                  animation: `demoDot 1.1s ease-in-out ${i * 0.18}s infinite`,
                }}
              />
            ))}
          </div>
        )}

      </div>

      {/* ── URL Input (idle) ───────────────────────────────────────────────── */}
      {phase === "idle" && (
        <form
          onSubmit={handleUrlSubmit}
          style={{
            padding: "0.875rem",
            borderTop: "1px solid var(--color-border)",
            display: "flex",
            gap: "0.5rem",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              background: "var(--color-surface-2)",
              border: "1px solid var(--color-border-md)",
              borderRadius: "8px",
              padding: "0 0.75rem",
              gap: "0.25rem",
              transition: "border-color 0.15s",
            }}
            onFocusCapture={(e) =>
              ((e.currentTarget as HTMLElement).style.borderColor =
                "rgba(168,110,32,0.35)")
            }
            onBlurCapture={(e) =>
              ((e.currentTarget as HTMLElement).style.borderColor =
                "var(--color-border-md)")
            }
          >
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "0.7rem",
                color: "var(--color-faint)",
                flexShrink: 0,
                userSelect: "none",
              }}
            >
              https://
            </span>
            <input
              type="text"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="yourproduct.com"
              style={{
                flex: 1,
                background: "none",
                border: "none",
                outline: "none",
                fontFamily: "var(--font-body)",
                fontSize: "0.875rem",
                color: "var(--color-primary)",
                padding: "0.625rem 0",
              }}
            />
          </div>
          <button
            type="submit"
            disabled={!urlInput.trim()}
            style={{
              padding: "0 1rem",
              background: urlInput.trim()
                ? "var(--color-accent)"
                : "var(--color-surface-2)",
              color: urlInput.trim() ? "#0B0B0B" : "var(--color-faint)",
              border: "1px solid var(--color-border-md)",
              borderRadius: "8px",
              cursor: urlInput.trim() ? "pointer" : "not-allowed",
              fontFamily: "var(--font-body)",
              fontSize: "0.85rem",
              fontWeight: 600,
              transition: "all 0.15s",
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              gap: "0.375rem",
            }}
          >
            Continue
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <path
                d="M3 8h10M9 4l4 4-4 4"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </form>
      )}

      {/* ── Question Input (url_entered) ───────────────────────────────────── */}
      {phase === "url_entered" && (
        <form
          onSubmit={handleAsk}
          style={{
            padding: "0.875rem",
            borderTop: "1px solid var(--color-border)",
            display: "flex",
            gap: "0.5rem",
            flexShrink: 0,
          }}
        >
          <input
            ref={questionRef}
            type="text"
            value={questionInput}
            onChange={(e) => setQuestionInput(e.target.value)}
            placeholder="Or ask your own question..."
            style={{
              flex: 1,
              background: "var(--color-surface-2)",
              border: "1px solid var(--color-border-md)",
              borderRadius: "8px",
              padding: "0.625rem 0.875rem",
              fontFamily: "var(--font-body)",
              fontSize: "0.875rem",
              color: "var(--color-primary)",
              outline: "none",
              transition: "border-color 0.15s",
            }}
            onFocus={(e) =>
              ((e.currentTarget as HTMLElement).style.borderColor =
                "rgba(168,110,32,0.35)")
            }
            onBlur={(e) =>
              ((e.currentTarget as HTMLElement).style.borderColor =
                "var(--color-border-md)")
            }
          />
          <button
            type="submit"
            disabled={!questionInput.trim()}
            style={{
              padding: "0 0.875rem",
              background: questionInput.trim()
                ? "var(--color-accent)"
                : "var(--color-surface-2)",
              color: questionInput.trim() ? "#0B0B0B" : "var(--color-faint)",
              border: "1px solid var(--color-border-md)",
              borderRadius: "8px",
              cursor: questionInput.trim() ? "pointer" : "not-allowed",
              fontFamily: "var(--font-body)",
              fontSize: "0.85rem",
              fontWeight: 600,
              transition: "all 0.15s",
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              gap: "0.375rem",
            }}
          >
            Ask
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <path
                d="M3 8h10M9 4l4 4-4 4"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </form>
      )}

      {/* ── Reply Input (awaiting) ─────────────────────────────────────────── */}
      {phase === "awaiting" && (
        <form
          onSubmit={handleReply}
          style={{
            padding: "0.875rem",
            borderTop: "1px solid var(--color-border)",
            display: "flex",
            gap: "0.5rem",
            flexShrink: 0,
          }}
        >
          <input
            ref={replyRef}
            type="text"
            value={replyInput}
            onChange={(e) => setReplyInput(e.target.value)}
            placeholder="Reply..."
            style={{
              flex: 1,
              background: "var(--color-surface-2)",
              border: "1px solid var(--color-border-md)",
              borderRadius: "8px",
              padding: "0.625rem 0.875rem",
              fontFamily: "var(--font-body)",
              fontSize: "0.875rem",
              color: "var(--color-primary)",
              outline: "none",
              transition: "border-color 0.15s",
            }}
            onFocus={(e) =>
              ((e.currentTarget as HTMLElement).style.borderColor =
                "rgba(168,110,32,0.35)")
            }
            onBlur={(e) =>
              ((e.currentTarget as HTMLElement).style.borderColor =
                "var(--color-border-md)")
            }
          />
          <button
            type="submit"
            disabled={!replyInput.trim()}
            style={{
              width: 38,
              height: 38,
              background: replyInput.trim()
                ? "var(--color-accent)"
                : "var(--color-surface-2)",
              border: "1px solid var(--color-border-md)",
              borderRadius: "8px",
              cursor: replyInput.trim() ? "pointer" : "not-allowed",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 0.15s",
              flexShrink: 0,
            }}
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <path
                d="M3 8h10M9 4l4 4-4 4"
                stroke={replyInput.trim() ? "#0B0B0B" : "var(--color-faint)"}
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </form>
      )}

      {/* ── Gate Modal ────────────────────────────────────────────────────── */}
      {phase === "gated" && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10,
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              backdropFilter: "blur(5px)",
              background: "rgba(245, 240, 232, 0.75)",
            }}
          />
          <div
            style={{
              position: "relative",
              zIndex: 1,
              background: "var(--color-bg)",
              border: "1px solid var(--color-border-md)",
              borderRadius: "12px",
              padding: "1.875rem 1.5rem",
              maxWidth: "260px",
              width: "calc(100% - 2rem)",
              textAlign: "center",
              boxShadow:
                "0 4px 6px rgba(28,22,16,0.04), 0 12px 40px rgba(28,22,16,0.12)",
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                background: "var(--color-surface-2)",
                border: "1px solid var(--color-border-md)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 1rem",
              }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--color-muted)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>

            <p
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "1.15rem",
                fontWeight: 500,
                color: "var(--color-primary)",
                marginBottom: "0.5rem",
                lineHeight: 1.2,
              }}
            >
              Your agent has more to say.
            </p>

            <p
              style={{
                fontFamily: "var(--font-body)",
                fontSize: "0.8rem",
                color: "var(--color-muted)",
                marginBottom: "1.375rem",
                lineHeight: 1.6,
              }}
            >
              Create a free account to continue — and connect your tools for
              deeper insights.
            </p>

            <a
              href={signupUrl}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.375rem",
                padding: "0.75rem 1.25rem",
                background: "var(--color-accent)",
                color: "#0B0B0B",
                fontFamily: "var(--font-body)",
                fontSize: "0.875rem",
                fontWeight: 700,
                textDecoration: "none",
                borderRadius: "8px",
                marginBottom: "0.875rem",
                transition: "opacity 0.15s",
              }}
              onMouseEnter={(e) =>
                ((e.currentTarget as HTMLElement).style.opacity = "0.88")
              }
              onMouseLeave={(e) =>
                ((e.currentTarget as HTMLElement).style.opacity = "1")
              }
            >
              Create free account
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                <path
                  d="M3 8h10M9 4l4 4-4 4"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </a>

            <a
              href={`${APP_URL}/auth/sign-in`}
              style={{
                fontFamily: "var(--font-body)",
                fontSize: "0.775rem",
                color: "var(--color-muted)",
                textDecoration: "none",
                transition: "color 0.15s",
              }}
              onMouseEnter={(e) =>
                ((e.currentTarget as HTMLElement).style.color =
                  "var(--color-primary)")
              }
              onMouseLeave={(e) =>
                ((e.currentTarget as HTMLElement).style.color =
                  "var(--color-muted)")
              }
            >
              Already have an account? Sign in
            </a>
          </div>
        </div>
      )}

      <style>{`
        @keyframes livePulse  { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.4;transform:scale(0.75)} }
        @keyframes demoCursor { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes demoDot    { 0%,80%,100%{transform:translateY(0);opacity:0.3} 40%{transform:translateY(-5px);opacity:1} }
      `}</style>
    </div>
  );
}

// ─── Markdown renderer ────────────────────────────────────────────────────────
// Uses the same CSS variables as the surrounding text — no new fonts or colours.

const MD_BASE: React.CSSProperties = {
  fontFamily: "var(--font-body)",
  fontSize: "0.83rem",
  lineHeight: 1.65,
  color: "var(--color-primary)",
};

function MarkdownMessage({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        // Block elements
        p: ({ children }) => (
          <p style={{ ...MD_BASE, margin: "0 0 0.6em 0" }}>{children}</p>
        ),
        h1: ({ children }) => (
          <h1 style={{ ...MD_BASE, fontSize: "1rem", fontWeight: 600, margin: "0.9em 0 0.4em" }}>{children}</h1>
        ),
        h2: ({ children }) => (
          <h2 style={{ ...MD_BASE, fontSize: "0.92rem", fontWeight: 600, margin: "0.85em 0 0.35em" }}>{children}</h2>
        ),
        h3: ({ children }) => (
          <h3 style={{ ...MD_BASE, fontSize: "0.85rem", fontWeight: 600, margin: "0.75em 0 0.3em" }}>{children}</h3>
        ),
        ul: ({ children }) => (
          <ul style={{ ...MD_BASE, paddingLeft: "1.25em", margin: "0.4em 0 0.6em", listStyleType: "disc" }}>{children}</ul>
        ),
        ol: ({ children }) => (
          <ol style={{ ...MD_BASE, paddingLeft: "1.25em", margin: "0.4em 0 0.6em", listStyleType: "decimal" }}>{children}</ol>
        ),
        li: ({ children }) => (
          <li style={{ ...MD_BASE, margin: "0.2em 0" }}>{children}</li>
        ),
        blockquote: ({ children }) => (
          <blockquote style={{
            ...MD_BASE,
            borderLeft: "2px solid var(--color-border-md)",
            paddingLeft: "0.75em",
            margin: "0.5em 0",
            color: "var(--color-muted)",
          }}>{children}</blockquote>
        ),
        hr: () => (
          <hr style={{ border: "none", borderTop: "1px solid var(--color-border)", margin: "0.75em 0" }} />
        ),
        // Inline elements
        strong: ({ children }) => (
          <strong style={{ fontWeight: 600, color: "var(--color-primary)" }}>{children}</strong>
        ),
        em: ({ children }) => (
          <em style={{ fontStyle: "italic", color: "var(--color-primary)" }}>{children}</em>
        ),
        code: ({ children }) => (
          <code style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.78rem",
            background: "var(--color-surface-2)",
            border: "1px solid var(--color-border)",
            borderRadius: "3px",
            padding: "0.1em 0.35em",
            color: "var(--color-primary)",
          }}>{children}</code>
        ),
        pre: ({ children }) => (
          <pre style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.75rem",
            background: "var(--color-surface-2)",
            border: "1px solid var(--color-border)",
            borderRadius: "6px",
            padding: "0.75em",
            overflowX: "auto",
            margin: "0.5em 0",
          }}>{children}</pre>
        ),
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--color-accent)", textDecoration: "underline", textDecorationColor: "rgba(168,110,32,0.4)" }}
          >{children}</a>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

// ─── Agent Avatar ─────────────────────────────────────────────────────────────

function AgentAvatar() {
  return (
    <div
      style={{
        width: 22,
        height: 22,
        borderRadius: "50%",
        background: "var(--color-accent)",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        marginTop: "2px",
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "0.6rem",
          fontWeight: 600,
          color: "#0B0B0B",
          lineHeight: 1,
        }}
      >
        D
      </span>
    </div>
  );
}
