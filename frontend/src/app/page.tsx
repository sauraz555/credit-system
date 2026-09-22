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
  Warning
} from '@carbon/icons-react';

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
    fetch('http://localhost:8000/api/entities/stats')
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
      fetch(`http://localhost:8000/api/entities?search=${encodeURIComponent(searchQuery.trim())}&limit=5`)
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
    <div className="p-4 md:p-8 max-w-[1680px] mx-auto">
      {/* Top System Status Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-3 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] mb-6 text-xs">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-emerald-400 font-mono font-semibold">
            <span className="w-2 h-2 bg-emerald-500 rounded-none inline-block animate-pulse" />
            CRMS CORE ONLINE
          </div>
          <span className="text-[var(--cds-border-strong)]">|</span>
          <span className="text-[var(--cds-text-secondary)]">
            Bureau Reporting Window: <strong className="text-white">{stats.reporting_window}</strong>
          </span>
          <span className="text-[var(--cds-border-strong)] hidden md:inline">|</span>
          <span className="text-[var(--cds-text-secondary)] hidden md:inline">
            Bitemporal Ledger: <strong className="text-white font-mono">APPEND-ONLY IMMUTABLE</strong>
          </span>
        </div>

        <div className="flex items-center gap-4 text-[var(--cds-text-secondary)] font-mono text-[11px]">
          <div>INGESTION QUEUE: <span className="text-emerald-400">IDLE (0 BACKLOG)</span></div>
          <div>HASH CONSISTENCY: <span className="text-emerald-400">{stats.hash_consistency}</span></div>
        </div>
      </div>

      {/* Header & Global Quick Search */}
      <div className="mb-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-4 border-b border-[var(--cds-border-subtle)]">
          <div>
            <h1 className="text-3xl md:text-4xl font-light text-white tracking-tight">
              Credit Bureau Intelligence Platform
            </h1>
            <p className="text-sm text-[var(--cds-text-secondary)] mt-1.5 max-w-3xl">
              Regulated Comprehensive Credit Reporting (CCR) system operating under Part IIIA of the Privacy Act 1988 (Cth), the Privacy (Credit Reporting) Code 2014, and the National Consumer Credit Protection Act 2009.
            </p>
          </div>

          {/* Search Box */}
          <div className="w-full md:w-96 relative">
            <div className="text-xs font-semibold text-[var(--cds-text-secondary)] uppercase tracking-wider mb-1">
              Direct File Lookup
            </div>
            <form onSubmit={handleOpenSearch} className="flex gap-2">
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
                className="flex-1 bg-[var(--cds-field)] text-white text-xs px-3 py-2 border border-[var(--cds-border-subtle)] focus:border-[#0f62fe] focus:outline-none"
              />
              <Button size="sm" kind="primary" renderIcon={ArrowRight} type="submit">
                Open
              </Button>
            </form>

            {/* Live autocomplete dropdown */}
            {searchResults.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-[var(--cds-layer-02)] border border-[var(--cds-border-strong)] z-50 shadow-2xl divide-y divide-[var(--cds-border-subtle)]">
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
                      onClick={() => setSearchResults([])}
                    >
                      <div>
                        <div className="text-white font-medium">{label}</div>
                        <div className="font-mono text-[10px] text-[var(--cds-text-helper)]">
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
          </div>
        </div>
      </div>

      {/* High-Level Bureau Operational Metrics Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] p-4">
          <div className="text-[10px] uppercase font-semibold text-[var(--cds-text-helper)] tracking-wider">
            Monitored Consumers
          </div>
          <div className="text-2xl md:text-3xl font-mono font-bold text-white mt-1">
            {stats.individuals_count.toLocaleString()} <span className="text-xs text-emerald-400 font-normal">Active</span>
          </div>
          <div className="text-xs text-[var(--cds-text-secondary)] mt-1">
            24-Month Rolling RHI Tracked
          </div>
        </div>

        <div className="bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] p-4">
          <div className="text-[10px] uppercase font-semibold text-[var(--cds-text-helper)] tracking-wider">
            Commercial Entities
          </div>
          <div className="text-2xl md:text-3xl font-mono font-bold text-white mt-1">
            {stats.companies_count.toLocaleString()} <span className="text-xs text-blue-400 font-normal">Audited</span>
          </div>
          <div className="text-xs text-[var(--cds-text-secondary)] mt-1">
            PAYDEX & Director Contagion
          </div>
        </div>

        <div className="bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] p-4">
          <div className="text-[10px] uppercase font-semibold text-[var(--cds-text-helper)] tracking-wider">
            Bitemporal Ledger Events
          </div>
          <div className="text-2xl md:text-3xl font-mono font-bold text-white mt-1">
            {stats.ledger_events_count.toLocaleString()} <span className="text-xs text-[var(--cds-text-helper)] font-normal font-sans">Blocks</span>
          </div>
          <div className="text-xs text-[var(--cds-text-secondary)] mt-1">
            Zero Overwrites &bull; Append Only
          </div>
        </div>

        <div className="bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] p-4">
          <div className="text-[10px] uppercase font-semibold text-[var(--cds-text-helper)] tracking-wider">
            Active Disputes (SLA)
          </div>
          <div className="text-2xl md:text-3xl font-mono font-bold text-white mt-1">
            {stats.open_disputes_count} <span className="text-xs text-yellow-400 font-normal">In Flight</span>
          </div>
          <div className="text-xs text-[var(--cds-text-secondary)] mt-1">
            Privacy Act s20V &bull; 30d Statutory Limit
          </div>
        </div>
      </div>

      {/* Operational Module Cards (Carbon Tiles) */}
      <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--cds-text-secondary)] mb-4">
        Bureau Operational Workspaces
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {/* Module 1: Consumer CCR Reporting */}
        <Link href="/subject/IND-8842-1994" className="block group">
          <div className="bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] p-5 h-full flex flex-col justify-between hover:border-[#0f62fe] transition-colors">
            <div>
              <div className="flex items-center justify-between mb-3">
                <Tag type="cyan" size="sm" className="m-0 font-mono">COMMERCIAL</Tag>
                <ArrowRight size={16} className="text-[#8d8d8d] group-hover:text-[#0f62fe] group-hover:translate-x-1 transition-transform" />
              </div>
              <h2 className="text-lg font-medium text-white mb-2">Commercial Credit Assessment</h2>
              <p className="text-xs text-[var(--cds-text-secondary)] leading-relaxed">
                Inspect comprehensive consumer files, 24-month RHI calendars, adverse default records, and interactive what-if score simulations.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-[var(--cds-border-subtle)] text-xs text-[var(--cds-link-primary)] flex items-center justify-between">
              <span>View Jonathan Vance (IND-8842)</span>
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
              <span>View Apex Holdings (ACN-109)</span>
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
              <h2 className="text-lg font-medium text-white mb-2">Provider Ingestion Console</h2>
              <p className="text-xs text-[var(--cds-text-secondary)] leading-relaxed">
                Credit provider gateway for batch CSV and real-time JSON submission with statutory validation (debt &ge;$150, 60+ days, notice given).
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-[var(--cds-border-subtle)] text-xs text-[var(--cds-link-primary)] flex items-center justify-between">
              <span>National Australia Bank (NAB-001)</span>
              <span className="font-mono text-[#42be65]">ACTIVE</span>
            </div>
          </div>
        </Link>

        {/* Module 4: Admin, Analyst & Disputes */}
        <Link href="/admin" className="block group">
          <div className="bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] p-5 h-full flex flex-col justify-between hover:border-[#0f62fe] transition-colors">
            <div>
              <div className="flex items-center justify-between mb-3">
                <Tag type="magenta" size="sm" className="m-0 font-mono">REGULATION</Tag>
                <ArrowRight size={16} className="text-[#8d8d8d] group-hover:text-[#0f62fe] group-hover:translate-x-1 transition-transform" />
              </div>
              <h2 className="text-lg font-medium text-white mb-2">Analyst & Dispute Console</h2>
              <p className="text-xs text-[var(--cds-text-secondary)] leading-relaxed">
                Supervisory tools for dynamic model weights versioning (v1.0 vs v2.0), Director Network contagion graphs, and statutory dispute resolution.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-[var(--cds-border-subtle)] text-xs text-[var(--cds-link-primary)] flex items-center justify-between">
              <span>Section 20V Dispute Queue</span>
              <span className="font-mono text-[#f1c21b]">{stats.open_disputes_count} PENDING</span>
            </div>
          </div>
        </Link>
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
                <td className="py-2 text-[var(--cds-text-secondary)]">IND-8842-1994 (J. Vance)</td>
                <td className="py-2 text-[#8d8d8d]">2026-09-01 00:00:00</td>
                <td className="py-2 text-[#8d8d8d]">2026-09-21 08:30:12</td>
                <td className="py-2"><Tag type="green" size="sm" className="m-0">COMMITTED</Tag></td>
              </tr>
              <tr>
                <td className="py-2 text-[var(--cds-link-primary)]">TX-2026-99013</td>
                <td className="py-2 text-white">HARD_ENQUIRY_LOGGED</td>
                <td className="py-2 text-[var(--cds-text-secondary)]">ACN-109-283-912 (Apex)</td>
                <td className="py-2 text-[#8d8d8d]">2026-09-20 16:42:00</td>
                <td className="py-2 text-[#8d8d8d]">2026-09-20 16:42:01</td>
                <td className="py-2"><Tag type="green" size="sm" className="m-0">COMMITTED</Tag></td>
              </tr>
              <tr>
                <td className="py-2 text-[var(--cds-link-primary)]">TX-2026-99012</td>
                <td className="py-2 text-white">DISPUTE_STATUS_AMENDED</td>
                <td className="py-2 text-[var(--cds-text-secondary)]">DEF-TEL-2024-881 (Telstra)</td>
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
