"use client";

// Tool/integration logos as inline SVGs — no external image deps
const integrations = [
  {
    name: "Notion",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
        <path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.981-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.167V6.354c0-.606-.233-.933-.748-.887l-15.177.887c-.56.047-.747.327-.747.933zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952L12.21 19s0 .84-1.168.84l-3.222.186c-.093-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.456-.233 4.764 7.279v-6.44l-1.215-.139c-.093-.514.28-.887.747-.933z"/>
      </svg>
    ),
  },
  {
    name: "Slack",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
        <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zm10.122 2.521a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zm-1.268 0a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zm-2.523 10.122a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zm0-1.268a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/>
      </svg>
    ),
  },
  {
    name: "GitHub",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
        <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>
      </svg>
    ),
  },
  {
    name: "Linear",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
        <path d="M0 12C0 5.373 5.373 0 12 0s12 5.373 12 12-5.373 12-12 12S0 18.627 0 12zm.965 0c0 2.44.81 4.694 2.165 6.503L18.503 2.165A11.036 11.036 0 0 0 12 0C5.922 0 .965 4.957.965 11.035V12zm.578 7.247C3.28 21.18 5.877 22.807 8.834 23.4L23.4 8.834A11.07 11.07 0 0 0 23.035 6.4L1.543 19.247zM12 23.035c2.44 0 4.694-.81 6.503-2.165L2.165 5.497A11.036 11.036 0 0 0 0 12c0 6.077 4.923 11.035 12 11.035z"/>
      </svg>
    ),
  },
  {
    name: "Google Docs",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
        <path d="M14.727 0H3.27C2.33 0 1.636.694 1.636 1.636v20.728C1.636 23.306 2.33 24 3.27 24H20.73c.94 0 1.636-.694 1.636-1.636V7.636L14.727 0zm3.272 22.364H6V16.91h12v5.454zm0-7.273H6v-1.818h12v1.818zm0-3.636H6V9.637h12v1.818zM13.636 8.455V1.636l6.819 6.819h-6.819z"/>
      </svg>
    ),
  },
  {
    name: "Mixpanel",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
        <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm.75 17.25a.75.75 0 0 1-1.5 0v-10.5a.75.75 0 0 1 1.5 0v10.5zm3.75-2.25a.75.75 0 0 1-1.5 0v-6a.75.75 0 0 1 1.5 0v6zm-7.5 0a.75.75 0 0 1-1.5 0v-6a.75.75 0 0 1 1.5 0v6z"/>
      </svg>
    ),
    comingSoon: true,
  },
  {
    name: "PostHog",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
        <path d="M13.5 0A13.5 13.5 0 0 0 0 13.5v.535a13.5 13.5 0 0 0 13.5 13.5A13.5 13.5 0 0 0 27 13.5a13.5 13.5 0 0 0-13.5-13.5zm0 3a10.5 10.5 0 0 1 10.5 10.5 10.5 10.5 0 0 1-10.5 10.5A10.5 10.5 0 0 1 3 13.5 10.5 10.5 0 0 1 13.5 3zm0 3a7.5 7.5 0 0 0-7.5 7.5A7.5 7.5 0 0 0 13.5 21 7.5 7.5 0 0 0 21 13.5 7.5 7.5 0 0 0 13.5 6zm0 3a4.5 4.5 0 0 1 4.5 4.5 4.5 4.5 0 0 1-4.5 4.5A4.5 4.5 0 0 1 9 13.5 4.5 4.5 0 0 1 13.5 9z"/>
      </svg>
    ),
    comingSoon: true,
  },
];

export default function LogoBar() {
  return (
    <section
      style={{
        borderTop: "1px solid var(--color-border)",
        borderBottom: "1px solid var(--color-border)",
        padding: "3rem 2rem",
      }}
    >
      <div style={{ maxWidth: "1000px", margin: "0 auto" }}>
        <p
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.7rem",
            color: "var(--color-faint)",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            textAlign: "center",
            marginBottom: "2rem",
          }}
        >
          Integrates with your entire stack
        </p>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "clamp(1.5rem, 4vw, 3.5rem)",
            flexWrap: "wrap",
          }}
        >
          {integrations.map((integration) => (
            <div
              key={integration.name}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "0.4rem",
                opacity: integration.comingSoon ? 0.35 : 0.55,
                transition: "opacity 0.2s",
                cursor: "default",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.opacity = "1";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.opacity = integration.comingSoon ? "0.35" : "0.55";
              }}
            >
              <div style={{ color: "var(--color-primary)" }}>
                {integration.icon}
              </div>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.65rem",
                  color: "var(--color-muted)",
                  letterSpacing: "0.04em",
                }}
              >
                {integration.name}
                {integration.comingSoon && (
                  <span
                    style={{
                      marginLeft: "0.3rem",
                      fontSize: "0.55rem",
                      color: "var(--color-accent)",
                      opacity: 0.7,
                    }}
                  >
                    soon
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
