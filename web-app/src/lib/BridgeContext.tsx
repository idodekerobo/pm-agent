'use client';

import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';

const BRIDGE_URL = 'https://local.draftai.us:7349';
const HEALTH_TIMEOUT_MS = 3000;
const POLL_INTERVAL_DISCONNECTED_MS = 30_000;
const POLL_INTERVAL_CONNECTED_MS = 60_000;

type BridgeStatus = 'checking' | 'connected' | 'disconnected';

interface BridgeContextValue {
  isLocal: boolean;
  bridgeStatus: BridgeStatus;
  bridgeUrl: string;
  retryNow: () => void;
}

const BridgeContext = createContext<BridgeContextValue>({
  isLocal: false,
  bridgeStatus: 'checking',
  bridgeUrl: BRIDGE_URL,
  retryNow: () => {},
});

export function useBridge() {
  return useContext(BridgeContext);
}

export function BridgeProvider({ children }: { children: React.ReactNode }) {
  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus>('checking');
  const checkingRef = useRef(false);

  const checkBridge = useCallback(async () => {
    if (checkingRef.current) return;
    checkingRef.current = true;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
      const res = await fetch(`${BRIDGE_URL}/health`, {
        signal: controller.signal,
        cache: 'no-store',
      });
      clearTimeout(timeout);
      setBridgeStatus(res.ok ? 'connected' : 'disconnected');
    } catch {
      setBridgeStatus('disconnected');
    } finally {
      checkingRef.current = false;
    }
  }, []);

  const retryNow = useCallback(() => {
    setBridgeStatus('checking');
    checkBridge();
  }, [checkBridge]);

  // Initial check on mount
  useEffect(() => {
    checkBridge();
  }, [checkBridge]);

  // Poll interval — resets whenever status changes
  useEffect(() => {
    const interval =
      bridgeStatus === 'connected'
        ? POLL_INTERVAL_CONNECTED_MS
        : POLL_INTERVAL_DISCONNECTED_MS;
    const timer = setInterval(checkBridge, interval);
    return () => clearInterval(timer);
  }, [bridgeStatus, checkBridge]);

  // Re-check immediately on window focus
  useEffect(() => {
    const handleFocus = () => {
      setBridgeStatus('checking');
      checkBridge();
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [checkBridge]);

  return (
    <BridgeContext.Provider
      value={{
        isLocal: bridgeStatus === 'connected',
        bridgeStatus,
        bridgeUrl: BRIDGE_URL,
        retryNow,
      }}
    >
      {children}
    </BridgeContext.Provider>
  );
}
