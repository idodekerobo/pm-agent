'use client';

import { ROLES } from '@/lib/profileOptions';

interface StepRoleProps {
  role: string;
  setRole: (v: string) => void;
  roleOther: string;
  setRoleOther: (v: string) => void;
  resolvedRole: string;
}

export default function StepRole({ role, setRole, roleOther, setRoleOther, resolvedRole }: StepRoleProps) {
  return (
    <div className="px-8 py-6 space-y-5">
      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1.5">Role</label>
          <select
            value={role}
            onChange={(e) => { setRole(e.target.value); setRoleOther(''); }}
            className="block w-full rounded-md border border-zinc-300 bg-zinc-50/50 px-3 py-2.5 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
          >
            <option value="">Select your role</option>
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>

        {role === 'Other' && (
          <input
            type="text"
            value={roleOther}
            onChange={(e) => setRoleOther(e.target.value)}
            autoFocus
            placeholder="Describe your role…"
            className="block w-full rounded-md border border-zinc-300 bg-zinc-50/50 px-3 py-2.5 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
          />
        )}
      </div>

      {resolvedRole && (
        <p className="text-sm text-zinc-500 italic">
          Got it — as a <span className="font-medium text-zinc-700">{resolvedRole}</span>, I&apos;ll tailor how I communicate and prioritize what&apos;s most relevant for your perspective.
        </p>
      )}
    </div>
  );
}
