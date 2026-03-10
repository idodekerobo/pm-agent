"use client";

import { useEffect, useRef } from "react";

const features = [
  {
    number: "01",
    title: "Spec & document",
    headline: "Turn rough ideas into airtight feature plans.",
    body: "Describe what you want to build — Draft iterates with you until the spec is solid. It asks the right questions, surfaces edge cases, and produces structured docs your team can actually execute on.",
    detail: "PRDs · Technical specs · User stories · Acceptance criteria",
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
        <rect x="4" y="4" width="20" height="20" rx="2" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M9 10h10M9 14h7M9 18h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <circle cx="21" cy="21" r="4" fill="var(--color-bg)" stroke="var(--color-accent)" strokeWidth="1.5"/>
        <path d="M19.5 21l1 1 2-2" stroke="var(--color-accent)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    number: "02",
    title: "Strategic thinking",
    headline: "A thought partner that understands your whole context.",
    body: "Draft has full context on your roadmap, codebase, and product history. Use it to think through tradeoffs, stress-test prioritization, and make decisions faster — without scheduling a meeting.",
    detail: "Roadmap reviews · Prioritization · Tradeoff analysis · OKR alignment",
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
        <path d="M14 4C8.477 4 4 8.477 4 14s4.477 10 10 10 10-4.477 10-10S19.523 4 14 4z" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M14 9v5l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M8 5.5l-2-2M20 5.5l2-2M8 22.5l-2 2M20 22.5l2 2" stroke="var(--color-accent)" strokeWidth="1.2" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    number: "03",
    title: "Agent orchestration",
    headline: "From spec to shipped — without leaving Draft.",
    body: "Draft orchestrates coding agents directly from your feature specs. Define the work, Draft breaks it into tasks, hands them to agents, and tracks progress. Planning and execution in one loop.",
    detail: "Task delegation · Agent coordination · Progress tracking · Code review",
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
        <rect x="11" y="4" width="6" height="5" rx="1" stroke="currentColor" strokeWidth="1.5"/>
        <rect x="4" y="18" width="6" height="5" rx="1" stroke="currentColor" strokeWidth="1.5"/>
        <rect x="18" y="18" width="6" height="5" rx="1" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M14 9v4M14 13l-7 5M14 13l7 5" stroke="var(--color-accent)" strokeWidth="1.2" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    number: "04",
    title: "Team alignment",
    headline: "Stop being your team's Slack bot.",
    body: "Draft tracks decisions, surfaces blockers, and keeps everyone in the loop — without you being the relay. No more re-explaining context. No more loose threads. Your team stays aligned without constantly pulling you in.",
    detail: "Status updates · Decision logs · Blocker tracking · Async alignment",
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
        <path d="M4 8a2 2 0 012-2h16a2 2 0 012 2v10a2 2 0 01-2 2H9l-5 3V8z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
        <path d="M9 13h6M9 17h4" stroke="var(--color-accent)" strokeWidth="1.2" strokeLinecap="round"/>
        <path d="M20 6l2-2M20 6h-2" stroke="var(--color-accent)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    number: "05",
    title: "Deep integrations",
    headline: "All your context, in one place.",
    body: "Draft connects to Slack, Linear, GitHub, Notion, and Google Docs — pulling in the context it needs to give you relevant, grounded answers. No more copy-pasting between tools.",
    detail: "Slack · Linear · GitHub · Notion · Google Docs · Mixpanel (soon) · PostHog (soon)",
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
        <circle cx="14" cy="14" r="3" stroke="currentColor" strokeWidth="1.5"/>
        <circle cx="5" cy="8" r="2.5" stroke="var(--color-accent)" strokeWidth="1.2"/>
        <circle cx="23" cy="8" r="2.5" stroke="var(--color-accent)" strokeWidth="1.2"/>
        <circle cx="5" cy="20" r="2.5" stroke="currentColor" strokeWidth="1.2"/>
        <circle cx="23" cy="20" r="2.5" stroke="currentColor" strokeWidth="1.2"/>
        <path d="M7 9.5l5 3M21 9.5l-5 3M7.5 19l5-3M20.5 19l-5-3" stroke="var(--color-muted)" strokeWidth="1" strokeLinecap="round"/>
      </svg>
    ),
  },
];

