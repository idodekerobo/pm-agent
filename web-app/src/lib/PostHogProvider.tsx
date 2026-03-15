'use client';

import posthog from 'posthog-js';
import { PostHogProvider as PHProvider, usePostHog } from 'posthog-js/react';
import { useEffect, Suspense } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';

// Init at module level so posthog is ready before the first render.
// The typeof window guard prevents this from running during SSR.
if (typeof window !== 'undefined') {
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
    capture_pageview: false,
    session_recording: {
      maskAllInputs: false,
      maskInputOptions: { password: true },
    },
  });
}

function PostHogPageView() {
  const pathname = usePathname();
  const ph = usePostHog();

  useEffect(() => {
    if (pathname && ph) {
      ph.capture('$pageview', { $current_url: window.location.href });
    }
  }, [pathname, ph]);

  return null;
}

// Must be rendered inside AuthProvider
export function PostHogUserSync() {
  const { user } = useAuth();
  const ph = usePostHog();

  useEffect(() => {
    if (!ph) return;
    if (user?.id) {
      ph.identify(user.id, { email: user.email });
    } else {
      ph.reset();
    }
  }, [user?.id, ph]);

  return null;
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  return (
    <PHProvider client={posthog}>
      <Suspense>
        <PostHogPageView />
      </Suspense>
      {children}
    </PHProvider>
  );
}
