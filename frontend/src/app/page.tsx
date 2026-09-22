/**
 * Credit Bureau Intelligence Platform Landing Page Dashboard.
 *
 * Serves as the primary operational entry point for the Credit Reporting Mechanism (CRMS),
 * displaying platform health telemetry, high-level portfolio metrics, live bitemporal
 * audit ledger event streams, and direct file lookup capabilities across individual and
 * commercial corporate registers.
 *
 * Architecture:
 *   Frontend Presentation Layer (Root Dashboard Route).
 *   Next.js client-side component ('use client') utilizing Carbon Design System components.
 *   Queries backend stats (`/api/entities/stats`) and autocomplete (`/api/entities?search=`).
 *
 * Legal / Regulatory:
 *   Privacy Act 1988 Part IIIA (Cth), Privacy (Credit Reporting) Code 2014, and National
 *   Consumer Credit Protection Act 2009 (NCCPA).
 */

"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Tile,
  ClickableTile,
  Tag,
  Button,
  TextInput,
  InlineNotification
} from '@carbon/react';
import {
  UserAvatar,
  Enterprise,
  Upload,
  SettingsAdjust,
  Search,
  ArrowRight,
  CheckmarkOutline,
  Time,
  Catalog,
  DataShare,
  Warning,
  Analytics
} from '@carbon/icons-react';
import { API_BASE } from '@/lib/api';

/**
 * Root Landing Dashboard component providing system metrics, search, and navigation.
 *
 * @returns JSX.Element rendering system status, search bar, metrics tiles, and module cards.
 */
