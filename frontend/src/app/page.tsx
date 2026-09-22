/**
 * National Credit Registry & Intelligence Platform Landing Dashboard.
 *
 * Serves as the primary operational entry point for the Credit Reporting Mechanism (CRMS),
 * displaying platform health telemetry, high-level portfolio metrics, live bitemporal
 * audit ledger event streams, and direct file lookup capabilities across individual and
 * commercial corporate registers under the Nepal regulatory framework.
 *
 * Architecture:
 *   Frontend Presentation Layer (Root Dashboard Route).
 *   Integrated with next-intl reactive localization (en / ne) and Carbon Design System components.
 *
 * Legal / Regulatory:
 *   Nepal Individual Privacy Act 2018 (वैयक्तिक गोपनीयता सम्बन्धी ऐन, २०७५) and
 *   Nepal Rastra Bank (NRB) Credit Information Directives.
 */

"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Tag, Button } from '@carbon/react';
import { ArrowRight, Time, Search } from '@carbon/icons-react';
import { API_BASE } from '@/lib/api';
import { useLocaleContext, useTranslations } from '@/lib/i18n';
import { formatNumber, formatDualDate } from '@/lib/nepaliDate';

export default function Home() {
  const router = useRouter();
  const { locale } = useLocaleContext();
  const { t } = useTranslations('home');
  const { t: tNav } = useTranslations('nav');

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [stats, setStats] = useState({
    individuals_count: 508,
    companies_count: 100,
    total_entities: 608,
    ledger_events_count: 547,
    open_disputes_count: 5,
    reporting_window: "2026/2083 CYCLE OPEN",
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

    if (q.toUpperCase().startsWith('PAN') || q.toUpperCase().startsWith('VAT') || q.toUpperCase().startsWith('OCR')) {
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
          {t('title', 'National Credit Registry & Scoring Mechanism')}
        </h1>
        <p className="text-xs text-[#999999] mt-1">
          {t('subtitle', 'Centralised credit reporting infrastructure under the Nepal Individual Privacy Act 2018 and Nepal Rastra Bank Directives.')}
        </p>
      </div>

      {/* Direct File Lookup */}
      <div className="bg-[#141417] border border-[#202026] p-4 rounded-[2px]">
        <div className="text-xs font-semibold text-[#999999] uppercase tracking-wider mb-2">
          {t('searchBtn', 'Search Directory')}
        </div>
        <form onSubmit={handleOpenSearch} className="flex gap-2 relative">
          <label htmlFor="direct-file-lookup-input" className="sr-only">
            {t('searchPlaceholder', 'Search by Citizenship No (नागरिकता नं.), National ID (NID), or PAN...')}
          </label>
          <input
            id="direct-file-lookup-input"
            aria-label={t('searchPlaceholder', 'Search by Citizenship No (नागरिकता नं.), National ID (NID), or PAN...')}
            type="text"
            placeholder={t('searchPlaceholder', 'Search by Citizenship No (नागरिकता नं.), National ID (NID), or PAN...')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 bg-[#0b0b0d] text-[#e6e6e6] text-xs px-3 py-2 border border-[#202026] focus:border-[#0f62fe] focus:outline-none rounded-[2px]"
          />
          <Button size="sm" kind="primary" renderIcon={ArrowRight} type="submit">
            {t('viewReport', 'Inspect File')}
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
                      {ent.score?.value ? `${formatNumber(ent.score.value, locale)} PTS` : 'ACTIVE'}
                    </Tag>
                  </Link>
                );
              })}
            </div>
          )}
        </form>
      </div>

      {/* Featured Benchmark Profiles */}
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-[#999999] mb-3">
          {t('featuredProfiles', 'Featured Benchmark Profiles')}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Link href="/subject/CIT-27-01-78-04821" className="block group">
            <div className="bg-[#141417] border border-[#202026] p-4 h-full flex flex-col justify-between hover:border-[#0f62fe] transition-colors rounded-[2px]">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Tag type="blue" size="sm" className="m-0 font-mono">CONSUMER (कन्जुमर)</Tag>
                  <ArrowRight size={16} className="text-[#8d8d8d] group-hover:text-[#0f62fe] group-hover:translate-x-1 transition-transform" />
                </div>
                <h3 className="text-base font-medium text-white mb-1">
                  {t('consumerProfile', 'Consumer File: Ram Kumar Shrestha')}
                </h3>
                <p className="text-xs text-[#999999] leading-relaxed">
                  {t('consumerDesc', 'Kathmandu individual file featuring NEA electricity, telecom, Nabil Bank home loan, tax compliance, and Section 12 dispute.')}
                </p>
              </div>
              <div className="mt-3 pt-2 border-t border-[#202026] text-xs text-[#0f62fe] flex items-center justify-between">
                <span>{t('viewReport', 'Inspect File')}</span>
                <span className="font-mono font-semibold">९६४ / 964 PTS</span>
              </div>
            </div>
          </Link>

          <Link href="/subject" className="block group">
            <div className="bg-[#141417] border border-[#202026] p-4 h-full flex flex-col justify-between hover:border-[#0f62fe] transition-colors rounded-[2px]">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Tag type="teal" size="sm" className="m-0 font-mono">COMMERCIAL (कमर्सियल)</Tag>
                  <ArrowRight size={16} className="text-[#8d8d8d] group-hover:text-[#0f62fe] group-hover:translate-x-1 transition-transform" />
                </div>
                <h3 className="text-base font-medium text-white mb-1">
                  {t('commercialProfile', 'Commercial File: Apex Engineering Pvt. Ltd.')}
                </h3>
                <p className="text-xs text-[#999999] leading-relaxed">
                  {t('commercialDesc', 'Lalitpur infrastructure contractor featuring PAN/VAT compliance, OCR registration, trade payments, and director linkage.')}
                </p>
              </div>
              <div className="mt-3 pt-2 border-t border-[#202026] text-xs text-[#0f62fe] flex items-center justify-between">
                <span>{t('viewReport', 'Inspect File')}</span>
                <span className="font-mono font-semibold">८२ / 82 PROMPT</span>
              </div>
            </div>
          </Link>
        </div>
      </div>

      {/* Operational Workspaces */}
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-[#999999] mb-3">
          {t('bureauMetrics', 'National Bureau Metrics')}
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {/* Module 1: Consumer CCR Reporting */}
          <Link href="/subject/CIT-27-01-78-04821" className="block group">
            <div className="bg-[#141417] border border-[#202026] p-4 h-full flex flex-col justify-between hover:border-[#0f62fe] transition-colors rounded-[2px]">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <Tag type="cyan" size="sm" className="m-0 font-mono">{tNav('consumer', 'Consumer')}</Tag>
                  <ArrowRight size={16} className="text-[#8d8d8d] group-hover:text-[#0f62fe] group-hover:translate-x-1 transition-transform" />
                </div>
                <h3 className="text-sm font-medium text-white mb-2">
                  {locale === 'ne' ? '५-स्तम्भ व्यक्तिगत मूल्याङ्कन' : '5-Pillar Consumer Assessment'}
                </h3>
                <p className="text-xs text-[#999999] leading-relaxed">
                  {locale === 'ne'
                    ? 'महशुल (३५%), कालोसूची (२५%), आम्दानी (२०%), कर चुक्ता (१२%), र घरबहाल (८%) सहितको पूर्ण व्यक्तिगत विवरण।'
                    : 'Inspect comprehensive files across utility (35%), blacklist (25%), income (20%), tax (12%), and rental (8%) pillars.'}
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-[#202026] text-xs text-[#0f62fe] flex items-center justify-between">
                <span>{t('viewReport', 'Inspect File')}</span>
                <span className="font-mono">CIT-27-01</span>
              </div>
            </div>
          </Link>

          {/* Module 2: Commercial Intelligence */}
          <Link href="/subject" className="block group">
            <div className="bg-[#141417] border border-[#202026] p-4 h-full flex flex-col justify-between hover:border-[#0f62fe] transition-colors rounded-[2px]">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <Tag type="teal" size="sm" className="m-0 font-mono">{tNav('commercial', 'Commercial')}</Tag>
                  <ArrowRight size={16} className="text-[#8d8d8d] group-hover:text-[#0f62fe] group-hover:translate-x-1 transition-transform" />
                </div>
                <h3 className="text-sm font-medium text-white mb-2">
                  {locale === 'ne' ? 'संस्थागत साख तथा सञ्चालक सञ्जाल' : 'Corporate Standing & Director Network'}
                </h3>
                <p className="text-xs text-[#999999] leading-relaxed">
                  {locale === 'ne'
                    ? 'स्थायी लेखा नम्बर (PAN), भ्याट, कम्पनी रजिस्ट्रार दर्ता र सञ्चालक सङ्क्रमण जोखिमको एकीकृत विश्लेषण।'
                    : 'Corporate intelligence featuring PAN, VAT, OCR company registration, trade payment promptness, and director networks.'}
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-[#202026] text-xs text-[#0f62fe] flex items-center justify-between">
                <span>{t('viewReport', 'Inspect File')}</span>
                <span className="font-mono">PAN-601283</span>
              </div>
            </div>
          </Link>

          {/* Module 3: Provider Ingestion */}
          <Link href="/provider" className="block group">
            <div className="bg-[#141417] border border-[#202026] p-4 h-full flex flex-col justify-between hover:border-[#0f62fe] transition-colors rounded-[2px]">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <Tag type="purple" size="sm" className="m-0 font-mono">{tNav('ingestion', 'Ingestion')}</Tag>
                  <ArrowRight size={16} className="text-[#8d8d8d] group-hover:text-[#0f62fe] group-hover:translate-x-1 transition-transform" />
                </div>
                <h3 className="text-sm font-medium text-white mb-2">
                  {locale === 'ne' ? 'क/ख/ग/घ बैंक तथा उपयोगिता प्रविष्टि' : 'BFI & Utility Ingestion Gateway'}
                </h3>
                <p className="text-xs text-[#999999] leading-relaxed">
                  {locale === 'ne'
                    ? 'नेपाल राष्ट्र बैंक नियमन बैंकहरू तथा विद्युत् (NEA), खानेपानी र दूरसञ्चार निकायहरूका लागि सुरक्षित प्रविष्टि।'
                    : 'Gateway for licensed BFIs and public utilities (NEA, KUKL, NTC, Ncell) with cryptographic verification.'}
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-[#202026] text-xs text-[#0f62fe] flex items-center justify-between">
                <span>{locale === 'ne' ? 'प्रविष्टि कन्सोल' : 'Ingestion Gateway'}</span>
                <span className="font-mono text-[#24a148]">ONLINE</span>
              </div>
            </div>
          </Link>

          {/* Module 4: Analyst Workspace */}
          <Link href="/analyst" className="block group">
            <div className="bg-[#141417] border border-[#202026] p-4 h-full flex flex-col justify-between hover:border-[#0f62fe] transition-colors rounded-[2px]">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <Tag type="blue" size="sm" className="m-0 font-mono">{tNav('analyst', 'Analyst')}</Tag>
                  <ArrowRight size={16} className="text-[#8d8d8d] group-hover:text-[#0f62fe] group-hover:translate-x-1 transition-transform" />
                </div>
                <h3 className="text-sm font-medium text-white mb-2">
                  {locale === 'ne' ? 'दफा १२ उजुरी फछ्र्यौट कार्यकक्ष' : 'Section 12 Dispute Workspace'}
                </h3>
                <p className="text-xs text-[#999999] leading-relaxed">
                  {locale === 'ne'
                    ? 'वैयक्तिक गोपनीयता ऐन २०७५ को दफा १२ बमोजिम उजुरी अनुसन्धान, बाइटेम्पोरल परीक्षण तथा कानुनी किनारा।'
                    : 'Statutory Section 12 dispute reviews, bitemporal point-in-time reconstruction, and NRB SLA tracking.'}
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-[#202026] text-xs text-[#0f62fe] flex items-center justify-between">
                <span>{locale === 'ne' ? 'विश्लेषक कन्सोल' : 'Launch Console'}</span>
                <span className="font-mono text-[#0f62fe]">INVESTIGATE</span>
              </div>
            </div>
          </Link>

          {/* Module 5: Governance & Auditing */}
          <Link href="/admin" className="block group">
            <div className="bg-[#141417] border border-[#202026] p-4 h-full flex flex-col justify-between hover:border-[#0f62fe] transition-colors rounded-[2px]">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <Tag type="magenta" size="sm" className="m-0 font-mono">{tNav('governance', 'Governance')}</Tag>
                  <ArrowRight size={16} className="text-[#8d8d8d] group-hover:text-[#0f62fe] group-hover:translate-x-1 transition-transform" />
                </div>
                <h3 className="text-sm font-medium text-white mb-2">
                  {locale === 'ne' ? 'केन्द्रीय सुशासन तथा मोडल क्यालिब्रेसन' : 'Governance & Model Calibration'}
                </h3>
                <p className="text-xs text-[#999999] leading-relaxed">
                  {locale === 'ne'
                    ? '५ आधार स्तम्भहरूको १००% भार निर्धारण, अपरिवर्तनीय अडिट लग र मोडल सक्रियता व्यवस्थापन।'
                    : 'Calibrate statutory 5-pillar weights (sum 100%), inspect immutable bureau audit trails, and manage governance.'}
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-[#202026] text-xs text-[#0f62fe] flex items-center justify-between">
                <span>{locale === 'ne' ? 'सुशासन' : 'Governance'}</span>
                <span className="font-mono text-[#f1c21b]">{formatNumber(stats.open_disputes_count, locale)} PENDING</span>
              </div>
            </div>
          </Link>
        </div>
      </div>

      {/* Live Immutable Bitemporal Ledger Ticker */}
      <div className="bg-[#141417] border border-[#202026] p-4 rounded-[2px]">
        <div className="flex items-center justify-between mb-3 pb-2 border-b border-[#202026] text-xs">
          <div className="flex items-center gap-2 text-white font-semibold uppercase tracking-wider">
            <Time size={14} className="text-[#0f62fe]" />
            {t('recentLedgerEvents', 'Live Credit Ledger Transactions')}
          </div>
          <span className="font-mono text-[11px] text-[#777777]">
            {t('bitemporalNotice', 'Immutable bitemporal cryptographic ledger logging every submission and score factor.')}
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
              <tr className="text-[#999999] text-[10px] uppercase border-b border-[#202026]">
                <th className="pb-2">Tx ID</th>
                <th className="pb-2">{locale === 'ne' ? 'कार्य विवरण' : 'Event Action'}</th>
                <th className="pb-2">{locale === 'ne' ? 'सम्बन्धित पक्ष' : 'Target Entity'}</th>
                <th className="pb-2">{locale === 'ne' ? 'कारोबार मिति (वि.सं. / A.D.)' : 'Valid Time (B.S. / A.D.)'}</th>
                <th className="pb-2">{locale === 'ne' ? 'प्रविष्टि मिति' : 'Committed Time'}</th>
                <th className="pb-2">{locale === 'ne' ? 'स्थिति' : 'Status'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#202026]">
              <tr>
                <td className="py-2 text-[#0f62fe]">TX-NP-2083-99014</td>
                <td className="py-2 text-white">NEA_UTILITY_PAYMENT_COMMITTED</td>
                <td className="py-2 text-[#999999]">CIT-27-01-78-04821 (Ram Kumar Shrestha)</td>
                <td className="py-2 text-[#8d8d8d]">{formatDualDate('2026-09-01', locale)}</td>
                <td className="py-2 text-[#8d8d8d]">2026-09-21 08:30:12</td>
                <td className="py-2"><Tag type="green" size="sm" className="m-0">COMMITTED</Tag></td>
              </tr>
              <tr>
                <td className="py-2 text-[#0f62fe]">TX-NP-2083-99013</td>
                <td className="py-2 text-white">NABIL_HOUSING_LOAN_RHI_BATCH</td>
                <td className="py-2 text-[#999999]">CIT-27-01-78-04821 (Ram Kumar Shrestha)</td>
                <td className="py-2 text-[#8d8d8d]">{formatDualDate('2026-08-30', locale)}</td>
                <td className="py-2 text-[#8d8d8d]">2026-09-20 16:42:01</td>
                <td className="py-2"><Tag type="green" size="sm" className="m-0">COMMITTED</Tag></td>
              </tr>
              <tr>
                <td className="py-2 text-[#0f62fe]">TX-NP-2083-99012</td>
                <td className="py-2 text-white">TRADE_CREDIT_HIMSTEEL_INVOICE</td>
                <td className="py-2 text-[#999999]">PAN-601283912 (Apex Engineering Pvt. Ltd.)</td>
                <td className="py-2 text-[#8d8d8d]">{formatDualDate('2026-08-01', locale)}</td>
                <td className="py-2 text-[#8d8d8d]">2026-08-02 11:20:45</td>
                <td className="py-2"><Tag type="green" size="sm" className="m-0">COMMITTED</Tag></td>
              </tr>
              <tr>
                <td className="py-2 text-[#0f62fe]">TX-NP-2083-99011</td>
                <td className="py-2 text-white">SECTION_12_DISPUTE_LODGED</td>
                <td className="py-2 text-[#999999]">DEF-KUKL-2024-881 (KUKL Water Utility)</td>
                <td className="py-2 text-[#8d8d8d]">{formatDualDate('2026-02-10', locale)}</td>
                <td className="py-2 text-[#8d8d8d]">2026-02-11 14:15:00</td>
                <td className="py-2"><Tag type="purple" size="sm" className="m-0">DISPUTED (दफा १२)</Tag></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
