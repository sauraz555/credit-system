"use client";

import React, { useState, useEffect } from 'react';
import {
  Header,
  HeaderContainer,
  HeaderName,
  HeaderNavigation,
  HeaderMenuButton,
  HeaderMenuItem,
  HeaderGlobalBar,
  HeaderGlobalAction,
  SkipToContent,
  SideNav,
  SideNavItems,
  SideNavMenu,
  SideNavMenuItem,
  SideNavLink,
  Theme
} from '@carbon/react';
import {
  UserAvatar,
  Search,
  Notification,
  Asleep,
  Light,
  DocumentView,
  Enterprise,
  Upload,
  SettingsAdjust,
  Time,
  Logout
} from '@carbon/icons-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function CarbonShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [currentTheme, setCurrentTheme] = useState<'g100' | 'g10'>('g100');
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setUserRole(localStorage.getItem('user_role'));
      setUserEmail(localStorage.getItem('user_email'));
    }
  }, [pathname]);

  const handleLogout = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('user_role');
      localStorage.removeItem('user_email');
      localStorage.removeItem('user_entity_id');
      localStorage.removeItem('user_tenant_id');
      document.cookie = 'auth_token=; path=/; max-age=0';
      document.cookie = 'auth_role=; path=/; max-age=0';
      window.location.href = '/login';
    }
  };

  const toggleTheme = () => {
    const next = currentTheme === 'g100' ? 'g10' : 'g100';
    setCurrentTheme(next);
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-carbon-theme', next);
    }
  };

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-carbon-theme', currentTheme);
    }
  }, [currentTheme]);

  return (
    <Theme theme={currentTheme}>
      <HeaderContainer
        render={({ isSideNavExpanded, onClickSideNavExpand }: any) => (
          <>
            <Header aria-label="IBM Credit Reporting Mechanism">
              <SkipToContent />
              <HeaderMenuButton
                aria-label={isSideNavExpanded ? 'Close menu' : 'Open menu'}
                onClick={onClickSideNavExpand}
                isActive={isSideNavExpanded}
                aria-expanded={isSideNavExpanded}
              />
              <HeaderName href="/" prefix="IBM">
                Credit Reporting Mechanism &middot; <span className="font-mono text-xs text-[#8d8d8d] font-normal">v2.4-enterprise</span>
              </HeaderName>

              <HeaderNavigation aria-label="Primary Navigation">
                <HeaderMenuItem href="/subject/IND-8842-1994" isActive={pathname?.includes('/subject')}>
                  Consumer Report
                </HeaderMenuItem>
                <HeaderMenuItem href="/subject" isActive={pathname === '/subject'}>
                  Commercial Entity
                </HeaderMenuItem>
                <HeaderMenuItem href="/provider" isActive={pathname?.includes('/provider')}>
                  Provider Ingestion
                </HeaderMenuItem>
                <HeaderMenuItem href="/admin" isActive={pathname?.includes('/admin')}>
                  Analyst & Disputes
                </HeaderMenuItem>
              </HeaderNavigation>
              
              <HeaderGlobalBar>
                <HeaderGlobalAction 
                  aria-label={`Switch to ${currentTheme === 'g100' ? 'g10 Light' : 'g100 Dark'} Theme`}
                  onClick={toggleTheme}
                >
                  {currentTheme === 'g100' ? <Light size={20} /> : <Asleep size={20} />}
                </HeaderGlobalAction>
                <HeaderGlobalAction aria-label="Search Regulatory Register" onClick={() => {}}>
                  <Search size={20} />
                </HeaderGlobalAction>
                <HeaderGlobalAction aria-label="System Notifications (2 new)" onClick={() => {}}>
                  <div className="relative">
                    <Notification size={20} />
                    <span className="absolute top-0 right-0 w-2 h-2 bg-[#0f62fe]" />
                  </div>
                </HeaderGlobalAction>
                <HeaderGlobalAction aria-label={`User: ${userEmail || 'Guest'} (${userRole || 'Not Authenticated'})`}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0 0.25rem' }}>
                    <UserAvatar size={20} />
                    {userRole && (
                      <span style={{ fontSize: '0.7rem', fontWeight: 600, background: 'var(--cds-layer-accent-01, #393939)', padding: '2px 6px', borderRadius: '2px' }}>
                        {userRole}
                      </span>
                    )}
                  </div>
                </HeaderGlobalAction>
                {userRole ? (
                  <HeaderGlobalAction aria-label="Sign Out" onClick={handleLogout}>
                    <Logout size={20} />
                  </HeaderGlobalAction>
                ) : (
                  <HeaderGlobalAction aria-label="Sign In" onClick={() => window.location.href = '/login'}>
                    <UserAvatar size={20} />
                  </HeaderGlobalAction>
                )}
              </HeaderGlobalBar>
              
              <SideNav
                aria-label="Side navigation"
                expanded={isSideNavExpanded}
                isPersistent={false}
                onSideNavBlur={onClickSideNavExpand}
                href="#main-content"
              >
                <SideNavItems>
                  <SideNavMenu title="Credit Subjects" defaultExpanded={pathname?.includes('/subject') || pathname === '/'}>
                    <SideNavMenuItem href="/subject/IND-8842-1994" isActive={pathname === '/subject/IND-8842-1994'}>
                      Individual (Jonathan Vance)
                    </SideNavMenuItem>
                    <SideNavMenuItem href="/subject" isActive={pathname === '/subject'}>
                      Commercial (Apex Holdings)
                    </SideNavMenuItem>
                  </SideNavMenu>
                  
                  <SideNavMenu title="Data Providers" defaultExpanded={pathname?.includes('/provider')}>
                    <SideNavMenuItem href="/provider" isActive={pathname === '/provider'}>
                      Bulk Ingestion (NAB-001)
                    </SideNavMenuItem>
                  </SideNavMenu>

                  <SideNavMenu title="Analyst & Auditing" defaultExpanded={pathname?.includes('/admin')}>
                    <SideNavMenuItem href="/admin" isActive={pathname === '/admin'}>
                      Platform Governance
                    </SideNavMenuItem>
                  </SideNavMenu>
                </SideNavItems>
              </SideNav>
            </Header>
            <main 
              id="main-content" 
              style={{ 
                paddingTop: '3rem', 
                minHeight: '100vh', 
                backgroundColor: 'var(--cds-background)',
                color: 'var(--cds-text-primary)'
              }}
            >
              {children}
            </main>
          </>
        )}
      />
    </Theme>
  );
}
