/**
 * HTTP 403 Forbidden / Insufficient Role Authorization View.
 *
 * Rendered when a logged-in user attempts to navigate to a portal zone outside their
 * RBAC clearance (e.g., SUBJECT attempting to view /admin, or PROVIDER attempting to
 * access analyst dispute queues). Provides clear explanatory context, session details,
 * and options to return to safe routes or switch accounts.
 *
 * Architecture:
 *   Frontend Presentation Layer (Error / Access Denied Route).
 *   Targeted by Next.js Edge Middleware redirects on role clearance mismatch.
 *   Clears local storage and cookies if the user opts to re-authenticate.
 *
 * Legal / Regulatory:
 *   Enforces Nepal Individual Privacy Act 2018 (वैयक्तिक गोपनीयता सम्बन्धी ऐन, २०७५) and
 *   Nepal Rastra Bank Directives regarding mandatory data isolation and cross-role privacy.
 */

"use client";

import React, { useEffect, useState } from 'react';
import { Button, Tile, InlineNotification } from '@carbon/react';
import { MisuseOutline, Logout, ArrowLeft } from '@carbon/icons-react';
import { useTranslations } from '@/lib/i18n';

/**
 * Access Denied error component for RBAC policy violations.
 */
export default function ForbiddenPage() {
  const t = useTranslations('forbidden');
  const [currentRole, setCurrentRole] = useState<string>('UNKNOWN');

  useEffect(() => {
    const role = localStorage.getItem('user_role') || 'UNKNOWN';
    setCurrentRole(role);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user_role');
    localStorage.removeItem('user_email');
    document.cookie = 'auth_token=; path=/; max-age=0';
    document.cookie = 'auth_role=; path=/; max-age=0';
    window.location.href = '/login';
  };

  return (
    <div style={{ maxWidth: '720px', margin: '4rem auto', padding: '0 1.5rem' }}>
      <Tile style={{ padding: '2.5rem', borderLeft: '4px solid #da1e28' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
          <div style={{ background: 'rgba(218, 30, 40, 0.15)', padding: '0.75rem', borderRadius: '2px' }}>
            <MisuseOutline size={32} style={{ fill: '#da1e28' }} />
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: '#ff8389', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {t('subtitle', 'HTTP 403 · Access Denied')}
            </span>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 600, margin: '0.25rem 0 0 0' }}>
              {t('title', 'Insufficient Role Authorisation')}
            </h1>
          </div>
        </div>

        <InlineNotification
          kind="error"
          title={t('policyViolation', 'RBAC Security Policy Violation')}
          subtitle={`${t('roleMismatch', 'Your active session role does not have clearance to access this resource.')} (${currentRole})`}
          lowContrast
          hideCloseButton
          style={{ marginBottom: '1.5rem' }}
        />

        <p style={{ color: 'var(--cds-text-secondary)', lineHeight: 1.6, marginBottom: '2rem' }}>
          {t('explanation', 'Under Nepal Individual Privacy Act 2018 (वैयक्तिक गोपनीयता सम्बन्धी ऐन, २०७५) and Nepal Rastra Bank credit reporting directives, access to regulatory files, raw ingestion endpoints, and administrative engine modules is strictly partitioned by credentialed role clearance.')}
        </p>

        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <Button renderIcon={ArrowLeft} kind="secondary" onClick={() => window.location.href = '/'}>
            {t('returnHome', 'Return to Dashboard')}
          </Button>
          <Button renderIcon={Logout} kind="danger--ghost" onClick={handleLogout}>
            {t('reauth', 'Switch Account / Re-authenticate')}
          </Button>
        </div>
      </Tile>
    </div>
  );
}