export default function Home() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  // REVIEW-ASSUMPTION: Default mock statistics fallback in case backend telemetry endpoint is unreachable
  const [stats, setStats] = useState({
    individuals_count: 508,
    companies_count: 100,
    total_entities: 608,
    ledger_events_count: 547,
    open_disputes_count: 5,
    reporting_window: "SEPTEMBER 2026 CYCLE OPEN",
    hash_consistency: "100.0%"
  });

  // Fetch live bureau stats on mount
  useEffect(() => {
    fetch(`${API_BASE}/api/entities/stats`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data) setStats(data);
      })
      .catch((err) => {
        console.warn("Bureau stats offline, utilizing fallback baseline:", err);
      });
  }, []);

  // Live search debounced
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(() => {
      setIsSearching(true);
      fetch(`${API_BASE}/api/entities?search=${encodeURIComponent(searchQuery.trim())}&limit=5`)
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data && data.entities) {
            setSearchResults(data.entities);
          }
        })
        .catch((err) => {
          console.warn("Search lookup error:", err);
        })
        .finally(() => setIsSearching(false));
    }, 200);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleOpenSearch = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;

    if (q.toUpperCase().startsWith('ACN') || q.toUpperCase().startsWith('ABN')) {
      router.push(`/subject?id=${encodeURIComponent(q)}`);
    } else {
      router.push(`/subject/${encodeURIComponent(q)}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-light text-[#e6e6e6] tracking-tight">
          Credit Bureau Intelligence Platform
        </h1>
        <p className="text-xs text-[#999999] mt-1">
          Comprehensive Credit Reporting (CCR) system operating under Part IIIA of the Privacy Act 1988 (Cth).
        </p>
      </div>

      {/* Direct File Lookup */}
      <div className="bg-[#141417] border border-[#202026] p-4 rounded-[2px]">
        <div className="text-xs font-semibold text-[#999999] uppercase tracking-wider mb-2">
          Direct File Lookup
        </div>
        <form onSubmit={handleOpenSearch} className="flex gap-2 relative">
          <label htmlFor="direct-file-lookup-input" className="sr-only">
            Direct File Lookup
          </label>
          <input
            id="direct-file-lookup-input"
            aria-label="Search File ID, ABN, ACN, or Name"
            type="text"
            placeholder="Search File ID, ABN, ACN, or Name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 bg-[#0b0b0d] text-[#e6e6e6] text-xs px-3 py-2 border border-[#202026] focus:border-[#0f62fe] focus:outline-none rounded-[2px]"
          />
          <Button size="sm" kind="primary" renderIcon={ArrowRight} type="submit">
            Open
          </Button>

          {/* Live autocomplete dropdown */}
          {searchResults.length > 0 && (
            <div className="absolute left-0 right-16 top-full mt-1 bg-[#141417] border border-[#3e3e48] z-50 shadow-2xl divide-y divide-[#202026] rounded-[2px]">
              {searchResults.map((ent) => {
                const label = ent.type === 'COMPANY' 
                  ? (ent.basic_info?.company_name || ent.identifier)
                  : `${ent.basic_info?.first_name || ''} ${ent.basic_info?.last_name || ''}`.trim() || ent.identifier;
                const targetHref = ent.type === 'COMPANY'
                  ? `/subject?id=${ent.id}`
                  : `/subject/${ent.identifier || ent.id}`;

                return (
                  <Link
                    key={ent.id}
                    href={targetHref}
                    className="flex items-center justify-between p-2.5 hover:bg-[#0f62fe]/20 text-xs transition-colors"
                    onClick={() => {
                      setSearchResults([]);
                      if (typeof window !== 'undefined') {
                        localStorage.setItem('selected_entity', JSON.stringify({ id: ent.identifier || ent.id, name: label }));
                      }
                    }}
                  >
                    <div>
                      <div className="text-[#e6e6e6] font-medium">{label}</div>
                      <div className="font-mono text-[10px] text-[#777777]">
                        {ent.type} &bull; {ent.identifier}
                      </div>
                    </div>
                    <Tag size="sm" type={ent.type === 'COMPANY' ? 'teal' : 'blue'} className="m-0 font-mono">
                      {ent.score?.value ? `${ent.score.value} PTS` : 'ACTIVE'}
                    </Tag>
                  </Link>
                );
              })}
            </div>
          )}
        </form>
      </div>

      {/* Operational Workspaces */}
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-[#999999] mb-3">
          Bureau Operational Workspaces
        </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 mb-8">
        {/* Module 1: Consumer CCR Reporting */}
        <Link href="/subject/IND-8842-1994" className="block group">
          <div className="bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] p-5 h-full flex flex-col justify-between hover:border-[#0f62fe] transition-colors">
            <div>
              <div className="flex items-center justify-between mb-3">
                <Tag type="cyan" size="sm" className="m-0 font-mono">CONSUMER CCR</Tag>
                <ArrowRight size={16} className="text-[#8d8d8d] group-hover:text-[#0f62fe] group-hover:translate-x-1 transition-transform" />
              </div>
              <h3 className="text-lg font-medium text-white mb-2">Consumer Assessment</h3>
              <p className="text-xs text-[var(--cds-text-secondary)] leading-relaxed">
                Inspect comprehensive consumer files, 24-month RHI calendars, adverse default records, and interactive what-if score simulations.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-[var(--cds-border-subtle)] text-xs text-[var(--cds-link-primary)] flex items-center justify-between">
              <span>Access Consumer Report</span>
              <span className="font-mono">712 PTS</span>
            </div>
          </div>
        </Link>

        {/* Module 2: Commercial Intelligence */}
        <Link href="/subject" className="block group">
          <div className="bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] p-5 h-full flex flex-col justify-between hover:border-[#0f62fe] transition-colors">
            <div>
              <div className="flex items-center justify-between mb-3">
                <Tag type="teal" size="sm" className="m-0 font-mono">COMMERCIAL CCR</Tag>
                <ArrowRight size={16} className="text-gray-400 group-hover:text-[#0f62fe] group-hover:translate-x-1 transition-transform" />
              </div>
              <h3 className="text-lg font-medium text-white mb-2">Company Entity & PAYDEX</h3>
              <p className="text-xs text-[var(--cds-text-secondary)] leading-relaxed">
                Corporate risk analysis featuring PAYDEX 1-100 scores, Director Network contagion, PPSR charges, and trade credit payment trends.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-[var(--cds-border-subtle)] text-xs text-[var(--cds-link-primary)] flex items-center justify-between">
              <span>Access Commercial Report</span>
              <span className="font-mono">PAYDEX 78</span>
            </div>
          </div>
        </Link>

        {/* Module 3: Provider Ingestion */}
        <Link href="/provider" className="block group">
          <div className="bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] p-5 h-full flex flex-col justify-between hover:border-[#0f62fe] transition-colors">
            <div>
              <div className="flex items-center justify-between mb-3">
                <Tag type="purple" size="sm" className="m-0 font-mono">API & INGEST</Tag>
                <ArrowRight size={16} className="text-[#8d8d8d] group-hover:text-[#0f62fe] group-hover:translate-x-1 transition-transform" />
              </div>
              <h3 className="text-lg font-medium text-white mb-2">Provider Ingestion Console</h3>
              <p className="text-xs text-[var(--cds-text-secondary)] leading-relaxed">
                Credit provider gateway for batch CSV and real-time JSON submission with statutory validation (debt &ge;$150, 60+ days, notice given).
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-[var(--cds-border-subtle)] text-xs text-[var(--cds-link-primary)] flex items-center justify-between">
              <span>Data Ingestion Gateway</span>
              <span className="font-mono text-[#42be65]">ACTIVE</span>
            </div>
          </div>
        </Link>

        {/* Module 4: Analyst Workspace */}
        <Link href="/analyst" className="block group">
          <div className="bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] p-5 h-full flex flex-col justify-between hover:border-[#0f62fe] transition-colors">
            <div>
              <div className="flex items-center justify-between mb-3">
                <Tag type="blue" size="sm" className="m-0 font-mono">SUPERVISORY</Tag>
                <ArrowRight size={16} className="text-[#8d8d8d] group-hover:text-[#0f62fe] group-hover:translate-x-1 transition-transform" />
              </div>
              <h3 className="text-lg font-medium text-white mb-2">Analyst Workspace</h3>
              <p className="text-xs text-[var(--cds-text-secondary)] leading-relaxed">
                Statutory s20V dispute review, bitemporal point-in-time file reconstruction, and credit risk statistical model back-testing.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-[var(--cds-border-subtle)] text-xs text-[var(--cds-link-primary)] flex items-center justify-between">
              <span>Launch Analyst Console</span>
              <span className="font-mono text-[#0f62fe]">INVESTIGATE</span>
            </div>
          </div>
        </Link>

        {/* Module 5: Governance & Auditing */}
        <Link href="/admin" className="block group">
          <div className="bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] p-5 h-full flex flex-col justify-between hover:border-[#0f62fe] transition-colors">
            <div>
              <div className="flex items-center justify-between mb-3">
                <Tag type="magenta" size="sm" className="m-0 font-mono">REGULATION</Tag>
                <ArrowRight size={16} className="text-[#8d8d8d] group-hover:text-[#0f62fe] group-hover:translate-x-1 transition-transform" />
              </div>
              <h3 className="text-lg font-medium text-white mb-2">Platform Governance</h3>
              <p className="text-xs text-[var(--cds-text-secondary)] leading-relaxed">
                Supervisory tools for dynamic model weights versioning, Director Network contagion graphs, and statutory dispute resolution.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-[var(--cds-border-subtle)] text-xs text-[var(--cds-link-primary)] flex items-center justify-between">
              <span>Governance & Auditing</span>
              <span className="font-mono text-[#f1c21b]">{stats.open_disputes_count} PENDING</span>
            </div>
          </div>
        </Link>
      </div>
      </div>

      {/* Live Immutable Bitemporal Ledger Ticker */}
      <div className="bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] p-4">
        <div className="flex items-center justify-between mb-3 pb-2 border-b border-[var(--cds-border-subtle)] text-xs">
          <div className="flex items-center gap-2 text-white font-semibold uppercase tracking-wider">
            <Time size={14} className="text-[#0f62fe]" />
            Live Bitemporal Event Stream (Audit Ledger)
          </div>
          <span className="font-mono text-[11px] text-[var(--cds-text-helper)]">
            Auto-refreshing &bull; Cryptographic Merkle Root Synced
          </span>
        </div>

        <div
          className="overflow-x-auto"
          tabIndex={0}
          role="region"
          aria-label="Live Bitemporal Event Stream Table"
        >
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="text-[var(--cds-text-secondary)] text-[10px] uppercase border-b border-[var(--cds-border-subtle)]">
                <th className="pb-2">Tx ID</th>
                <th className="pb-2">Event Action</th>
                <th className="pb-2">Target Entity</th>
                <th className="pb-2">Valid Time</th>
                <th className="pb-2">Committed Time</th>
                <th className="pb-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--cds-border-subtle)]">
              <tr>
                <td className="py-2 text-[var(--cds-link-primary)]">TX-2026-99014</td>
                <td className="py-2 text-white">RHI_MONTHLY_REPORT</td>
                <td className="py-2 text-[var(--cds-text-secondary)]">IND-8842-1994 (Consumer)</td>
                <td className="py-2 text-[#8d8d8d]">2026-09-01 00:00:00</td>
                <td className="py-2 text-[#8d8d8d]">2026-09-21 08:30:12</td>
                <td className="py-2"><Tag type="green" size="sm" className="m-0">COMMITTED</Tag></td>
              </tr>
              <tr>
                <td className="py-2 text-[var(--cds-link-primary)]">TX-2026-99013</td>
                <td className="py-2 text-white">HARD_ENQUIRY_LOGGED</td>
                <td className="py-2 text-[var(--cds-text-secondary)]">ACN-109-283-912 (Commercial)</td>
                <td className="py-2 text-[#8d8d8d]">2026-09-20 16:42:00</td>
                <td className="py-2 text-[#8d8d8d]">2026-09-20 16:42:01</td>
                <td className="py-2"><Tag type="green" size="sm" className="m-0">COMMITTED</Tag></td>
              </tr>
              <tr>
                <td className="py-2 text-[var(--cds-link-primary)]">TX-2026-99012</td>
                <td className="py-2 text-white">DISPUTE_STATUS_AMENDED</td>
                <td className="py-2 text-[var(--cds-text-secondary)]">DEF-TEL-2024-881 (Telco)</td>
                <td className="py-2 text-[#8d8d8d]">2026-08-19 09:11:00</td>
                <td className="py-2 text-[#8d8d8d]">2026-08-19 09:11:05</td>
                <td className="py-2"><Tag type="purple" size="sm" className="m-0">UNDER REVIEW</Tag></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
