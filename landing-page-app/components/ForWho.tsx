"use client";

import { useEffect, useRef } from "react";

const personas = [
  {
    label: "01 — Solo PMs",
    headline: "The leverage of a full product team.",
    body: "You're one person doing the work of five. Draft handles the docs, strategy reviews, and all the comms overhead that pulls you away from actual product work — so you stay focused on the decisions that only you can make.",
    tag: "Your PM brain, amplified",
  },
  {
    label: "02 — Teams without a PM",
    headline: "Move with product clarity. Minus the overhead.",
    body: "Engineering teams shouldn't be blocked by missing specs, unclear priorities, or waiting on someone to relay decisions. Draft gives your team structured plans, keeps everyone aligned as things evolve, and kills the status update overhead — no dedicated PM required.",
    tag: "No PM? No problem.",
  },
  {
    label: "03 — Product teams",
    headline: "Strategy to execution, without the gap.",
    body: "Bring your roadmap, codebase context, and team tools into one place. Draft bridges the gap between high-level strategy and day-to-day execution, keeping the whole team aligned.",
    tag: "Full-team acceleration",
  },
];

export default function ForWho() {
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
      { threshold: 0.1 }
    );

    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={sectionRef}
      style={{
        padding: "7rem 2rem",
        maxWidth: "1200px",
        margin: "0 auto",
      }}
    >
      {/* Section label */}
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
          Who it&#39;s for
        </span>
      </div>

      <h2
        className="reveal reveal-delay-1"
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "clamp(2rem, 5vw, 3.5rem)",
          fontWeight: 500,
          letterSpacing: "-0.025em",
          lineHeight: 1.1,
          color: "var(--color-primary)",
          marginBottom: "4rem",
          maxWidth: "500px",
        }}
      >
        Built for the builders who ship.
      </h2>

      {/* Cards grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: "1.5px",
          background: "var(--color-border)",
          border: "1px solid var(--color-border)",
          borderRadius: "12px",
          overflow: "hidden",
        }}
      >
        {personas.map((p, i) => (
          <div
            key={p.label}
            className={`reveal reveal-delay-${i + 1}`}
            style={{
              background: "var(--color-surface)",
              padding: "2.5rem",
              transition: "background 0.2s",
              cursor: "default",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = "var(--color-surface-2)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = "var(--color-surface)";
            }}
          >
            {/* Label */}
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "0.7rem",
                color: "var(--color-accent)",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                display: "block",
                marginBottom: "1.5rem",
              }}
            >
              {p.label}
            </span>

            {/* Headline */}
            <h3
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "1.5rem",
                fontWeight: 500,
                letterSpacing: "-0.02em",
                lineHeight: 1.2,
                color: "var(--color-primary)",
                marginBottom: "1rem",
              }}
            >
              {p.headline}
            </h3>

            {/* Body */}
            <p
              style={{
                fontFamily: "var(--font-body)",
                fontSize: "0.9rem",
                color: "var(--color-muted)",
                lineHeight: 1.7,
                marginBottom: "2rem",
              }}
            >
              {p.body}
            </p>

            {/* Tag */}
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.35rem",
                padding: "0.3rem 0.75rem",
                background: "rgba(200, 148, 59, 0.08)",
                border: "1px solid rgba(200, 148, 59, 0.2)",
                borderRadius: "100px",
              }}
            >
              <span
                style={{
                  width: "4px",
                  height: "4px",
                  borderRadius: "50%",
                  background: "var(--color-accent)",
                  display: "inline-block",
                }}
              />
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.65rem",
                  color: "var(--color-accent)",
                  letterSpacing: "0.04em",
                }}
              >
                {p.tag}
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
