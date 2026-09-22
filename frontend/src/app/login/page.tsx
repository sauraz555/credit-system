/**
 * Authentication and Multi-Factor Verification (MFA) Portal.
 *
 * Provides enterprise identity challenge screens supporting password-based authentication,
 * Time-based One-Time Password (TOTP) two-factor step-up verification, quick testing persona
 * pre-fill buttons for development environments, and role-based redirect dispatching.
 *
 * Architecture:
 *   Frontend Presentation Layer (Authentication Route).
 *   Next.js client-side component wrapped in React.Suspense for searchParams parsing.
 *   Interacts with backend auth endpoints (`/api/auth/login`, `/api/auth/mfa/verify`).
 *
 * Legal / Regulatory:
 *   APRA CPS 234 / NIST SP 800-63B: Mandates Multi-Factor Authentication (AAL2) for
 *   all privileged institutional personas (Admin, Analyst, Credit Provider).
 */

"use client";

import React, { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  TextInput,
  PasswordInput,
  Button,
  InlineNotification,
  Tag
} from '@carbon/react';
import { Login, Reset, Security } from '@carbon/icons-react';
import { API_BASE, checkBackendHealth } from '@/lib/api';

/**
 * Inner login form component managing interactive credential inputs, TOTP challenges, and session cookies.
 *
 * @returns JSX.Element rendering login inputs, MFA challenge modal, or quick testing persona tiles.
 */
