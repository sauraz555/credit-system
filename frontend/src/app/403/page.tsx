"use client";

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button, Tile, InlineNotification } from '@carbon/react';
import { MisuseOutline, Logout, ArrowLeft } from '@carbon/icons-react';

export default function ForbiddenPage() {
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
                HTTP 403 &middot; Access Denied
              </span>
              <h1 style={{ fontSize: '1.75rem', fontWeight: 600, margin: '0.25rem 0 0 0' }}>
                Insufficient Role Authorisation
              </h1>
            </div>
          </div>

          <InlineNotification
            kind="error"
            title="RBAC Security Policy Violation"
            subtitle={`Your active session role (${currentRole}) does not have clearance to access this resource.`}
            lowContrast
            hideCloseButton
            style={{ marginBottom: '1.5rem' }}
          />

          <p style={{ color: 'var(--cds-text-secondary)', lineHeight: 1.6, marginBottom: '2rem' }}>
            Under Privacy Act 1988 Part IIIA, the Privacy (Credit Reporting) Code, and National Consumer Credit Protection guidelines,
            access to regulatory files, raw ingestion endpoints, and administrative engine modules is strictly partitioned
            by credentialed role clearance.
          </p>

          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <Button renderIcon={ArrowLeft} kind="secondary" onClick={() => window.location.href = '/'}>
              Return to Directory
            </Button>
            <Button renderIcon={Logout} kind="danger--ghost" onClick={handleLogout}>
              Switch Account / Re-authenticate
            </Button>
          </div>
        </Tile>
      </div>
  );
}
