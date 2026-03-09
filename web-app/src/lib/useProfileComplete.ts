'use client';

import { useEffect, useState } from 'react';
import { useAuth } from './AuthContext';

/**
 * Returns whether the user's profile is complete (full_name is set).
 * Used to show the "finish your profile" banner in chat and settings.
 */
export function useProfileComplete() {
  const { session } = useAuth();
  const [complete, setComplete] = useState<boolean | null>(null); // null = still loading

  useEffect(() => {
    if (!session) return;

    const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL;
    fetch(`${apiBase}/user/profile`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then((r) => r.json())
      .then((data) => setComplete(!!data.full_name && !!data.role && !!data.product_description && !!data.use_case))
      .catch(() => setComplete(true)); // on error, don't show banner
  }, [session]);

  return complete;
}
