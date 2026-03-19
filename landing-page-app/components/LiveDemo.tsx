"use client";

import { useState, useEffect } from "react";
import { usePostHog } from "posthog-js/react";
import { EVENTS } from "@/lib/analytics";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.draftai.us";
const STORAGE_KEY = "draft_demo";

const CONNECTED_ITEMS = [
  "CLAUDE.md loaded",
  "GitHub connected",
  "Linear connected",
  "Slack connected",
];

export default function LiveDemo() {
  const [signupUrl, setSignupUrl] = useState(`${APP_URL}/onboarding`);
  const ph = usePostHog();

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved?.demo_token) {
        const params = new URLSearchParams({ demo_token: saved.demo_token });
        if (saved.url) params.set("company_url", saved.url);
        setSignupUrl(`${APP_URL}/onboarding?${params.toString()}`);
      }
    } catch {
      // ignore
    }
  }, []);

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
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
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
            Draft · PM Agent
          </span>
        </div>
      </div>

      {/* Body */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem 1.5rem",
          gap: "1.75rem",
          textAlign: "center",
        }}
      >
        {/* Agent badge */}
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

        {/* Connected items */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.5rem",
            width: "100%",
            maxWidth: "260px",
          }}
        >
          {CONNECTED_ITEMS.map((label) => (
            <div
              key={label}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.625rem",
                padding: "0.5rem 0.875rem",
                background: "var(--color-surface-2)",
                border: "1px solid var(--color-border)",
                borderRadius: "8px",
              }}
            >
              <svg width="10" height="10" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
                <circle cx="8" cy="8" r="7" stroke="var(--color-accent-2)" strokeWidth="1.5" />
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
                  fontSize: "0.68rem",
                  color: "var(--color-muted)",
                  letterSpacing: "0.04em",
                }}
              >
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* CTA footer */}
      <div
        style={{
          padding: "1rem",
          borderTop: "1px solid var(--color-border)",
          display: "flex",
          flexDirection: "column",
          gap: "0.5rem",
          flexShrink: 0,
        }}
      >
        <a
          href={signupUrl}
          onClick={() =>
            ph?.capture(EVENTS.CTA_CLICKED, {
              cta_location: "hero_panel",
              cta_text: "Start building free",
            })
          }
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.5rem",
            padding: "0.875rem",
            background: "var(--color-accent)",
            color: "#0B0B0B",
            fontFamily: "var(--font-body)",
            fontSize: "0.9rem",
            fontWeight: 700,
            textDecoration: "none",
            borderRadius: "8px",
            transition: "opacity 0.2s, transform 0.2s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.opacity = "0.9";
            e.currentTarget.style.transform = "translateY(-1px)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = "1";
            e.currentTarget.style.transform = "translateY(0)";
          }}
        >
          Start building free
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path
              d="M3 8h10M9 4l4 4-4 4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </a>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.65rem",
            color: "var(--color-faint)",
            letterSpacing: "0.05em",
            textAlign: "center",
          }}
        >
          Free to start · No credit card required
        </span>
      </div>

      <style>{`
        @keyframes livePulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.4;transform:scale(0.75)} }
      `}</style>
    </div>
  );
}
