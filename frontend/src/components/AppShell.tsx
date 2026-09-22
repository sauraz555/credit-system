/**
 * Clean Single-Bar Application Shell Component.
 *
 * Provides a minimal, enterprise-focused layout shell:
 * - Single top bar: "Credit Reporting Mechanism" left, 5 nav links middle, user menu right.
 * - Content area: max-width 1280px, centered with generous padding.
 * - Footer: one line, muted, product name and git SHA.
 *
 * Architecture:
 *   Frontend Presentation Layer (Root App Shell).
 *   Replaces Carbon UI Header/SideNav shell with custom accessible component.
 */

"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export interface AppShellProps {
  children: React.ReactNode;
}

export default function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [pickedEntity, setPickedEntity] = useState<{ id: string; name: string } | null>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);

  const gitSha = process.env.NEXT_PUBLIC_GIT_SHA || '043389f';

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

  // Derive user initials
  const getInitials = () => {
    if (userRole) {
      const r = userRole.trim().toUpperCase();
      if (r === 'ADMIN') return 'AD';
      if (r === 'ANALYST') return 'AN';
      if (r === 'PROVIDER') return 'PR';
      if (r === 'SUBJECT') return 'SU';
      return r.slice(0, 2);
    }
    if (userEmail) {
      return userEmail.slice(0, 2).toUpperCase();
    }
    return 'U';
  };

  // Consumer route destination: picked consumer or default consumer file
  const consumerHref = pickedEntity && !pickedEntity.id.startsWith('ACN')
    ? `/subject/${encodeURIComponent(pickedEntity.id)}`
    : '/subject/IND-8842-1994';

  const navItems = [
    {
      label: 'Consumer',
      href: consumerHref,
      isActive: Boolean(pathname?.startsWith('/subject/') && pathname !== '/subject'),
    },
    {
      label: 'Commercial',
      href: '/subject',
      isActive: pathname === '/subject',
    },
    {
      label: 'Ingestion',
      href: '/provider',
      isActive: Boolean(pathname?.startsWith('/provider')),
    },
    {
      label: 'Analyst',
      href: '/analyst',
      isActive: Boolean(pathname?.startsWith('/analyst')),
    },
    {
      label: 'Governance',
      href: '/admin',
      isActive: Boolean(pathname?.startsWith('/admin')),
    },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-[#0b0b0d] text-[#e6e6e6]">
      {/* Top Bar */}
      <header className="crm-header sticky top-0 z-50 bg-[#0b0b0d] border-b border-[#202026] h-14 flex items-center px-6">
        <div className="crm-header-inner w-full max-w-[1280px] mx-auto flex items-center justify-between gap-6">
          {/* Left: Product Name (Plain branding string, no home link) */}
          <div className="shrink-0">
            <span className="crm-brand font-semibold text-sm tracking-tight text-[#e6e6e6]">
              Credit Reporting Mechanism
            </span>
          </div>

          {/* Middle: Five nav links across the middle */}
          <nav aria-label="Main Navigation" className="crm-nav flex items-center gap-8 text-sm">
            {navItems.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className={`crm-nav-link py-1 transition-colors ${
                  item.isActive ? 'active' : ''
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          {/* Right: User Menu (Sign in when logged out, initials when logged in) */}
          <div className="shrink-0 flex items-center relative">
            {userRole ? (
              <div className="relative">
                <button
                  type="button"
                  aria-label={`User Menu (${userRole})`}
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="crm-user-menu-btn w-8 h-8 rounded-[2px] bg-[#1c1c21] border border-[#202026] text-xs font-semibold text-[#e6e6e6] flex items-center justify-center hover:border-[#3e3e48] transition-colors focus:outline-none"
                >
                  {getInitials()}
                </button>

                {showUserMenu && (
                  <div
                    className="absolute right-0 mt-2 w-48 bg-[#141417] border border-[#202026] rounded-[2px] py-1 shadow-lg z-50 text-xs"
                    onMouseLeave={() => setShowUserMenu(false)}
                  >
                    <div className="px-3 py-2 border-b border-[#202026]">
                      <div className="font-medium text-[#e6e6e6] truncate">{userEmail || 'Authenticated'}</div>
                      <div className="text-[10px] text-[#999999] font-mono uppercase mt-0.5">{userRole}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setShowUserMenu(false);
                        handleLogout();
                      }}
                      className="w-full text-left px-3 py-2 text-[#e6e6e6] hover:bg-[#1c1c21] transition-colors flex items-center justify-between"
                    >
                      <span>Sign out</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <Link
                href="/login"
                className="crm-signin-btn text-xs font-medium text-[#e6e6e6] hover:text-white px-3 py-1.5 border border-[#202026] bg-[#141417] hover:bg-[#1c1c21] rounded-[2px] transition-colors"
              >
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Area: max-width 1280px, centred, generous margin */}
      <main id="main-content" className="crm-main-container flex-1 w-full max-w-[1280px] mx-auto px-6 py-6">
        {children}
      </main>

      {/* Footer: one line, small, muted — product name, git SHA, nothing else */}
      <footer className="crm-footer border-t border-[#202026] py-5 text-center text-xs text-[#999999]">
        Credit Reporting Mechanism &middot; <span className="font-mono text-[11px]">{gitSha}</span>
      </footer>
    </div>
  );
}