export default function Features() {
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.querySelectorAll(".reveal").forEach((el) => {
              el.classList.add("in-view");
            });
          }
        });
      },
      { threshold: 0.05 }
    );

    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      id="features"
      ref={sectionRef}
      style={{
        padding: "5rem 2rem 7rem",
        background: "var(--color-surface)",
        position: "relative",
        overflow: "hidden",
      }}
      className="blueprint-grid-faint"
    >
      {/* Top gradient fade */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "120px",
          background: "linear-gradient(to bottom, var(--color-bg), transparent)",
          pointerEvents: "none",
          zIndex: 1,
        }}
      />

      <div
        style={{
          maxWidth: "1200px",
          margin: "0 auto",
          position: "relative",
          zIndex: 2,
        }}
      >
        {/* Header */}
        <div
          className="reveal"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            marginBottom: "1rem",
          }}
        >
          <span className="accent-rule" style={{ width: "2rem" }} />
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.7rem",
              color: "var(--color-accent)",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            What Draft does
          </span>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            marginBottom: "4rem",
            flexWrap: "wrap",
            gap: "1.5rem",
          }}
        >
          <h2
            className="reveal reveal-delay-1"
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "clamp(2rem, 5vw, 3.5rem)",
              fontWeight: 500,
              letterSpacing: "-0.025em",
              lineHeight: 1.1,
              color: "var(--color-primary)",
              maxWidth: "400px",
            }}
          >
            From idea to shipped. Faster.
          </h2>

          <p
            className="reveal reveal-delay-2"
            style={{
              fontFamily: "var(--font-body)",
              fontSize: "0.95rem",
              color: "var(--color-muted)",
              lineHeight: 1.7,
              maxWidth: "340px",
            }}
          >
            Five core capabilities that cover the full product lifecycle — from
            the first rough thought to code running in production.
          </p>
        </div>

        {/* Feature cards — 2x2 grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
            gap: "1rem",
          }}
        >
          {features.map((f, i) => (
            <FeatureCard key={f.number} feature={f} delay={i + 1} />
          ))}
        </div>
      </div>
    </section>
  );
}

function FeatureCard({
  feature,
  delay,
}: {
  feature: (typeof features)[0];
  delay: number;
}) {
  return (
    <div
      className={`reveal reveal-delay-${delay} glass-card`}
      style={{
        padding: "2rem",
        borderRadius: "10px",
        transition: "border-color 0.2s, transform 0.2s",
        cursor: "default",
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLElement;
        el.style.borderColor = "rgba(237,229,208,0.18)";
        el.style.transform = "translateY(-2px)";
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLElement;
        el.style.borderColor = "var(--color-border)";
        el.style.transform = "translateY(0)";
      }}
    >
      {/* Number + icon row */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: "1.5rem",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.65rem",
            color: "var(--color-faint)",
            letterSpacing: "0.08em",
            paddingTop: "4px",
          }}
        >
          {feature.number}
        </span>
        <div style={{ color: "var(--color-muted)" }}>{feature.icon}</div>
      </div>

      {/* Title */}
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "0.65rem",
          color: "var(--color-accent)",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          marginBottom: "0.75rem",
        }}
      >
        {feature.title}
      </div>

      {/* Headline */}
      <h3
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "1.4rem",
          fontWeight: 500,
          letterSpacing: "-0.02em",
          lineHeight: 1.25,
          color: "var(--color-primary)",
          marginBottom: "0.875rem",
        }}
      >
        {feature.headline}
      </h3>

      {/* Body */}
      <p
        style={{
          fontFamily: "var(--font-body)",
          fontSize: "0.875rem",
          color: "var(--color-muted)",
          lineHeight: 1.7,
          marginBottom: "1.5rem",
        }}
      >
        {feature.body}
      </p>

      {/* Detail tag */}
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "0.65rem",
          color: "var(--color-faint)",
          lineHeight: 1.6,
          borderTop: "1px solid var(--color-border)",
          paddingTop: "1rem",
        }}
      >
        {feature.detail}
      </div>
    </div>
  );
}
