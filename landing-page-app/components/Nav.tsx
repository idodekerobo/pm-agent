"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePostHog } from "posthog-js/react";
import { EVENTS } from "@/lib/analytics";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "#";
const STORAGE_KEY = "draft_demo";

export default function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [onboardingUrl, setOnboardingUrl] = useState(`${APP_URL}/onboarding`);
  const ph = usePostHog();
  const getStartedCta = "Get started"
  const signInCta = "Sign in"

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Append demo_token to CTA if a demo session exists
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved?.demo_token) {
        const params = new URLSearchParams({ demo_token: saved.demo_token });
        if (saved.url) params.set("company_url", saved.url);
        setOnboardingUrl(`${APP_URL}/onboarding?${params.toString()}`);
      }
    } catch {
      // ignore
    }
  }, []);

  return (
    <header
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        transition: "background 0.3s ease, border-color 0.3s ease",
        background: scrolled
          ? "var(--color-nav-bg)"
          : "transparent",
        borderBottom: `1px solid ${scrolled ? "var(--color-border-md)" : "transparent"}`,
        backdropFilter: scrolled ? "blur(16px)" : "none",
      }}
    >
      <nav
        style={{
          maxWidth: "1200px",
          margin: "0 auto",
          padding: "0 2rem",
          height: "64px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        {/* Logo */}
        <Link href="/" style={{ textDecoration: "none" }}>
          <span
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "1.5rem",
              color: "var(--color-primary)",
              letterSpacing: "-0.02em",
              fontWeight: 500,
            }}
          >
            Draft
            <span style={{ color: "var(--color-accent)" }}>.</span>
          </span>
        </Link>

        {/* Desktop Nav Links */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "2.5rem",
          }}
          className="hidden-mobile"
        >
          {[
            { label: "Features", href: "#features" },
            { label: "Integrations", href: "#integrations" },
            // TODO: add Pricing link once pricing page is built
            // { label: "Pricing", href: "#pricing" },
          ].map((link) => (
            <a
              key={link.label}
              href={link.href}
              style={{
                fontFamily: "var(--font-body)",
                fontSize: "0.875rem",
                color: "var(--color-muted)",
                textDecoration: "none",
                transition: "color 0.2s",
                letterSpacing: "0.01em",
              }}
              onMouseEnter={(e) =>
                ((e.target as HTMLElement).style.color = "var(--color-primary)")
              }
              onMouseLeave={(e) =>
                ((e.target as HTMLElement).style.color = "var(--color-muted)")
              }
            >
              {link.label}
            </a>
          ))}

          <a
            href={`${APP_URL}/auth/sign-in`}
            onClick={() => ph?.capture(EVENTS.CTA_CLICKED, { cta_location: 'nav', cta_text: signInCta })}
            style={{
              fontFamily: "var(--font-body)",
              fontSize: "0.875rem",
              color: "var(--color-muted)",
              textDecoration: "none",
              transition: "color 0.2s",
              letterSpacing: "0.01em",
            }}
            onMouseEnter={(e) =>
              ((e.target as HTMLElement).style.color = "var(--color-primary)")
            }
            onMouseLeave={(e) =>
              ((e.target as HTMLElement).style.color = "var(--color-muted)")
            }
          >
            {signInCta}
          </a>

          <a
            href={onboardingUrl}
            onClick={() => ph?.capture(EVENTS.CTA_CLICKED, { cta_location: 'nav', cta_text: getStartedCta })}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.4rem",
              padding: "0.5rem 1.25rem",
              background: "var(--color-accent)",
              color: "#0B0B0B",
              fontFamily: "var(--font-body)",
              fontSize: "0.875rem",
              fontWeight: 600,
              textDecoration: "none",
              borderRadius: "6px",
              transition: "opacity 0.2s, transform 0.15s",
              letterSpacing: "0.01em",
            }}
            onMouseEnter={(e) => {
              (e.target as HTMLElement).style.opacity = "0.9";
              (e.target as HTMLElement).style.transform = "translateY(-1px)";
            }}
            onMouseLeave={(e) => {
              (e.target as HTMLElement).style.opacity = "1";
              (e.target as HTMLElement).style.transform = "translateY(0)";
            }}
          >
            {getStartedCta}
          </a>
        </div>

        {/* Mobile menu button */}
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          style={{
            display: "none",
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: "8px",
            color: "var(--color-primary)",
          }}
          className="show-mobile"
          aria-label="Toggle menu"
        >
          <div
            style={{
              width: "22px",
              height: "2px",
              background: "currentColor",
              marginBottom: "5px",
              transition: "transform 0.2s",
              transform: menuOpen ? "rotate(45deg) translateY(7px)" : "none",
            }}
          />
          <div
            style={{
              width: "22px",
              height: "2px",
              background: "currentColor",
              opacity: menuOpen ? 0 : 1,
              transition: "opacity 0.2s",
            }}
          />
          <div
            style={{
              width: "22px",
              height: "2px",
              background: "currentColor",
              marginTop: "5px",
              transition: "transform 0.2s",
              transform: menuOpen ? "rotate(-45deg) translateY(-7px)" : "none",
            }}
          />
        </button>
      </nav>

      {/* Mobile Menu */}
      {menuOpen && (
        <div
          style={{
            background: "var(--color-nav-bg-mobile)",
            borderBottom: "1px solid var(--color-border)",
            padding: "1.5rem 2rem",
            display: "flex",
            flexDirection: "column",
            gap: "1.25rem",
          }}
        >
          {/* TODO: add "Pricing" once pricing page is built */}
          {["Features", "Integrations"].map((label) => (
            <a
              key={label}
              href={`#${label.toLowerCase()}`}
              onClick={() => setMenuOpen(false)}
              style={{
                color: "var(--color-muted)",
                textDecoration: "none",
                fontSize: "1rem",
              }}
            >
              {label}
            </a>
          ))}
          <a
            href={onboardingUrl}
            onClick={() => ph?.capture(EVENTS.CTA_CLICKED, { cta_location: 'nav_mobile', cta_text: getStartedCta })}
            style={{
              display: "inline-block",
              padding: "0.75rem 1.5rem",
              background: "var(--color-accent)",
              color: "#0B0B0B",
              fontWeight: 600,
              textDecoration: "none",
              borderRadius: "6px",
              textAlign: "center",
            }}
          >
            {getStartedCta}
          </a>
        </div>
      )}

      <style>{`
        @media (max-width: 768px) {
          .hidden-mobile { display: none !important; }
          .show-mobile { display: flex !important; flex-direction: column; }
        }
        @media (min-width: 769px) {
          .show-mobile { display: none !important; }
        }
      `}</style>
    </header>
  );
}
