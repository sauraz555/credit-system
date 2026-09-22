"use client";

import React, { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  TextInput,
  PasswordInput,
  Button,
  Tile,
  InlineNotification,
  Loading,
  Tag
} from '@carbon/react';
import { Login, Locked, UserAvatar, ArrowRight, Reset, Information, Security } from '@carbon/icons-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

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
      setErrorMsg(err.message || 'Login failed. Verify credentials and backend status.');
      setIsLoading(false);
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
    <div style={{ maxWidth: '640px', margin: '3rem auto', padding: '0 1.5rem' }}>
        <Tile style={{ padding: '2.5rem', borderTop: '4px solid #0f62fe' }}>
          <div style={{ marginBottom: '2rem' }}>
            <span style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: '#78a9ff', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              BUREAU IDENTITY & ACCESS GATEWAY (PRIVACY ACT PART IIIA)
            </span>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 600, margin: '0.25rem 0 0.5rem 0' }}>
              {mfaToken ? 'Two-Factor Authentication (MFA)' : 'Platform Identity Access'}
            </h1>
            <p style={{ color: 'var(--cds-text-secondary)', fontSize: '0.875rem' }}>
              {mfaToken
                ? `Enter the 6-digit Time-based One-Time Password (TOTP) from your authenticator device for ${pendingUser?.email}.`
                : 'Authenticate with your credentialed enterprise role to access partitioned regulatory portals.'}
            </p>
          </div>

          {errorMsg && (
            <InlineNotification
              kind="error"
              title="Authentication Failure"
              subtitle={errorMsg}
              lowContrast
              onCloseButtonClick={() => setErrorMsg(null)}
              style={{ marginBottom: '1.5rem' }}
            />
          )}

          {successMsg && (
            <InlineNotification
              kind="success"
              title="Authorized"
              subtitle={successMsg}
              lowContrast
              hideCloseButton
              style={{ marginBottom: '1.5rem' }}
            />
          )}

          {!mfaToken ? (
            <form onSubmit={handleLoginSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
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

              <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem' }}>
                <Button
                  type="submit"
                  renderIcon={isLoading ? undefined : Login}
                  disabled={isLoading || !email || !password}
                  style={{ flex: 1 }}
                >
                  {isLoading ? 'Verifying Identity...' : 'Sign In'}
                </Button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleMfaSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
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
                <div style={{ background: 'var(--cds-layer-02)', padding: '0.75rem', fontSize: '0.8rem', borderLeft: '3px solid #0f62fe' }}>
                  <span style={{ fontWeight: 600 }}>Test Secret (Base32): </span>
                  <code style={{ color: '#0f62fe' }}>{mfaSecretHint}</code>
                </div>
              )}

              <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem' }}>
                <Button
                  type="submit"
                  renderIcon={isLoading ? undefined : Security}
                  disabled={isLoading || totpCode.trim().length !== 6}
                  style={{ flex: 1 }}
                >
                  {isLoading ? 'Verifying MFA Token...' : 'Verify MFA & Enter'}
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

          {/* Quick-Fill Seed Accounts Card */}
          <div style={{ marginTop: '2.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--cds-border-subtle)' }}>
            <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--cds-text-secondary)', fontWeight: 600, letterSpacing: '0.05em' }}>
              Quick Test Role Accounts (Sprint Seeded):
            </span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem', marginTop: '0.75rem' }}>
              <div 
                onClick={() => fillQuickAccount('admin@example.com', 'Sprint2026!Admin')}
                style={{ padding: '0.75rem', background: 'var(--cds-layer-01)', cursor: 'pointer', border: '1px solid var(--cds-border-subtle)', borderRadius: '2px' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>Admin</span>
                  <Tag type="red" size="sm">ADMIN</Tag>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)', marginTop: '0.25rem' }}>
                  admin@example.com (MFA)
                </div>
              </div>

              <div 
                onClick={() => fillQuickAccount('analyst@example.com', 'Sprint2026!Analyst')}
                style={{ padding: '0.75rem', background: 'var(--cds-layer-01)', cursor: 'pointer', border: '1px solid var(--cds-border-subtle)', borderRadius: '2px' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>Analyst</span>
                  <Tag type="purple" size="sm">ANALYST</Tag>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)', marginTop: '0.25rem' }}>
                  analyst@example.com (MFA)
                </div>
              </div>

              <div 
                onClick={() => fillQuickAccount('provider@example.com', 'Sprint2026!Provider')}
                style={{ padding: '0.75rem', background: 'var(--cds-layer-01)', cursor: 'pointer', border: '1px solid var(--cds-border-subtle)', borderRadius: '2px' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>Provider (CBA)</span>
                  <Tag type="teal" size="sm">PROVIDER</Tag>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)', marginTop: '0.25rem' }}>
                  provider@example.com (MFA)
                </div>
              </div>

              <div 
                onClick={() => fillQuickAccount('subject@example.com', 'Sprint2026!Subject')}
                style={{ padding: '0.75rem', background: 'var(--cds-layer-01)', cursor: 'pointer', border: '1px solid var(--cds-border-subtle)', borderRadius: '2px' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>Subject (Vance)</span>
                  <Tag type="blue" size="sm">SUBJECT</Tag>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)', marginTop: '0.25rem' }}>
                  subject@example.com
                </div>
              </div>
            </div>
          </div>
        </Tile>
      </div>
  );
}

export default function LoginPage() {
  return (
    <React.Suspense fallback={<Loading description="Loading identity portal..." />}>
      <LoginForm />
    </React.Suspense>
  );
}
