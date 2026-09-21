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
  Time
} from '@carbon/icons-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function CarbonShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [currentTheme, setCurrentTheme] = useState<'g100' | 'g10'>('g100');

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
              <Link href="/" passHref legacyBehavior>
                <HeaderName prefix="IBM">
                  Credit Reporting Mechanism &middot; <span className="font-mono text-xs text-gray-400 font-normal">v2.4-enterprise</span>
                </HeaderName>
              </Link>

              <HeaderNavigation aria-label="Primary Navigation">
                <Link href="/subject/IND-8842-1994" passHref legacyBehavior>
                  <HeaderMenuItem isActive={pathname?.includes('/subject')}>
                    Consumer Report
                  </HeaderMenuItem>
                </Link>
                <Link href="/subject" passHref legacyBehavior>
                  <HeaderMenuItem isActive={pathname === '/subject'}>
                    Commercial Entity
                  </HeaderMenuItem>
                </Link>
                <Link href="/provider" passHref legacyBehavior>
                  <HeaderMenuItem isActive={pathname?.includes('/provider')}>
                    Provider Ingestion
                  </HeaderMenuItem>
                </Link>
                <Link href="/admin" passHref legacyBehavior>
                  <HeaderMenuItem isActive={pathname?.includes('/admin')}>
                    Analyst & Disputes
                  </HeaderMenuItem>
                </Link>
              </HeaderNavigation>
              
              <HeaderGlobalBar>
                <HeaderGlobalAction 
                  aria-label={`Switch to ${currentTheme === 'g100' ? 'g10 Light' : 'g100 Dark'} Theme`}
                  onClick={toggleTheme}
                  title={`Toggle Theme (Current: ${currentTheme})`}
                >
                  {currentTheme === 'g100' ? <Light size={20} /> : <Asleep size={20} />}
                </HeaderGlobalAction>
                <HeaderGlobalAction aria-label="Global Search" onClick={() => {}}>
                  <Search size={20} />
                </HeaderGlobalAction>
                <HeaderGlobalAction aria-label="System Notifications (2 new)" onClick={() => {}}>
                  <div className="relative">
                    <Notification size={20} />
                    <span className="absolute top-0 right-0 w-2 h-2 bg-[#0f62fe]" />
                  </div>
                </HeaderGlobalAction>
                <HeaderGlobalAction aria-label="User Profile: S. Vance (APRA Level 3 Officer)" onClick={() => {}}>
                  <UserAvatar size={20} />
                </HeaderGlobalAction>
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
                    <Link href="/subject/IND-8842-1994" passHref legacyBehavior>
                      <SideNavMenuItem isActive={pathname === '/subject/IND-8842-1994'}>
                        Individual (Jonathan Vance)
                      </SideNavMenuItem>
                    </Link>
                    <Link href="/subject" passHref legacyBehavior>
                      <SideNavMenuItem isActive={pathname === '/subject'}>
                        Commercial (Apex Holdings)
                      </SideNavMenuItem>
                    </Link>
                  </SideNavMenu>
                  
                  <SideNavMenu title="Data Providers" defaultExpanded={pathname?.includes('/provider')}>
                    <Link href="/provider" passHref legacyBehavior>
                      <SideNavMenuItem isActive={pathname === '/provider'}>
                        Bulk Ingestion (NAB-001)
                      </SideNavMenuItem>
                    </Link>
                  </SideNavMenu>

                  <SideNavMenu title="Analyst & Auditing" defaultExpanded={pathname?.includes('/admin')}>
                    <Link href="/admin" passHref legacyBehavior>
                      <SideNavMenuItem isActive={pathname === '/admin'}>
                        Model Engine & Disputes
                      </SideNavMenuItem>
                    </Link>
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