function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectPath = searchParams.get('redirect') || '';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [mfaSecretHint, setMfaSecretHint] = useState<string | null>(null);
  const [pendingUser, setPendingUser] = useState<any>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [backendOffline, setBackendOffline] = useState(false);

  useEffect(() => {
    checkBackendHealth().then((isOnline) => {
      if (!isOnline) {
        setBackendOffline(true);
      }
    });
  }, []);

  const setAuthCookies = (token: string, role: string) => {
    // 7 days expiration
    const maxAge = 7 * 24 * 60 * 60;
    document.cookie = `auth_token=${token}; path=/; max-age=${maxAge}; SameSite=Lax`;
    document.cookie = `auth_role=${role}; path=/; max-age=${maxAge}; SameSite=Lax`;
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setIsLoading(true);

    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Authentication failed');
      }

      if (data.mfa_required) {
        setMfaToken(data.mfa_token || data.temp_token);
        setPendingUser(data.user);
        if (data.user?.email === 'admin@example.com' || data.user?.email === 'admin@bureau.gov.au') setMfaSecretHint('MRYYKLJ3GNBXCF3JLRIBHR6QV4IFLCN2');
        else if (data.user?.email === 'analyst@example.com' || data.user?.email === 'analyst@bureau.gov.au') setMfaSecretHint('WLNJMOIXHFS442MVSNNA5WQJE74JWV3I');
        else if (data.user?.email === 'provider@example.com' || data.user?.email === 'provider@cba.com.au') setMfaSecretHint('FKH56R4XUAXHWHFGNX3QE5TY6KFOOMOH');
        setIsLoading(false);
        return;
      }

      // No MFA required (e.g. SUBJECT role)
      completeAuthentication(data);
    } catch (err: any) {
      setIsLoading(false);
      setBackendOffline(true);
      setErrorMsg(err.message || 'Login failed. Verify credentials and backend status.');
    }
  };

  const handleMfaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaToken) return;
    setErrorMsg(null);
    setIsLoading(true);

    try {
      const res = await fetch(`${API_BASE}/api/auth/mfa/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mfa_token: mfaToken, totp_code: totpCode.trim() })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'MFA verification failed');
      }

      completeAuthentication(data);
    } catch (err: any) {
      setErrorMsg(err.message || 'Invalid or expired TOTP code.');
      setIsLoading(false);
    }
  };

  const completeAuthentication = (data: any) => {
    localStorage.setItem('access_token', data.access_token);
    localStorage.setItem('refresh_token', data.refresh_token);
    localStorage.setItem('user_role', data.user.role);
    localStorage.setItem('user_email', data.user.email);
    localStorage.setItem('user_entity_id', data.user.entity_id || '');
    localStorage.setItem('user_tenant_id', data.user.tenant_id || '');

    setAuthCookies(data.access_token, data.user.role);
    setSuccessMsg(`Authenticated as ${data.user.role}. Redirecting...`);

    // Target routing
    let target = redirectPath;
    if (!target || target === '/login' || target === '/403') {
      switch (data.user.role) {
        case 'ADMIN':
          target = '/admin';
          break;
        case 'ANALYST':
          target = '/analyst';
          break;
        case 'PROVIDER':
          target = '/provider';
          break;
        case 'SUBJECT':
          target = data.user.entity_id ? `/subject/${data.user.entity_id}` : '/subject/IND-8842-1994';
          break;
        default:
          target = '/';
      }
    }

    setTimeout(() => {
      window.location.href = target;
    }, 600);
  };

  const fillQuickAccount = (accEmail: string, accPass: string) => {
    setEmail(accEmail);
    setPassword(accPass);
    setMfaToken(null);
    setErrorMsg(null);
  };

  return (
    <div className="max-w-[480px] mx-auto py-8">
      {/* Page Title & Subtitle */}
      <div className="mb-6">
        <h1 className="text-2xl font-light text-[#e6e6e6] tracking-tight">
          {mfaToken ? 'Two-Factor Verification' : 'Sign in'}
        </h1>
        <p className="text-xs text-[#999999] mt-1">
          {mfaToken
            ? `Enter the 6-digit Time-based One-Time Password (TOTP) from your authenticator device for ${pendingUser?.email}.`
            : 'Enter your credentials to access the Credit Reporting Mechanism.'}
        </p>
      </div>

      {/* Inline Offline Notice */}
      {backendOffline && (
        <InlineNotification
          kind="warning"
          title="Demo backend not connected. Set NEXT_PUBLIC_API_URL."
          lowContrast
          hideCloseButton
          className="mb-4"
        />
      )}

      {errorMsg && (
        <InlineNotification
          kind="error"
          title="Authentication Failure"
          subtitle={errorMsg}
          lowContrast
          onCloseButtonClick={() => setErrorMsg(null)}
          className="mb-4"
        />
      )}

      {successMsg && (
        <InlineNotification
          kind="success"
          title="Authorized"
          subtitle={successMsg}
          lowContrast
          hideCloseButton
          className="mb-4"
        />
      )}

      {!mfaToken ? (
        <form onSubmit={handleLoginSubmit} className="space-y-4">
          <TextInput
            id="login-email"
            labelText="Corporate Email Address"
            placeholder="name@bureau.gov.au"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={isLoading}
          />
          <PasswordInput
            id="login-password"
            labelText="Argon2 Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={isLoading}
          />

          <div className="pt-2">
            <Button
              type="submit"
              renderIcon={isLoading ? undefined : Login}
              disabled={isLoading || !email || !password}
              className="w-full"
            >
              {isLoading ? 'Verifying...' : 'Sign In'}
            </Button>
          </div>
        </form>
      ) : (
        <form onSubmit={handleMfaSubmit} className="space-y-4">
          <TextInput
            id="mfa-code"
            labelText="6-Digit Authenticator Code"
            placeholder="123456"
            value={totpCode}
            maxLength={6}
            onChange={(e) => setTotpCode(e.target.value)}
            required
            disabled={isLoading}
            autoFocus
          />

          {mfaSecretHint && (
            <div className="bg-[#1c1c21] p-3 text-xs border-l-2 border-[#0f62fe]">
              <span className="font-semibold text-[#e6e6e6]">Test Secret (Base32): </span>
              <code className="text-[#0f62fe]">{mfaSecretHint}</code>
            </div>
          )}

          <div className="pt-2 flex gap-3">
            <Button
              type="submit"
              renderIcon={isLoading ? undefined : Security}
              disabled={isLoading || totpCode.trim().length !== 6}
              className="flex-1"
            >
              {isLoading ? 'Verifying...' : 'Verify MFA'}
            </Button>
            <Button
              kind="secondary"
              renderIcon={Reset}
              onClick={() => {
                setMfaToken(null);
                setTotpCode('');
              }}
              disabled={isLoading}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}

      {/* Quick-Fill Seed Accounts */}
      <div className="mt-8 pt-6 border-t border-[#202026]">
        <span className="text-[11px] uppercase text-[#999999] font-medium tracking-wider block mb-3">
          Quick Test Persona Accounts:
        </span>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div 
            onClick={() => fillQuickAccount('admin@example.com', 'Sprint2026!Admin')}
            className="p-2.5 bg-[#141417] hover:bg-[#1c1c21] cursor-pointer border border-[#202026] rounded-[2px] transition-colors"
          >
            <div className="flex justify-between items-center">
              <span className="font-medium text-[#e6e6e6]">Admin</span>
              <Tag type="red" size="sm">ADMIN</Tag>
            </div>
            <div className="text-[10px] text-[#999999] font-mono mt-1">
              admin@example.com
            </div>
          </div>

          <div 
            onClick={() => fillQuickAccount('analyst@example.com', 'Sprint2026!Analyst')}
            className="p-2.5 bg-[#141417] hover:bg-[#1c1c21] cursor-pointer border border-[#202026] rounded-[2px] transition-colors"
          >
            <div className="flex justify-between items-center">
              <span className="font-medium text-[#e6e6e6]">Analyst</span>
              <Tag type="purple" size="sm">ANALYST</Tag>
            </div>
            <div className="text-[10px] text-[#999999] font-mono mt-1">
              analyst@example.com
            </div>
          </div>

          <div 
            onClick={() => fillQuickAccount('provider@example.com', 'Sprint2026!Provider')}
            className="p-2.5 bg-[#141417] hover:bg-[#1c1c21] cursor-pointer border border-[#202026] rounded-[2px] transition-colors"
          >
            <div className="flex justify-between items-center">
              <span className="font-medium text-[#e6e6e6]">Provider (CBA)</span>
              <Tag type="teal" size="sm">PROVIDER</Tag>
            </div>
            <div className="text-[10px] text-[#999999] font-mono mt-1">
              provider@example.com
            </div>
          </div>

          <div 
            onClick={() => fillQuickAccount('subject@example.com', 'Sprint2026!Subject')}
            className="p-2.5 bg-[#141417] hover:bg-[#1c1c21] cursor-pointer border border-[#202026] rounded-[2px] transition-colors"
          >
            <div className="flex justify-between items-center">
              <span className="font-medium text-[#e6e6e6]">Subject (Vance)</span>
              <Tag type="blue" size="sm">SUBJECT</Tag>
            </div>
            <div className="text-[10px] text-[#999999] font-mono mt-1">
              subject@example.com
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Exported Login page wrapped in React Suspense boundary for client-side search parameter parsing.
 *
 * @returns JSX.Element rendering the suspended LoginForm component immediately.
 */
export default function LoginPage() {
  return (
    <React.Suspense fallback={null}>
      <LoginForm />
    </React.Suspense>
  );
}
