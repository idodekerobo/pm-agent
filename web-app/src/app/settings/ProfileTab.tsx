'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/AuthContext';

import { ROLES, USE_CASE_OPTIONS } from '@/lib/profileOptions';

interface ProfileData {
  full_name: string;
  role: string;
  company_name: string;
  company_url: string;
  product_description: string;
  use_case: string;
}

export default function ProfileTab() {
  const { session } = useAuth();
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL;

  const [profile, setProfile] = useState<ProfileData>({
    full_name: '',
    role: '',
    company_name: '',
    company_url: '',
    product_description: '',
    use_case: '',
  });
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
        setProfile({
          full_name: data.full_name ?? '',
          role: data.role ?? '',
          company_name: data.company_name ?? '',
          company_url: data.company_url ?? '',
          product_description: data.product_description ?? '',
          use_case: data.use_case ?? '',
        });
      } catch {
        setError('Could not load profile. Please refresh.');
      } finally {
        setLoading(false);
      }
    };

    if (session) fetchProfile();
  }, [session, apiBase]);

  const selectedUseCases = profile.use_case
    ? profile.use_case.split(', ').filter(Boolean)
    : [];

  const toggleUseCase = (option: string) => {
    const current = new Set(selectedUseCases);
    if (current.has(option)) current.delete(option);
    else current.add(option);
    setProfile((p) => ({ ...p, use_case: [...current].join(', ') }));
  };

  const handleSave = async () => {
    setError('');
    setSuccessMsg('');
    setSaving(true);
    try {
      const token = session?.access_token ?? '';
      const res = await fetch(`${apiBase}/user/profile`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          full_name: profile.full_name,
          role: profile.role,
          company_name: profile.company_name || null,
          company_url: profile.company_url || null,
          product_description: profile.product_description || null,
          use_case: profile.use_case || null,
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
              className="block w-full rounded-md border border-zinc-300 bg-zinc-50/50 px-3 py-2.5 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
              placeholder="Ada Lovelace"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1.5">Role</label>
            <select
              value={profile.role}
              onChange={(e) => setProfile({ ...profile, role: e.target.value })}
              className="block w-full rounded-md border border-zinc-300 bg-zinc-50/50 px-3 py-2.5 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
            >
              <option value="">Select your role</option>
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1.5">Company Name</label>
            <input
              type="text"
              value={profile.company_name}
              onChange={(e) => setProfile({ ...profile, company_name: e.target.value })}
              className="block w-full rounded-md border border-zinc-300 bg-zinc-50/50 px-3 py-2.5 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
              placeholder="Acme Inc."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1.5">Company URL</label>
            <input
              type="url"
              value={profile.company_url}
              onChange={(e) => setProfile({ ...profile, company_url: e.target.value })}
              className="block w-full rounded-md border border-zinc-300 bg-zinc-50/50 px-3 py-2.5 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
              placeholder="https://acme.com"
            />
          </div>
        </div>

        {/* Product */}
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1.5">What does your product do?</label>
          <textarea
            value={profile.product_description}
            onChange={(e) => setProfile({ ...profile, product_description: e.target.value })}
            rows={4}
            className="block w-full rounded-md border border-zinc-300 bg-zinc-50/50 px-3 py-2.5 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 resize-none"
            placeholder="We build a B2B SaaS platform that helps logistics teams track shipments in real time..."
          />
        </div>

        {/* Use cases */}
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-3">How do you use PM Agent?</label>
          <div className="grid grid-cols-2 gap-2">
            {USE_CASE_OPTIONS.map((option) => {
              const selected = selectedUseCases.includes(option);
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => toggleUseCase(option)}
                  className={`rounded-md border px-3 py-2.5 text-left text-sm transition-colors ${
                    selected
                      ? 'border-zinc-900 bg-zinc-900 text-white'
                      : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50'
                  }`}
                >
                  {option}
                </button>
              );
            })}
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
