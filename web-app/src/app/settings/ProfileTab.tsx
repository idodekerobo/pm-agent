'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { ROLES } from '@/lib/profileOptions';

const FOCUS_CHIPS = [
  'Shipping features',
  'Reducing bugs',
  'Growing users',
  'Cutting costs',
  'Managing stakeholders',
];

const ACTIVITY_CHIPS = [
  'Design & specs',
  'Data & analytics',
  'Customer support',
  'Engineering collaboration',
  'Strategy & planning',
];

interface ProfileData {
  full_name: string;
  role: string;
  role_other: string;
  company_url: string;
  current_focus: string[];
  daily_activities: string[];
}

export default function ProfileTab() {
  const { session } = useAuth();
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL;

  const [profile, setProfile] = useState<ProfileData>({
    full_name: '',
    role: '',
    role_other: '',
    company_url: '',
    current_focus: [],
    daily_activities: [],
  });
  const [focusCustom, setFocusCustom] = useState('');
  const [activityCustom, setActivityCustom] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const token = session?.access_token ?? '';
        const res = await fetch(`${apiBase}/user/profile`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error();
        const data = await res.json();

        // Separate known role from "Other" custom text
        const roleValue: string = data.role ?? '';
        const isKnownRole = ROLES.filter((r) => r !== 'Other').includes(roleValue);

        setProfile({
          full_name: data.full_name ?? '',
          role: isKnownRole ? roleValue : (roleValue ? 'Other' : ''),
          role_other: isKnownRole ? '' : roleValue,
          company_url: (data.company_url ?? '').replace(/^https?:\/\//, ''),
          current_focus: data.current_focus ?? [],
          daily_activities: data.daily_activities ?? [],
        });
      } catch {
        setError('Could not load profile. Please refresh.');
      } finally {
        setLoading(false);
      }
    };

    if (session) fetchProfile();
  }, [session, apiBase]);

  const toggleChip = (field: 'current_focus' | 'daily_activities', chip: string) => {
    setProfile((p) => {
      const current = new Set(p[field]);
      if (current.has(chip)) current.delete(chip);
      else current.add(chip);
      return { ...p, [field]: [...current] };
    });
  };

  const addCustomChip = (field: 'current_focus' | 'daily_activities', val: string) => {
    const trimmed = val.trim();
    if (!trimmed || profile[field].includes(trimmed)) return;
    setProfile((p) => ({ ...p, [field]: [...p[field], trimmed] }));
    if (field === 'current_focus') setFocusCustom('');
    else setActivityCustom('');
  };

  const handleSave = async () => {
    setError('');
    setSuccessMsg('');
    setSaving(true);
    try {
      const token = session?.access_token ?? '';
      const resolvedRole = profile.role === 'Other' ? profile.role_other.trim() : profile.role;
      const res = await fetch(`${apiBase}/user/profile`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          full_name: profile.full_name,
          role: resolvedRole || null,
          company_url: profile.company_url || null,
          current_focus: profile.current_focus.length ? profile.current_focus : null,
          daily_activities: profile.daily_activities.length ? profile.daily_activities : null,
        }),
      });
      if (!res.ok) throw new Error();
      setSuccessMsg('Profile saved.');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch {
      setError('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-3 py-10">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-600" />
        <span className="text-xs text-zinc-400" style={{ fontFamily: 'var(--font-geist-mono)' }}>
          Loading profile...
        </span>
      </div>
    );
  }

  return (
    <div className="max-w-xl">
      <h2 className="text-2xl font-semibold tracking-tight text-zinc-900">Profile</h2>
      <p className="mt-1.5 text-sm text-zinc-500">
        This information is used to personalize your agent and seed its context files.
      </p>

      <div className="mt-8 space-y-6">

        {/* Identity */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1.5">Full Name</label>
            <input
              type="text"
              value={profile.full_name}
              onChange={(e) => setProfile({ ...profile, full_name: e.target.value })}
              className="block w-full rounded-md border border-zinc-300 bg-zinc-50/50 px-3 py-2.5 text-sm text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
              placeholder="Ada Lovelace"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1.5">Role</label>
            <select
              value={profile.role}
              onChange={(e) => setProfile({ ...profile, role: e.target.value, role_other: '' })}
              className="block w-full rounded-md border border-zinc-300 bg-zinc-50/50 px-3 py-2.5 text-sm text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
            >
              <option value="">Select your role</option>
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            {profile.role === 'Other' && (
              <input
                type="text"
                value={profile.role_other}
                onChange={(e) => setProfile({ ...profile, role_other: e.target.value })}
                className="mt-2 block w-full rounded-md border border-zinc-300 bg-zinc-50/50 px-3 py-2.5 text-sm text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                placeholder="Describe your role"
              />
            )}
          </div>

          <div className="col-span-2">
            <label className="block text-sm font-medium text-zinc-700 mb-1.5">Company URL <span className="text-zinc-400 font-normal">(optional)</span></label>
            <div className="flex items-center rounded-md border border-zinc-300 bg-zinc-50/50 focus-within:border-zinc-900 focus-within:ring-1 focus-within:ring-zinc-900">
              <span className="flex items-center self-stretch pl-3 pr-2 text-sm text-zinc-400 select-none bg-zinc-100 border-r border-zinc-300 rounded-l-md">https://</span>
              <input
                type="text"
                value={profile.company_url}
                onChange={(e) => setProfile({ ...profile, company_url: e.target.value.replace(/^https?:\/\//, '') })}
                className="flex-1 bg-transparent py-2.5 pl-3 pr-3 text-sm text-zinc-900 focus:outline-none"
                placeholder="acme.com"
              />
            </div>
          </div>
        </div>

        {/* Current Focus */}
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-3">Current focus</label>
          <div className="flex flex-wrap gap-2">
            {FOCUS_CHIPS.map((chip) => {
              const selected = profile.current_focus.includes(chip);
              return (
                <button
                  key={chip}
                  type="button"
                  onClick={() => toggleChip('current_focus', chip)}
                  className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
                    selected
                      ? 'border-zinc-900 bg-zinc-900 text-white'
                      : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50'
                  }`}
                >
                  {chip}
                </button>
              );
            })}
            {/* Persisted custom chips */}
            {profile.current_focus.filter((f) => !FOCUS_CHIPS.includes(f)).map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => toggleChip('current_focus', chip)}
                className="rounded-full border border-zinc-900 bg-zinc-900 text-white px-3.5 py-1.5 text-sm transition-colors"
              >
                {chip}
              </button>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <input
              type="text"
              value={focusCustom}
              onChange={(e) => setFocusCustom(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomChip('current_focus', focusCustom); } }}
              className="flex-1 rounded-md border border-zinc-200 bg-zinc-50/50 px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
              placeholder="Add your own…"
            />
            <button
              type="button"
              onClick={() => addCustomChip('current_focus', focusCustom)}
              className="rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50 transition-colors"
            >
              Add
            </button>
          </div>
        </div>

        {/* Daily Activities */}
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-3">Daily activities</label>
          <div className="flex flex-wrap gap-2">
            {ACTIVITY_CHIPS.map((chip) => {
              const selected = profile.daily_activities.includes(chip);
              return (
                <button
                  key={chip}
                  type="button"
                  onClick={() => toggleChip('daily_activities', chip)}
                  className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
                    selected
                      ? 'border-zinc-900 bg-zinc-900 text-white'
                      : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50'
                  }`}
                >
                  {chip}
                </button>
              );
            })}
            {/* Persisted custom chips */}
            {profile.daily_activities.filter((a) => !ACTIVITY_CHIPS.includes(a)).map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => toggleChip('daily_activities', chip)}
                className="rounded-full border border-zinc-900 bg-zinc-900 text-white px-3.5 py-1.5 text-sm transition-colors"
              >
                {chip}
              </button>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <input
              type="text"
              value={activityCustom}
              onChange={(e) => setActivityCustom(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomChip('daily_activities', activityCustom); } }}
              className="flex-1 rounded-md border border-zinc-200 bg-zinc-50/50 px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
              placeholder="Add your own…"
            />
            <button
              type="button"
              onClick={() => addCustomChip('daily_activities', activityCustom)}
              className="rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50 transition-colors"
            >
              Add
            </button>
          </div>
        </div>

        {/* Feedback */}
        {error && (
          <div className="rounded-md border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
        {successMsg && (
          <div className="rounded-md border border-green-100 bg-green-50 px-4 py-3 text-sm text-green-700">
            {successMsg}
          </div>
        )}

        {/* Save */}
        <div className="pt-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-md bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:bg-zinc-400 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
