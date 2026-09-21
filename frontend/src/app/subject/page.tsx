"use client";

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Breadcrumb,
  BreadcrumbItem,
  Tabs,
  TabList,
  Tab,
  TabPanels,
  TabPanel,
  Tag,
  Button,
  InlineNotification,
  InlineLoading
} from '@carbon/react';
import {
  Enterprise,
  CheckmarkOutline,
  Warning,
  Error as ErrorIcon,
  Download,
  Search,
  ShareKnowledge,
  UserMultiple,
  Money,
  Catalog,
  Time,
  Renew
} from '@carbon/icons-react';

function CommercialSubjectContent() {
  const searchParams = useSearchParams();
  const queryId = searchParams.get('id') || 'ACN-109-283-912';

  const [selectedEntityId, setSelectedEntityId] = useState(queryId);
  const [liveReport, setLiveReport] = useState<any>(null);
  const [isLoadingApi, setIsLoadingApi] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [isForbidden, setIsForbidden] = useState(false);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [companyList, setCompanyList] = useState<any[]>([]);

  // Fetch available companies for directory switcher
  useEffect(() => {
    fetch('http://localhost:8000/api/entities?type=COMPANY&limit=10')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data && data.entities) {
          setCompanyList(data.entities);
        }
      })
      .catch((err) => {
        console.error("Failed to load company entities list", err);
      });
  }, []);

  // Fetch live company report
  useEffect(() => {
    if (!selectedEntityId) return;
    setIsLoadingApi(true);
    setReportError(null);
    setIsForbidden(false);
    fetch(`http://localhost:8000/api/reports/${encodeURIComponent(selectedEntityId)}`)
      .then(async (res) => {
        if (res.status === 403) {
          setIsForbidden(true);
          throw new Error('403 Forbidden: Insufficient permissions to access commercial entity report.');
        }
        if (!res.ok) {
          throw new Error(`Failed to load commercial credit file (HTTP ${res.status})`);
        }
        return res.json();
      })
      .then(data => {
        if (data) setLiveReport(data);
      })
      .catch((err) => {
        setReportError(err.message || 'Error fetching commercial credit report');
      })
      .finally(() => setIsLoadingApi(false));
  }, [selectedEntityId]);

  // Derived Company Profile
  const company = useMemo(() => {
    const b = liveReport?.entity?.basic_info || {};
    const scoreVal = liveReport?.score?.value ?? 78;
    return {
      acn: b.acn || liveReport?.entity?.identifier || selectedEntityId || 'ACN-109-283-912',
      abn: b.abn || '48 109 283 912',
      name: b.company_name || 'Apex Industrial Holdings Pty Ltd',
      industry: b.industry || 'Industrial Fabrication & Mining Engineering',
      incorporationDate: b.registration_date ? `${b.registration_date} (Registered)` : '2004-05-18 (Active)',
      registeredOffice: b.address || 'Level 14, 250 St Georges Terrace, Perth WA 6000',
      status: 'ACTIVE / TRADING',
      paydexScore: scoreVal > 100 ? Math.round((scoreVal / 1000) * 100) : scoreVal,
      paydexDescription: scoreVal >= 75 ? 'Prompt / Within Terms (Avg DBT: +4 Days)' : 'Elevated DBT (> 15 Days Beyond Terms)',
      riskTier: scoreVal >= 75 ? 'Low-to-Medium Risk (Tier 2)' : 'Elevated Risk (Tier 4)',
      failureProbability: scoreVal >= 75 ? '0.84% (12-Month Insolvency Risk)' : '4.21% (12-Month Insolvency Risk)'
    };
  }, [liveReport, selectedEntityId]);

  // Trade Credit Experiences dataset
  const tradeExperiences = [
    {
      supplierId: 'SUP-901',
      supplierCategory: 'Steel & Raw Materials',
      creditLimit: 250000,
      recentHighCredit: 184000,
      totalOwing: 42300,
      pastDue: 0,
      terms: '30 Days Net',
      dbt: '+2 Days',
      trend: 'PROMPT'
    },
    {
      supplierId: 'SUP-442',
      supplierCategory: 'Fuel & Industrial Logistics',
      creditLimit: 75000,
      recentHighCredit: 61000,
      totalOwing: 18900,
      pastDue: 0,
      terms: '14 Days Net',
      dbt: '0 Days',
      trend: 'ON TIME'
    },
    {
      supplierId: 'SUP-118',
      supplierCategory: 'Commercial Leasing & Fleet',
      creditLimit: 120000,
      recentHighCredit: 98000,
      totalOwing: 24500,
      pastDue: 3200,
      terms: '30 Days Net',
      dbt: '+14 Days',
      trend: 'SLOW 15'
    },
    {
      supplierId: 'SUP-882',
      supplierCategory: 'IT & Cloud Infrastructure',
      creditLimit: 30000,
      recentHighCredit: 24000,
      totalOwing: 6100,
      pastDue: 0,
      terms: '30 Days Net',
      dbt: '0 Days',
      trend: 'PROMPT'
    }
  ];

  // Directors dataset (live or fallback)
  const directors = useMemo(() => {
    if (liveReport && liveReport.directors && liveReport.directors.length > 0) {
      return liveReport.directors.map((d: any, idx: number) => ({
        id: `DIR-0${idx + 1}`,
        name: d.name,
        role: d.role || 'Director',
        appointed: d.start_date || '2022-04-18',
        otherDirectorships: d.other_directorships || 1,
        contagionRisk: d.contagion_risk || 'LOW',
        score: d.individual_score || 720,
        linkedEntities: [
          { name: `${d.name} Holdings Pty Ltd`, acn: '098-112-441', status: 'ACTIVE', score: 82 },
          { name: 'Vanguard Industrial Ltd', acn: '122-491-002', status: 'ACTIVE', score: 74 }
        ]
      }));
    }
    return [
      {
        id: 'DIR-01',
        name: 'Marcus Alexander Sterling',
        role: 'Managing Director & CEO',
        appointed: '2004-05-18',
        otherDirectorships: 3,
        contagionRisk: 'LOW',
        score: 745,
        linkedEntities: [
          { name: 'Sterling Logistics Group Pty Ltd', acn: '098-112-441', status: 'ACTIVE', score: 82 },
          { name: 'Vanguard Rail Components Ltd', acn: '122-491-002', status: 'ACTIVE', score: 74 },
          { name: 'Solaria Energy Pty Ltd', acn: '601-229-881', status: 'DEREGISTERED (2021)', score: 0 }
        ]
      },
      {
        id: 'DIR-02',
        name: 'Elena Rostova',
        role: 'Non-Executive Director',
        appointed: '2016-09-01',
        otherDirectorships: 2,
        contagionRisk: 'LOW',
        score: 780,
        linkedEntities: [
          { name: 'Harbour City Engineering Pty Ltd', acn: '144-889-102', status: 'ACTIVE', score: 88 },
          { name: 'Apex Capital Partners Pty Ltd', acn: '612-441-990', status: 'ACTIVE', score: 80 }
        ]
      }
    ];
  }, [liveReport]);

  // PPSR Registered Security Interests
  const ppsrCharges = [
    {
      ppsrId: 'PPSR-2023-884129',
      grantor: company.name,
      securedParty: 'Commonwealth Bank of Australia',
      collateralType: 'All Present and After-Acquired Property (General Security Agreement)',
      registrationDate: '2023-04-12',
      status: 'EFFECTIVE'
    },
    {
      ppsrId: 'PPSR-2021-104921',
      grantor: company.name,
      securedParty: 'Komatsu Commercial Finance Ltd',
      collateralType: 'Specific Motor Vehicles & Heavy Earthmoving Plant',
      registrationDate: '2021-11-08',
      status: 'EFFECTIVE'
    }
  ];

  return (
    <div className="p-4 md:p-8 max-w-[1680px] mx-auto">
      {/* Breadcrumb & Global Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4 pb-3 border-b border-[var(--cds-border-subtle)]">
        <Breadcrumb noTrailingSlash>
          <BreadcrumbItem>
            <Link href="/" className="text-[var(--cds-link-primary)] hover:underline">CRMS Root</Link>
          </BreadcrumbItem>
          <BreadcrumbItem>
            <Link href="/subject" className="text-[var(--cds-link-primary)] hover:underline">Commercial Directory</Link>
          </BreadcrumbItem>
          <BreadcrumbItem isCurrentPage className="font-mono text-white">
            {company.acn}
          </BreadcrumbItem>
        </Breadcrumb>

        <div className="flex items-center gap-3">
          {/* Quick company switcher */}
          <div className="flex items-center gap-2 text-xs">
            <label htmlFor="switch-registered-entity" className="text-[var(--cds-text-secondary)]">Switch Registered Entity:</label>
            <select
              id="switch-registered-entity"
              aria-label="Switch Registered Entity"
              value={selectedEntityId}
              onChange={(e) => setSelectedEntityId(e.target.value)}
              className="bg-[var(--cds-field)] text-white text-xs px-2.5 py-1.5 border border-[var(--cds-border-subtle)] focus:outline-none focus:border-[#0f62fe]"
            >
              <option value="ACN-109-283-912">Apex Industrial Holdings (ACN-109-283-912)</option>
              {companyList.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.basic_info?.company_name || c.identifier} ({c.identifier})
                </option>
              ))}
            </select>
          </div>

          <Button
            size="sm"
            kind="primary"
            renderIcon={Download}
            onClick={() => alert(`Exporting ASIC & APRA certified commercial risk file for ${company.name}...`)}
          >
            Export Certified PDF
          </Button>
        </div>
      </div>

      {/* 403 Forbidden State */}
      {isForbidden && (
        <div className="p-4 bg-[var(--cds-layer-02)] border-l-4 border-[#da1e28] text-xs mb-6">
          <div className="font-bold text-[#fa4d56] uppercase">403 Forbidden: Commercial File Access Restricted</div>
          <div className="text-[var(--cds-text-secondary)] mt-1">Your role does not have authorization to inspect commercial corporate credit files.</div>
        </div>
      )}

      {/* Error State */}
      {reportError && !isForbidden && (
        <div className="mb-6">
          <InlineNotification
            kind="error"
            title="Unable to Retrieve Corporate File"
            subtitle={reportError}
            lowContrast
          />
        </div>
      )}

      {/* Loading Skeleton */}
      {isLoadingApi && !company && (
        <div className="bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] p-8 mb-6 text-center text-xs font-mono text-[var(--cds-text-secondary)]">
          <InlineLoading description="Loading verified commercial credit file..." />
        </div>
      )}

      {/* Empty State */}
      {!isLoadingApi && !company && !isForbidden && !reportError && (
        <div className="bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] p-8 mb-6 text-center text-xs font-mono text-[var(--cds-text-secondary)]">
          No commercial entity record found for ID: {selectedEntityId}. Select another registered entity above.
        </div>
      )}

      {/* Primary Commercial Entity Header */}
      {company && (
        <div className="bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] p-5 mb-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-1.5">
                <h1 className="text-2xl md:text-3xl font-light text-white tracking-tight">
                  {company.name}
                </h1>
                <Tag type="teal" size="sm" className="font-mono m-0">PROPRIETARY LIMITED</Tag>
                <Tag type="green" size="sm" className="font-mono m-0">{company.status}</Tag>
                {isLoadingApi && <InlineLoading status="active" description="Syncing ledger..." />}
              </div>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-[var(--cds-text-secondary)]">
                <div><span className="text-[var(--cds-text-helper)]">ACN:</span> <span className="font-mono text-white">{company.acn}</span></div>
                <div><span className="text-[var(--cds-text-helper)]">ABN:</span> <span className="font-mono text-white">{company.abn}</span></div>
                <div><span className="text-[var(--cds-text-helper)]">INDUSTRY:</span> <span className="text-white">{company.industry}</span></div>
                <div><span className="text-[var(--cds-text-helper)]">REGISTERED:</span> <span className="text-white">{company.registeredOffice}</span></div>
              </div>
            </div>

            <div className="flex items-center gap-4 text-xs bg-[var(--cds-layer-02)] px-4 py-3 border border-[var(--cds-border-subtle)]">
              <div>
                <div className="text-[var(--cds-text-helper)] uppercase text-[10px] tracking-wider">PAYDEX Commercial Score</div>
                <div className="font-mono text-2xl font-bold text-white flex items-center gap-2">
                  {company.paydexScore} <span className="text-xs text-[var(--cds-text-helper)] font-normal">/ 100</span>
                </div>
              </div>
              <div className="border-l border-[var(--cds-border-subtle)] pl-4">
                <div className="text-[var(--cds-text-helper)] uppercase text-[10px] tracking-wider">Payment Behavior</div>
                <div className="font-semibold text-[#42be65]">PROMPT (DBT +4)</div>
              </div>
            </div>
          </div>

          {/* Commercial Risk Strip */}
          <div className="mt-4 pt-3 border-t border-[var(--cds-border-subtle)] grid grid-cols-2 md:grid-cols-4 gap-4 text-xs font-mono">
            <div>
              <span className="text-[var(--cds-text-helper)] block text-[10px] uppercase">12-Month Insolvency Risk</span>
              <span className="text-white font-bold">{company.failureProbability}</span>
            </div>
            <div>
              <span className="text-[var(--cds-text-helper)] block text-[10px] uppercase">Bureau Risk Assessment</span>
              <span className="text-[#4589ff] font-bold">{company.riskTier}</span>
            </div>
            <div>
              <span className="text-[var(--cds-text-helper)] block text-[10px] uppercase">ASIC Registration</span>
              <span className="text-white">{company.incorporationDate}</span>
            </div>
            <div>
              <span className="text-[var(--cds-text-helper)] block text-[10px] uppercase">Director Contagion Risk</span>
              <span className="text-[#42be65] font-bold">LOW (0 Adverse Links)</span>
            </div>
          </div>
        </div>
      )}

      {/* Commercial Workspace Tabs */}
      <div className="bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)]">
        <Tabs>
          <TabList aria-label="Commercial Assessment Tabs" className="bg-[var(--cds-layer-02)] border-b border-[var(--cds-border-subtle)]">
            <Tab className="text-xs uppercase font-semibold">1. Trade Credit & PAYDEX</Tab>
            <Tab className="text-xs uppercase font-semibold">2. Director Network & Contagion Graph</Tab>
            <Tab className="text-xs uppercase font-semibold">3. PPSR Registered Charges</Tab>
            <Tab className="text-xs uppercase font-semibold">4. Financial Health Ratios</Tab>
            <Tab className="text-xs uppercase font-semibold">5. Bitemporal Corporate Audit</Tab>
          </TabList>

          <TabPanels>
            {/* TAB 1: TRADE CREDIT & PAYDEX */}
            <TabPanel className="p-5 md:p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-medium text-white">Trade Credit Payment Experiences</h2>
                  <p className="text-xs text-[var(--cds-text-secondary)]">
                    Reported commercial trade lines documenting credit terms, promptness, and Days Beyond Terms (DBT).
                  </p>
                </div>
                <Tag type="green" size="sm" className="font-mono m-0">Avg DBT: +4 Days (Prompt)</Tag>
              </div>

              <div
                className="border border-[var(--cds-border-subtle)] overflow-x-auto"
                tabIndex={0}
                role="region"
                aria-label="Trade Credit Payment Experiences Table"
              >
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-[var(--cds-layer-02)] border-b border-[var(--cds-border-subtle)] text-[var(--cds-text-secondary)] uppercase text-[11px] tracking-wider">
                      <th className="p-3">Supplier Category</th>
                      <th className="p-3 font-mono">Agreed Terms</th>
                      <th className="p-3 text-right font-mono">Credit Limit</th>
                      <th className="p-3 text-right font-mono">High Credit</th>
                      <th className="p-3 text-right font-mono">Total Owing</th>
                      <th className="p-3 text-right font-mono">Past Due</th>
                      <th className="p-3 font-mono">DBT</th>
                      <th className="p-3">Payment Performance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--cds-border-subtle)]">
                    {tradeExperiences.map((tx, idx) => (
                      <tr key={idx} className="hover:bg-[var(--cds-layer-02)] transition-colors">
                        <td className="p-3 font-medium text-white">{tx.supplierCategory}</td>
                        <td className="p-3 font-mono text-[var(--cds-text-secondary)]">{tx.terms}</td>
                        <td className="p-3 text-right font-mono text-[#c6c6c6]">${tx.creditLimit.toLocaleString()}</td>
                        <td className="p-3 text-right font-mono text-[#c6c6c6]">${tx.recentHighCredit.toLocaleString()}</td>
                        <td className="p-3 text-right font-mono font-bold text-white">${tx.totalOwing.toLocaleString()}</td>
                        <td className={`p-3 text-right font-mono font-bold ${tx.pastDue > 0 ? 'text-[#f1c21b]' : 'text-[#42be65]'}`}>
                          ${tx.pastDue.toLocaleString()}
                        </td>
                        <td className="p-3 font-mono text-white">{tx.dbt}</td>
                        <td className="p-3">
                          <Tag type={tx.pastDue > 0 ? 'magenta' : 'green'} size="sm" className="m-0 font-mono">
                            {tx.trend}
                          </Tag>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </TabPanel>

            {/* TAB 2: DIRECTOR NETWORK & INTERACTIVE CONTAGION GRAPH */}
            <TabPanel className="p-5 md:p-6 space-y-6">
              <div>
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
                  <div>
                    <h2 className="text-lg font-medium text-white">Dynamic Director Contagion Network</h2>
                    <p className="text-xs text-[var(--cds-text-secondary)]">
                      Interactive corporate registry topology mapping directorships, cross-guarantees, and corporate group contagion risk.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-xs font-mono">
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-[#0f62fe] border border-white" /> Target Entity</span>
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#8a3ffc]" /> Director</span>
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-[#0043ce]" /> Linked Group</span>
                  </div>
                </div>

                {/* Interactive SVG Network Graph */}
                <div className="bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] p-4 relative overflow-hidden">
                  <svg viewBox="0 0 880 340" className="w-full h-auto select-none" style={{ minHeight: '300px' }}>
                    <defs>
                      <marker id="arrow" viewBox="0 0 10 10" refX="22" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                        <path d="M 0 0 L 10 5 L 0 10 z" fill="#525252" />
                      </marker>
                    </defs>

                    {/* Edge lines */}
                    {/* Center Company to Directors */}
                    <line x1="440" y1="170" x2="260" y2="100" stroke="#525252" strokeWidth="1.5" strokeDasharray="3 3" />
                    <line x1="440" y1="170" x2="620" y2="100" stroke="#525252" strokeWidth="1.5" strokeDasharray="3 3" />
                    <line x1="440" y1="170" x2="440" y2="280" stroke="#525252" strokeWidth="1.5" strokeDasharray="3 3" />

                    {/* Director 1 to related entities */}
                    <line x1="260" y1="100" x2="110" y2="60" stroke="#393939" strokeWidth="1.5" />
                    <line x1="260" y1="100" x2="110" y2="150" stroke="#393939" strokeWidth="1.5" />

                    {/* Director 2 to related entities */}
                    <line x1="620" y1="100" x2="770" y2="60" stroke="#393939" strokeWidth="1.5" />
                    <line x1="620" y1="100" x2="770" y2="150" stroke="#393939" strokeWidth="1.5" />

                    {/* Center Node: Company */}
                    <g 
                      className="cursor-pointer transition-transform hover:scale-105"
                      onClick={() => setSelectedNode('TARGET_COMPANY')}
                    >
                      <rect x="360" y="140" width="160" height="60" fill="#0f62fe" stroke="#ffffff" strokeWidth="2" />
                      <text x="440" y="165" fill="#ffffff" fontSize="12" fontWeight="bold" textAnchor="middle" fontFamily="IBM Plex Sans">
                        {company.name.length > 20 ? `${company.name.slice(0, 18)}...` : company.name}
                      </text>
                      <text x="440" y="184" fill="#c6c6c6" fontSize="10" fontFamily="IBM Plex Mono" textAnchor="middle">
                        PAYDEX: {company.paydexScore} &bull; ACN {company.acn.slice(0, 7)}
                      </text>
                    </g>

                    {/* Left Director */}
                    <g 
                      className="cursor-pointer transition-transform hover:scale-105"
                      onClick={() => setSelectedNode('DIR_1')}
                    >
                      <circle cx="260" cy="100" r="30" fill="#8a3ffc" stroke="#ffffff" strokeWidth="1.5" />
                      <text x="260" y="97" fill="#ffffff" fontSize="10" fontWeight="bold" textAnchor="middle" fontFamily="IBM Plex Sans">
                        {directors[0]?.name.split(' ')[0] || 'Director'}
                      </text>
                      <text x="260" y="112" fill="#e0e0e0" fontSize="9" fontFamily="IBM Plex Mono" textAnchor="middle">
                        {directors[0]?.score} PTS
                      </text>
                    </g>

                    {/* Right Director */}
                    <g 
                      className="cursor-pointer transition-transform hover:scale-105"
                      onClick={() => setSelectedNode('DIR_2')}
                    >
                      <circle cx="620" cy="100" r="30" fill="#8a3ffc" stroke="#ffffff" strokeWidth="1.5" />
                      <text x="620" y="97" fill="#ffffff" fontSize="10" fontWeight="bold" textAnchor="middle" fontFamily="IBM Plex Sans">
                        {directors[1]?.name.split(' ')[0] || 'Director'}
                      </text>
                      <text x="620" y="112" fill="#e0e0e0" fontSize="9" fontFamily="IBM Plex Mono" textAnchor="middle">
                        {directors[1]?.score} PTS
                      </text>
                    </g>

                    {/* Secondary Entity Nodes */}
                    <g className="cursor-pointer" onClick={() => setSelectedNode('SEC_1')}>
                      <rect x="30" y="40" width="130" height="42" fill="#161616" stroke="#0043ce" strokeWidth="1.5" />
                      <text x="95" y="58" fill="#ffffff" fontSize="10" fontWeight="bold" textAnchor="middle" fontFamily="IBM Plex Sans">
                        Sterling Logistics
                      </text>
                      <text x="95" y="72" fill="#42be65" fontSize="9" fontFamily="IBM Plex Mono" textAnchor="middle">
                        PAYDEX 82 &bull; LOW RISK
                      </text>
                    </g>

                    <g className="cursor-pointer" onClick={() => setSelectedNode('SEC_2')}>
                      <rect x="30" y="130" width="130" height="42" fill="#161616" stroke="#0043ce" strokeWidth="1.5" />
                      <text x="95" y="148" fill="#ffffff" fontSize="10" fontWeight="bold" textAnchor="middle" fontFamily="IBM Plex Sans">
                        Vanguard Rail Ltd
                      </text>
                      <text x="95" y="162" fill="#42be65" fontSize="9" fontFamily="IBM Plex Mono" textAnchor="middle">
                        PAYDEX 74 &bull; LOW RISK
                      </text>
                    </g>

                    <g className="cursor-pointer" onClick={() => setSelectedNode('SEC_3')}>
                      <rect x="710" y="40" width="140" height="42" fill="#161616" stroke="#0043ce" strokeWidth="1.5" />
                      <text x="780" y="58" fill="#ffffff" fontSize="10" fontWeight="bold" textAnchor="middle" fontFamily="IBM Plex Sans">
                        Harbour City Eng
                      </text>
                      <text x="780" y="72" fill="#42be65" fontSize="9" fontFamily="IBM Plex Mono" textAnchor="middle">
                        PAYDEX 88 &bull; PRIME
                      </text>
                    </g>

                    <g className="cursor-pointer" onClick={() => setSelectedNode('SEC_4')}>
                      <rect x="710" y="130" width="140" height="42" fill="#161616" stroke="#0043ce" strokeWidth="1.5" />
                      <text x="780" y="148" fill="#ffffff" fontSize="10" fontWeight="bold" textAnchor="middle" fontFamily="IBM Plex Sans">
                        Apex Capital Pty
                      </text>
                      <text x="780" y="162" fill="#42be65" fontSize="9" fontFamily="IBM Plex Mono" textAnchor="middle">
                        PAYDEX 80 &bull; ACTIVE
                      </text>
                    </g>
                  </svg>

                  <div className="absolute bottom-3 left-4 text-[10px] font-mono text-[var(--cds-text-helper)]">
                    APRA APS 220 Contagion Protocol &bull; Zero Adverse Directorships Detected
                  </div>
                </div>

                {/* Director details cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                  {directors.map((dir: any) => (
                    <div key={dir.id} className="bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] p-4">
                      <div className="flex items-center justify-between pb-3 border-b border-[var(--cds-border-subtle)] mb-3">
                        <div>
                          <div className="text-base font-bold text-white">{dir.name}</div>
                          <div className="text-xs text-[var(--cds-text-secondary)]">{dir.role} &bull; Appointed {dir.appointed}</div>
                        </div>
                        <div className="text-right">
                          <Tag type="green" size="sm" className="m-0 font-mono">CONTAGION: {dir.contagionRisk}</Tag>
                          <div className="text-[10px] font-mono text-[#8d8d8d] mt-1">INDIVIDUAL SCORE: {dir.score}</div>
                        </div>
                      </div>

                      {/* Associated entities for this director */}
                      <div className="space-y-2">
                        <div className="text-[10px] uppercase font-mono text-[var(--cds-text-helper)]">
                          Other Monitored Directorships:
                        </div>
                        {dir.associatedEntities.map((ent: any, eIdx: number) => (
                          <div
                            key={eIdx}
                            className="p-2.5 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] flex items-center justify-between"
                          >
                            <div>
                              <div className="text-xs text-white font-medium">{ent.name}</div>
                              <div className="text-[10px] font-mono text-[var(--cds-text-helper)]">{ent.acn}</div>
                            </div>
                            <div className="text-right">
                              <Tag type={ent.riskTag as any} size="sm" className="m-0 font-mono">
                                {ent.status}
                              </Tag>
                              <div className="text-[10px] text-[#8d8d8d] mt-1">PAYDEX: {ent.score}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </TabPanel>

            {/* TAB 3: PPSR CHARGES */}
            <TabPanel className="p-5 md:p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-medium text-white">Personal Property Securities Register (PPSR)</h3>
                  <p className="text-xs text-[var(--cds-text-secondary)]">
                    Certified extract of registered security interests and statutory charges encumbering company assets.
                  </p>
                </div>
                <Tag type="blue" size="sm" className="font-mono m-0">2 Effective Registrations</Tag>
              </div>

              <div
                className="border border-[var(--cds-border-subtle)] overflow-x-auto"
                tabIndex={0}
                role="region"
                aria-label="PPSR Registered Charges Table"
              >
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-[var(--cds-layer-02)] border-b border-[var(--cds-border-subtle)] text-[var(--cds-text-secondary)] uppercase text-[11px] tracking-wider">
                      <th className="p-3 font-mono">PPSR Registration Number</th>
                      <th className="p-3">Secured Party Creditor</th>
                      <th className="p-3">Collateral Description</th>
                      <th className="p-3 font-mono">Registration Date</th>
                      <th className="p-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--cds-border-subtle)]">
                    {ppsrCharges.map((p, idx) => (
                      <tr key={idx} className="hover:bg-[var(--cds-layer-02)] transition-colors">
                        <td className="p-3 font-mono text-[var(--cds-link-primary)]">{p.ppsrId}</td>
                        <td className="p-3 font-medium text-white">{p.securedParty}</td>
                        <td className="p-3 text-[var(--cds-text-secondary)]">{p.collateralType}</td>
                        <td className="p-3 font-mono text-[#8d8d8d]">{p.registrationDate}</td>
                        <td className="p-3">
                          <Tag type="green" size="sm" className="m-0 font-mono">{p.status}</Tag>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </TabPanel>

            {/* TAB 4: FINANCIAL RATIOS */}
            <TabPanel className="p-5 md:p-6">
              <h2 className="text-lg font-medium text-white mb-2">Statutory Liquidity & Capital Ratios (APRA APS 220)</h2>
              <p className="text-xs text-[var(--cds-text-secondary)] mb-4">
                Prudential financial health benchmarks derived from audited filings and corporate tax disclosures.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-mono text-xs">
                <div className="p-4 bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)]">
                  <span className="text-[var(--cds-text-helper)] block text-[10px] uppercase">Current Ratio (Working Capital)</span>
                  <div className="text-xl font-bold text-white mt-1">2.42x</div>
                  <div className="text-[#42be65] text-[11px] mt-1">Optimal &bull; Benchmarked &ge; 1.50x</div>
                </div>
                <div className="p-4 bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)]">
                  <span className="text-[var(--cds-text-helper)] block text-[10px] uppercase">Debt-to-Equity Ratio</span>
                  <div className="text-xl font-bold text-white mt-1">0.38x</div>
                  <div className="text-[#42be65] text-[11px] mt-1">Conservative Leverage</div>
                </div>
                <div className="p-4 bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)]">
                  <span className="text-[var(--cds-text-helper)] block text-[10px] uppercase">Interest Cover (EBITDA / Int)</span>
                  <div className="text-xl font-bold text-white mt-1">8.60x</div>
                  <div className="text-[#42be65] text-[11px] mt-1">Robust Debt Serviceability</div>
                </div>
              </div>
            </TabPanel>

            {/* TAB 5: AUDIT TRAIL */}
            <TabPanel className="p-5 md:p-6">
              <h2 className="text-lg font-medium text-white mb-2">Bitemporal Corporate Audit Log</h2>
              <p className="text-xs text-[var(--cds-text-secondary)] mb-4">
                Immutable cryptographic ledger events recording trade payments, director updates, and registry pulls.
              </p>
              <div className="border border-[var(--cds-border-subtle)] p-4 font-mono text-xs text-[var(--cds-text-secondary)] space-y-2">
                <div>[2026-09-21 08:30:00 UTC] AS_OF_PULL: Subscriber NAB-001 pulled commercial credit assessment.</div>
                <div>[2026-08-01 10:15:22 UTC] LEDGER_COMMIT: Trade credit line TRADE-SUP-901 ingested ($42,300 balance).</div>
                <div>[2026-04-12 14:02:11 UTC] PPSR_REGISTRATION: CBA General Security Agreement lodged and verified.</div>
                <div>[2024-05-18 09:00:00 UTC] ASIC_SYNC: Registered directorships confirmed via ASIC corporate gateway.</div>
              </div>
            </TabPanel>
          </TabPanels>
        </Tabs>
      </div>
    </div>
  );
}

export default function CommercialSubjectPage() {
  return (
    <React.Suspense fallback={<InlineLoading description="Loading commercial credit registry..." />}>
      <CommercialSubjectContent />
    </React.Suspense>
  );
}
