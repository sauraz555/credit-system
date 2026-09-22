/**
 * Carbon Design System Application Shell Component.
 *
 * Provides persistent enterprise navigation framing, Carbon Design System dark/light
 * theme switching ('g100' and 'g10'), role-aware profile presentation, session sign-out,
 * and responsive collapsible side navigation.
 *
 * Architecture:
 *   Frontend Presentation Layer (Core Layout Shell).
 *   Wraps root application routes and views with Carbon UI Header, SideNav, and SkipToContent.
 *   Interacts with client-side localStorage and document cookies for session display.
 *
 * Legal / Regulatory:
 *   Implements WCAG 2.1 AA accessibility standards (Section 508 / EN 301 549) via Carbon
 *   semantic landmarks, skip navigation, high-contrast tokens, and keyboard-traversable menus.
 */

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

/**
 * Props for the CarbonShell component.
 */
export interface CarbonShellProps {
  /** Nested page component tree to render within the Carbon application frame. */
  children: React.ReactNode;
}

/**
 * Root enterprise Carbon Design System navigation shell.
 *
 * @param props - CarbonShellProps containing page children.
 * @returns JSX.Element wrapping page content in Carbon header, side-nav, and theme context.
 */
export default function CarbonShell({ children }: CarbonShellProps) {
  const pathname = usePathname();
  // REVIEW-ASSUMPTION: Default enterprise theme is 'g100' (Gray 100 dark mode)
  const [currentTheme, setCurrentTheme] = useState<'g100' | 'g10'>('g100');
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  const gitSha = process.env.NEXT_PUBLIC_GIT_SHA || '01b7736';
  const [pickedEntity, setPickedEntity] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setUserRole(localStorage.getItem('user_role'));
      setUserEmail(localStorage.getItem('user_email'));
      const rawEntity = localStorage.getItem('selected_entity');
      if (rawEntity) {
        try {
          setPickedEntity(JSON.parse(rawEntity));
        } catch {
          setPickedEntity({ id: rawEntity, name: rawEntity });
        }
      }
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
      localStorage.removeItem('selected_entity');
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

  const roleUpper = userRole?.toUpperCase() || null;
  const isAdmin = roleUpper === 'ADMIN';
  const isAnalyst = roleUpper === 'ANALYST';
  const isProvider = roleUpper === 'PROVIDER';
  const isSubject = roleUpper === 'SUBJECT';
  const isGuest = !roleUpper;

  return (
    <Theme theme={currentTheme}>
      <HeaderContainer
        render={({ isSideNavExpanded, onClickSideNavExpand }: any) => (
          <>
            <Header aria-label="Credit Reporting Mechanism">
              <SkipToContent />
              <HeaderMenuButton
                aria-label={isSideNavExpanded ? 'Close menu' : 'Open menu'}
                onClick={onClickSideNavExpand}
                isActive={isSideNavExpanded}
                aria-expanded={isSideNavExpanded}
              />
              <HeaderName href="/" prefix="">
                Credit Reporting Mechanism &middot; <span className="font-mono text-xs text-[#8d8d8d] font-normal">{gitSha}</span>
              </HeaderName>

              <HeaderNavigation aria-label="Primary Navigation">
                {(isAdmin || isAnalyst || isSubject || isGuest) && (
                  <>
                    <HeaderMenuItem href={pickedEntity ? `/subject/${encodeURIComponent(pickedEntity.id)}` : '/subject'} isActive={pathname?.startsWith('/subject') && pathname !== '/subject'}>
                      Consumer report
                    </HeaderMenuItem>
                    <HeaderMenuItem href="/subject" isActive={pathname === '/subject'}>
                      Commercial report
                    </HeaderMenuItem>
                  </>
                )}
                {(isAdmin || isProvider || isGuest) && (
                  <HeaderMenuItem href="/provider" isActive={pathname?.startsWith('/provider')}>
                    Data ingestion
                  </HeaderMenuItem>
                )}
                {(isAdmin || isAnalyst || isGuest) && (
                  <HeaderMenuItem href="/analyst" isActive={pathname?.startsWith('/analyst')}>
                    Analyst
                  </HeaderMenuItem>
                )}
                {(isAdmin || isGuest) && (
                  <HeaderMenuItem href="/admin" isActive={pathname?.startsWith('/admin')}>
                    Governance
                  </HeaderMenuItem>
                )}
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
                  {/* Admin Nav Grouping */}
                  {(isAdmin || isGuest) && (
                    <SideNavMenu title="Admin" defaultExpanded={pathname?.startsWith('/admin')}>
                      <SideNavMenuItem href="/admin" isActive={pathname === '/admin'}>
                        Governance
                      </SideNavMenuItem>
                    </SideNavMenu>
                  )}

                  {/* Analyst Nav Grouping */}
                  {(isAdmin || isAnalyst || isGuest) && (
                    <SideNavMenu title="Analyst" defaultExpanded={pathname?.startsWith('/analyst')}>
                      <SideNavMenuItem href="/analyst" isActive={pathname === '/analyst'}>
                        Analyst workspace
                      </SideNavMenuItem>
                    </SideNavMenu>
                  )}

                  {/* Provider Nav Grouping */}
                  {(isAdmin || isProvider || isGuest) && (
                    <SideNavMenu title="Provider" defaultExpanded={pathname?.startsWith('/provider')}>
                      <SideNavMenuItem href="/provider" isActive={pathname === '/provider'}>
                        Data ingestion
                      </SideNavMenuItem>
                    </SideNavMenu>
                  )}

                  {/* Subject Nav Grouping */}
                  {(isAdmin || isAnalyst || isSubject || isGuest) && (
                    <SideNavMenu title="Subject" defaultExpanded={pathname?.startsWith('/subject') || pathname === '/'}>
                      <SideNavMenuItem href={pickedEntity ? `/subject/${encodeURIComponent(pickedEntity.id)}` : '/subject'} isActive={pathname?.startsWith('/subject') && pathname !== '/subject'}>
                        Consumer report
                      </SideNavMenuItem>
                      <SideNavMenuItem href="/subject" isActive={pathname === '/subject'}>
                        Commercial report
                      </SideNavMenuItem>
                      {pickedEntity && (
                        <SideNavMenuItem href={`/subject/${encodeURIComponent(pickedEntity.id)}`} isActive={pathname === `/subject/${pickedEntity.id}`}>
                          {pickedEntity.name} ({pickedEntity.id})
                        </SideNavMenuItem>
                      )}
                    </SideNavMenu>
                  )}
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
