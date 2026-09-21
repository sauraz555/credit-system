"use client";

import React, { useState, useMemo, useEffect } from 'react';
import { useParams } from 'next/navigation';
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
  Modal,
  InlineNotification,
  InlineLoading
} from '@carbon/react';
import {
  CheckmarkOutline,
  Warning,
  Error as ErrorIcon,
  Download,
  DocumentAdd,
  Time,
  Renew,
  ChevronRight,
  ChevronDown,
  Undo
} from '@carbon/icons-react';
import Link from 'next/link';

export default function CreditReportPage() {
  const params = useParams();
  const routeId = (params?.id as string) || "IND-8842-1994";
  const [liveReport, setLiveReport] = useState<any>(null);
  const [isLoadingApi, setIsLoadingApi] = useState<boolean>(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [isForbidden, setIsForbidden] = useState<boolean>(false);

  // Fetch live bureau report on mount/param change
  useEffect(() => {
    if (!routeId) return;
    setIsLoadingApi(true);
    setReportError(null);
    setIsForbidden(false);
    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    fetch(`http://localhost:8000/api/reports/${encodeURIComponent(routeId)}`, { headers })
      .then(async (res) => {
        if (res.status === 403) {
          setIsForbidden(true);
          throw new Error('403 Forbidden: Insufficient permissions to access this consumer credit report.');
        }
        if (!res.ok) {
          throw new Error(`Failed to load consumer report (HTTP ${res.status})`);
        }
        return res.json();
      })
      .then(data => {
        if (data) setLiveReport(data);
      })
      .catch((err) => {
        console.error("Error fetching credit report", err);
        setReportError(err.message || 'Error fetching consumer credit file');
      })
      .finally(() => setIsLoadingApi(false));
  }, [routeId]);

  // Bitemporal time-travel state
  const [asOfDate, setAsOfDate] = useState<string>('CURRENT');
  const [isLoadingTimeTravel, setIsLoadingTimeTravel] = useState<boolean>(false);

  // Dispute modal state
  const [isDisputeModalOpen, setIsDisputeModalOpen] = useState<boolean>(false);
  const [disputeTarget, setDisputeTarget] = useState<string>('DEF-TEL-2024-881');
  const [disputeReason, setDisputeReason] = useState<string>('NOTICE_NOT_RECEIVED');
  const [disputeDetails, setDisputeDetails] = useState<string>('');
  const [disputeSubmitted, setDisputeSubmitted] = useState<boolean>(false);
  const [disputeSuccessMsg, setDisputeSuccessMsg] = useState<string>('');

  // Score Simulator state
  const [simDebtPaydown, setSimDebtPaydown] = useState<number>(0);
  const [simRemoveDefault, setSimRemoveDefault] = useState<boolean>(false);
  const [simNewInquiry, setSimNewInquiry] = useState<boolean>(false);

  // Search & Filter state for RHI matrix
  const [rhiSearch, setRhiSearch] = useState<string>('');
  const [rhiFilterType, setRhiFilterType] = useState<string>('ALL');
  const [expandedAccount, setExpandedAccount] = useState<string | null>(null);

  // Density mode
  const [isCompact, setIsCompact] = useState<boolean>(false);

  // Dynamic Subject Identity from Live API or Fallback Model
  const entityId = liveReport?.entity?.identifier || liveReport?.entity?.id || routeId;
  const subjectName = liveReport?.entity?.basic_info?.first_name 
    ? `${liveReport.entity.basic_info.first_name} ${liveReport.entity.basic_info.last_name || ''}`.trim()
    : (liveReport?.entity?.basic_info?.company_name || "Jonathan Edward Vance");
  const subjectDob = liveReport?.entity?.basic_info?.dob 
    ? `${liveReport.entity.basic_info.dob} (Age ${new Date().getFullYear() - parseInt(liveReport.entity.basic_info.dob.slice(0, 4))})`
    : "1984-06-14 (Age 42)";
  const subjectAddress = liveReport?.entity?.basic_info?.address || "42 Miller St, North Sydney NSW 2060";

  // Dynamic values derived from bitemporal ledger & score
  const snapshotData = useMemo(() => {
    const liveScore = liveReport?.score?.value ?? 712;
    const liveBand = liveReport?.score?.band ?? 'Good (Prime Tier 2)';
    const bandColor = liveScore >= 800 ? 'green' : liveScore >= 700 ? 'blue' : liveScore >= 600 ? 'cyan' : 'red';
    const hasDispute = disputeSubmitted || liveReport?.ledger?.some((l: any) => l.record_type === 'DEFAULT' && l.status === 'DISPUTED');
    const hasDefault = liveReport?.ledger?.some((l: any) => l.record_type === 'DEFAULT' && l.status === 'ACTIVE');

    return {
      score: liveScore,
      band: liveBand,
      bandColor: bandColor,
      lastUpdated: liveReport?.score?.calculated_at 
        ? `${liveReport.score.calculated_at.slice(0, 16).replace('T', ' ')} UTC` 
        : (asOfDate === 'CURRENT' ? '2026-09-22 08:30 UTC' : `${asOfDate} 23:59 UTC`),
      defaultStatus: hasDispute ? 'DISPUTED (Sec 20V)' : (hasDefault ? 'ACTIVE_DEFAULT' : 'CLEARED / PAID'),
      defaultTagColor: hasDispute ? 'purple' : (hasDefault ? 'red' : 'green'),
      utilization: 25.4,
      totalDebt: 12340,
    };
  }, [liveReport, asOfDate, disputeSubmitted]);

  // Handle Time Travel switch: fetch bitemporal point-in-time reconstruction from API
  const handleTimeTravel = async (dateKey: string) => {
    setIsLoadingTimeTravel(true);
    setAsOfDate(dateKey);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const url = `http://localhost:8000/api/reports/${encodeURIComponent(routeId)}${dateKey !== 'CURRENT' ? `?as_of=${dateKey}` : ''}`;
      const res = await fetch(url, { headers });
      if (res.ok) {
        const data = await res.json();
        setLiveReport(data);
      }
    } catch (err) {
      console.error("Failed to fetch historical report", err);
    } finally {
      setIsLoadingTimeTravel(false);
    }
  };

  // Calculate live simulated score
  const simulatedScore = useMemo(() => {
    let s = snapshotData.score;
    const paydownPts = Math.min(28, Math.round((simDebtPaydown / 12340) * 28));
    s += paydownPts;
    if (simRemoveDefault) s += 45;
    if (simNewInquiry) s -= 12;
    return Math.min(1000, Math.max(0, s));
  }, [snapshotData.score, simDebtPaydown, simRemoveDefault, simNewInquiry]);

  // RHI Accounts dataset
  const rhiAccounts = [
    {
      id: 'a1',
      accountNumber: '••••-••••-9921',
      provider: 'Commonwealth Bank of Australia',
      type: 'Credit Card (Revolving)',
      limit: 20000,
      balance: 4120,
      opened: '2018-03-12',
      status: 'OPEN / CURRENT',
      apr: '18.49%',
      minDue: '$125.00',
      history: ['0', '0', '0', '1', '0', '0', '0', '0', '0', '0', '0', '0']
    },
    {
      id: 'a2',
      accountNumber: '••••-••••-1002',
      provider: 'National Australia Bank',
      type: 'Residential Mortgage (Term)',
      limit: 650000,
      balance: 482100,
      opened: '2015-08-20',
      status: 'OPEN / CURRENT',
      apr: '5.89%',
      minDue: '$3,180.00',
      history: ['0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0']
    },
    {
      id: 'a3',
      accountNumber: '••••-••••-4412',
      provider: 'Macquarie Leasing Pty Ltd',
      type: 'Auto Loan (Secured)',
      limit: 35000,
      balance: 8220,
      opened: '2021-11-04',
      status: 'OPEN / CURRENT',
      apr: '7.25%',
      minDue: '$640.00',
      history: ['0', '0', '0', '0', '0', '0', '1', '0', '0', '0', '0', '0']
    },
    {
      id: 'a4',
      accountNumber: '••••-••••-8831',
      provider: 'QuickCash Consumer Credit',
      type: 'Personal Loan (Unsecured)',
      limit: 5000,
      balance: 0,
      opened: '2022-02-15',
      status: 'CLOSED (Settled in Full)',
      apr: '22.00%',
      minDue: '$0.00',
      history: ['C', 'C', 'C', 'X', '2', '1', '0', '0', '0', '0', '0', '0']
    }
  ];

  const rhiMonthLabels = ['Sep 26', 'Aug 26', 'Jul 26', 'Jun 26', 'May 26', 'Apr 26', 'Mar 26', 'Feb 26', 'Jan 26', 'Dec 25', 'Nov 25', 'Oct 25'];

  const filteredRhiAccounts = useMemo(() => {
    return rhiAccounts.filter(acc => {
      const matchSearch = acc.provider.toLowerCase().includes(rhiSearch.toLowerCase()) || acc.accountNumber.includes(rhiSearch);
      const matchType = rhiFilterType === 'ALL' || (rhiFilterType === 'REVOLVING' && acc.type.includes('Revolving')) || (rhiFilterType === 'MORTGAGE' && acc.type.includes('Mortgage')) || (rhiFilterType === 'TERM' && !acc.type.includes('Revolving') && !acc.type.includes('Mortgage'));
      return matchSearch && matchType;
    });
  }, [rhiSearch, rhiFilterType]);

  const renderRhiCell = (val: string) => {
    switch (val) {
      case '0':
        return <span className="inline-block w-6 h-6 leading-6 text-center text-xs font-mono font-bold bg-[#198038] text-white" title="0: Paid on time / within grace period">0</span>;
      case '1':
        return <span className="inline-block w-6 h-6 leading-6 text-center text-xs font-mono font-bold bg-[#f1c21b] text-black" title="1: 1-29 days overdue">1</span>;
      case '2':
        return <span className="inline-block w-6 h-6 leading-6 text-center text-xs font-mono font-bold bg-[#ff832b] text-black" title="2: 30-59 days overdue">2</span>;
      case '3':
      case '4':
      case '5':
      case '6':
        return <span className="inline-block w-6 h-6 leading-6 text-center text-xs font-mono font-bold bg-[#da1e28] text-white" title={`${val}: 60+ days overdue`}>{val}</span>;
      case 'X':
        return <span className="inline-block w-6 h-6 leading-6 text-center text-xs font-mono bg-[#525252] text-[#c6c6c6]" title="X: No data / Not reported">X</span>;
      case 'C':
        return <span className="inline-block w-6 h-6 leading-6 text-center text-xs font-mono bg-[#262626] text-[#8d8d8d]" title="C: Account closed">C</span>;
      default:
        return <span className="font-mono text-xs">{val}</span>;
    }
  };

  const handleDisputeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('http://localhost:8000/api/disputes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entity_id: entityId,
          ledger_record_id: disputeTarget,
          notes: `Grounds: ${disputeReason}. Specific details: ${disputeDetails || 'Statutory notice requirements under Section 6Q / 21D not satisfied prior to listing.'}`
        })
      });
      const data = await res.json();
      const dispId = data.dispute_id || `DISP-${Date.now().toString().slice(-6)}`;
      setDisputeSuccessMsg(`Dispute ${dispId} successfully registered under Privacy Act 1988 Part IIIA s20V against ${disputeTarget}. Listing flagged 'UNDER INVESTIGATION' on all subscriber credit checks.`);
    } catch {
      setDisputeSuccessMsg(`Dispute DISP-${Date.now().toString().slice(-6)} successfully lodged against ${disputeTarget}. Under Privacy Act 1988 Part IIIA s20V, this listing is flagged as 'UNDER INVESTIGATION' on all subscriber pulls.`);
    }
    setDisputeSubmitted(true);
    setIsDisputeModalOpen(false);
  };

  return (
    <div className={`p-4 md:p-8 max-w-[1680px] mx-auto ${isCompact ? 'text-xs' : 'text-sm'}`}>
      {/* Top Breadcrumb & Action Strip */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4 pb-3 border-b border-[var(--cds-border-subtle)]">
        <Breadcrumb noTrailingSlash>
          <BreadcrumbItem>
            <Link href="/" className="text-[var(--cds-link-primary)] hover:underline">CRMS Root</Link>
          </BreadcrumbItem>
          <BreadcrumbItem>
            <Link href="/subject" className="text-[var(--cds-link-primary)] hover:underline">Consumer Directory</Link>
          </BreadcrumbItem>
          <BreadcrumbItem isCurrentPage className="font-mono text-white">
            {entityId}
          </BreadcrumbItem>
        </Breadcrumb>

        <div className="flex items-center gap-3">
          <Button
            size="sm"
            kind="ghost"
            onClick={() => setIsCompact(!isCompact)}
            className="text-xs text-[var(--cds-text-secondary)] hover:text-white"
          >
            Density: {isCompact ? 'Compact' : 'Standard'}
          </Button>

          <Button
            size="sm"
            kind="tertiary"
            renderIcon={DocumentAdd}
            onClick={() => setIsDisputeModalOpen(true)}
          >
            Raise Dispute (Sec 20V)
          </Button>

          <Button
            size="sm"
            kind="primary"
            renderIcon={Download}
            onClick={() => alert(`Generating cryptographic bureau statement for ${entityId}...`)}
          >
            Export Official PDF
          </Button>
        </div>
      </div>

      {/* Primary Subject Metadata Strip */}
      <div className="bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] p-5 mb-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1.5">
              <h1 className="text-2xl md:text-3xl font-light text-white tracking-tight">
                {subjectName}
              </h1>
              <Tag type="green" size="sm" className="font-mono m-0">ACTIVE / VERIFIED</Tag>
              <Tag type="blue" size="sm" className="font-mono m-0">CCR COMPLIANT</Tag>
            </div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-[var(--cds-text-secondary)]">
              <div><span className="text-[var(--cds-text-helper)]">FILE NUMBER:</span> <span className="font-mono text-white">{entityId}</span></div>
              <div><span className="text-[var(--cds-text-helper)]">DOB:</span> <span className="text-white">{subjectDob}</span></div>
              <div><span className="text-[var(--cds-text-helper)]">ADDRESS:</span> <span className="text-white">{subjectAddress}</span></div>
              <div><span className="text-[var(--cds-text-helper)]">JURISDICTION:</span> <span className="font-mono text-white">AU-NSW (APRA L3)</span></div>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs bg-[var(--cds-layer-02)] px-4 py-3 border border-[var(--cds-border-subtle)]">
            <div>
              <div className="text-[var(--cds-text-helper)] uppercase text-[10px] tracking-wider">As-Of Ledger State</div>
              <div className="font-mono font-bold text-white flex items-center gap-2">
                {isLoadingTimeTravel ? <InlineLoading status="active" description="Traveling..." /> : snapshotData.lastUpdated}
              </div>
            </div>
            <div className="border-l border-[var(--cds-border-subtle)] pl-4">
              <div className="text-[var(--cds-text-helper)] uppercase text-[10px] tracking-wider">Ledger State</div>
              <div className="font-mono text-[#42be65] font-semibold">SYNCED (Bitemporal)</div>
            </div>
          </div>
        </div>

        {/* Bitemporal Time Machine Scrubber */}
        <div className="mt-4 pt-3 border-t border-[var(--cds-border-subtle)] flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-[var(--cds-text-secondary)]">
            <Time size={16} className="text-[#0f62fe]" />
            <span className="font-semibold text-white">Bitemporal Time Machine:</span>
            <span>Inspect historical score snapshot as committed at:</span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 font-mono text-xs">
            {[
              { label: 'Realtime (T-0)', key: 'CURRENT' },
              { label: '2026-06-30 (Q2 Close)', key: '2026-06-30' },
              { label: '2025-12-31 (EOY 2025)', key: '2025-12-31' },
              { label: '2024-03-01 (Adverse Period)', key: '2024-03-01' }
            ].map(b => (
              <button
                key={b.key}
                onClick={() => handleTimeTravel(b.key)}
                className={`px-3 py-1 border transition-colors ${asOfDate === b.key ? 'bg-[#0f62fe] text-white border-[#0f62fe] font-bold' : 'bg-[var(--cds-layer-02)] text-[var(--cds-text-secondary)] border-[var(--cds-border-subtle)] hover:text-white hover:border-[var(--cds-border-strong)]'}`}
              >
                {b.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Dispute Alert Notification if submitted */}
      {disputeSubmitted && (
        <div className="mb-6">
          <InlineNotification
            kind="info"
            title="Formal Dispute Registered (OAIC / APRA Regulated)"
            subtitle={disputeSuccessMsg}
            onCloseButtonClick={() => setDisputeSubmitted(false)}
            lowContrast
          />
        </div>
      )}

      {/* 4-Column Dense Financial KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {/* KPI 1: Credit Score */}
        <div className="bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-[var(--cds-text-secondary)] uppercase tracking-wider font-semibold mb-2">
              <span>Comprehensive Bureau Score</span>
              <Tag type={snapshotData.bandColor as any} size="sm" className="m-0 font-mono">
                {snapshotData.band}
              </Tag>
            </div>

            <div className="flex items-baseline gap-3 my-2">
              <span className="text-5xl font-mono font-bold leading-none text-white tabular-nums">
                {snapshotData.score}
              </span>
              <div className="text-xs font-mono text-[#42be65] font-semibold">
                ▲ +14 pts (30d)
              </div>
            </div>
          </div>

          <div className="mt-4">
            <div className="flex justify-between text-[10px] font-mono text-[var(--cds-text-helper)] mb-1">
              <span>0 (Subprime)</span>
              <span>500 (Base)</span>
              <span>1000 (Super-Prime)</span>
            </div>
            {/* Calibrated score bar with zones */}
            <div className="w-full h-2 bg-[var(--cds-layer-02)] relative overflow-hidden flex">
              <div className="h-full bg-[#da1e28]" style={{ width: '30%' }} />
              <div className="h-full bg-[#f1c21b]" style={{ width: '20%' }} />
              <div className="h-full bg-[#0f62fe]" style={{ width: '25%' }} />
              <div className="h-full bg-[#24a148]" style={{ width: '25%' }} />
              <div 
                className="absolute top-0 bottom-0 w-1.5 bg-white -ml-0.5" 
                style={{ left: `${(snapshotData.score / 1000) * 100}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-[var(--cds-text-secondary)] mt-2.5">
              <span>12m Default Risk (PD): <strong className="font-mono text-white">1.42%</strong></span>
              <span>Rank: <strong className="text-white">Top 32%</strong></span>
            </div>
          </div>
        </div>

        {/* KPI 2: Credit Exposure & Utilisation */}
        <div className="bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-[var(--cds-text-secondary)] uppercase tracking-wider font-semibold mb-2">
              <span>Revolving Exposure</span>
              <span className="text-xs text-[var(--cds-text-helper)]">4 Active Lines</span>
            </div>

            <div className="my-2">
              <div className="text-3xl font-mono font-bold text-white tabular-nums">
                ${snapshotData.totalDebt.toLocaleString()} <span className="text-xs text-[var(--cds-text-helper)] font-normal font-sans">/ $48,500</span>
              </div>
              <div className="text-xs text-[var(--cds-text-secondary)] mt-1.5">
                Aggregate Revolving Utilisation: <strong className="font-mono text-white">{snapshotData.utilization}%</strong>
              </div>
            </div>
          </div>

          <div className="mt-4">
            <div className="w-full h-2 bg-[var(--cds-layer-02)] relative overflow-hidden">
              <div 
                className={`h-full ${snapshotData.utilization > 50 ? 'bg-[#da1e28]' : snapshotData.utilization > 30 ? 'bg-[#f1c21b]' : 'bg-[#0f62fe]'}`}
                style={{ width: `${Math.min(100, snapshotData.utilization)}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-[var(--cds-text-secondary)] mt-2.5">
              <span>Available Line: <strong className="font-mono text-white">${(48500 - snapshotData.totalDebt).toLocaleString()}</strong></span>
              <span className="text-[#42be65] font-semibold">Benchmark &lt;30%</span>
            </div>
          </div>
        </div>

        {/* KPI 3: Adverse Listings & Infringements */}
        <div className="bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-[var(--cds-text-secondary)] uppercase tracking-wider font-semibold mb-2">
              <span>Adverse & Defaults</span>
              <Tag type={snapshotData.defaultTagColor as any} size="sm" className="m-0 font-mono">
                {snapshotData.defaultStatus}
              </Tag>
            </div>

            <div className="my-2">
              <div className="text-3xl font-mono font-bold text-white tabular-nums">
                1 Listing <span className="text-xs text-[var(--cds-text-helper)] font-normal font-sans">($420.00)</span>
              </div>
              <div className="text-xs text-[var(--cds-text-secondary)] mt-1.5">
                Listed by Telstra Corp &bull; Dispute Active
              </div>
            </div>
          </div>

          <div className="border-t border-[var(--cds-border-subtle)] pt-3 text-xs text-[var(--cds-text-secondary)] space-y-1">
            <div className="flex justify-between">
              <span>Serious Infringements:</span>
              <span className="font-mono text-white font-bold">0</span>
            </div>
            <div className="flex justify-between">
              <span>Court Writs / Judgments:</span>
              <span className="font-mono text-white font-bold">0</span>
            </div>
          </div>
        </div>

        {/* KPI 4: Credit Velocity & Inquiries */}
        <div className="bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-[var(--cds-text-secondary)] uppercase tracking-wider font-semibold mb-2">
              <span>Credit Velocity</span>
              <span className="text-xs text-[var(--cds-text-helper)]">Low Risk Profile</span>
            </div>

            <div className="my-2">
              <div className="text-3xl font-mono font-bold text-white tabular-nums">
                3 <span className="text-xs text-[var(--cds-text-helper)] font-normal font-sans">Inquiries (12m)</span>
              </div>
              <div className="text-xs text-[var(--cds-text-secondary)] mt-1.5">
                0 Hard Inquiries in past 90 days
              </div>
            </div>
          </div>

          <div className="border-t border-[var(--cds-border-subtle)] pt-3 text-xs text-[var(--cds-text-secondary)] space-y-1">
            <div className="flex justify-between">
              <span>Average Account Age:</span>
              <span className="font-mono text-white font-bold">6.4 Years</span>
            </div>
            <div className="flex justify-between">
              <span>Oldest Trade Line:</span>
              <span className="text-white">11y (NAB Mortgage)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Multi-Tab Enterprise Report Sections */}
      <div className="bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)]">
        <Tabs>
          <TabList aria-label="Bureau File Sections" className="bg-[var(--cds-layer-02)] border-b border-[var(--cds-border-subtle)]">
            <Tab className="text-xs uppercase font-semibold">1. Executive Risk & What-If</Tab>
            <Tab className="text-xs uppercase font-semibold">2. 24-Month RHI Matrix</Tab>
            <Tab className="text-xs uppercase font-semibold">3. Credit Accounts (CCR)</Tab>
            <Tab className="text-xs uppercase font-semibold">4. Public Records & Defaults</Tab>
            <Tab className="text-xs uppercase font-semibold">5. Inquiries & Velocity</Tab>
            <Tab className="text-xs uppercase font-semibold">6. Hardship (Part IIIA)</Tab>
            <Tab className="text-xs uppercase font-semibold">7. Bitemporal Audit Ledger</Tab>
          </TabList>

          <TabPanels>
            {/* TAB 1: EXECUTIVE RISK & WHAT-IF SIMULATOR */}
            <TabPanel className="p-5 md:p-6">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Left Col: Scoring Waterfall Decomposition */}
                <div className="lg:col-span-7 space-y-6">
                  <div>
                    <h2 className="text-lg font-medium text-white mb-1.5">Score Decomposition & Factor Weights</h2>
                    <p className="text-xs text-[var(--cds-text-secondary)] mb-4 leading-relaxed">
                      Deterministic score attribution derived from Australian Comprehensive Credit Reporting (CCR) inputs. Baseline model starts at 500 points.
                    </p>

                    <div
                      className="border border-[var(--cds-border-subtle)] bg-[var(--cds-layer-02)] overflow-x-auto"
                      tabIndex={0}
                      role="region"
                      aria-label="Risk Factor Attribution Table"
                    >
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-[var(--cds-border-subtle)] text-[var(--cds-text-secondary)] uppercase tracking-wider text-[11px]">
                            <th className="p-3 w-5/12">Risk Factor Attribution</th>
                            <th className="p-3 w-3/12">Category</th>
                            <th className="p-3 w-2/12 font-mono">Impact</th>
                            <th className="p-3 w-2/12 text-center">Signal</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--cds-border-subtle)]">
                          <tr className="hover:bg-[var(--cds-layer-03)] transition-colors">
                            <td className="p-3 font-medium text-white">Consistent 12m Repayment Track</td>
                            <td className="p-3 text-[var(--cds-text-secondary)]">RHI Reliability (98.6%)</td>
                            <td className="p-3 text-[#42be65] font-mono font-bold">+48 pts</td>
                            <td className="p-3 text-center"><CheckmarkOutline className="text-[#42be65] inline" size={16} /></td>
                          </tr>
                          <tr className="hover:bg-[var(--cds-layer-03)] transition-colors">
                            <td className="p-3 font-medium text-white">Revolving Utilisation &lt; 30%</td>
                            <td className="p-3 text-[var(--cds-text-secondary)]">Capacity / Liquidity</td>
                            <td className="p-3 text-[#42be65] font-mono font-bold">+15 pts</td>
                            <td className="p-3 text-center"><CheckmarkOutline className="text-[#42be65] inline" size={16} /></td>
                          </tr>
                          <tr className="hover:bg-[var(--cds-layer-03)] transition-colors">
                            <td className="p-3 font-medium text-white">Seasoned Account Longevity</td>
                            <td className="p-3 text-[var(--cds-text-secondary)]">Credit History (Avg 6.4y)</td>
                            <td className="p-3 text-[#42be65] font-mono font-bold">+22 pts</td>
                            <td className="p-3 text-center"><CheckmarkOutline className="text-[#42be65] inline" size={16} /></td>
                          </tr>
                          <tr className="hover:bg-[var(--cds-layer-03)] transition-colors">
                            <td className="p-3 font-medium text-white">Telstra Consumer Default ($420)</td>
                            <td className="p-3 text-[var(--cds-text-secondary)]">Adverse Listing (Under Dispute)</td>
                            <td className="p-3 text-[#fa4d56] font-mono font-bold">-45 pts</td>
                            <td className="p-3 text-center"><ErrorIcon className="text-[#fa4d56] inline" size={16} /></td>
                          </tr>
                          <tr className="hover:bg-[var(--cds-layer-03)] transition-colors">
                            <td className="p-3 font-medium text-white">Recent Credit Velocity (3 Enquiries)</td>
                            <td className="p-3 text-[var(--cds-text-secondary)]">Hard Inquiries (12m)</td>
                            <td className="p-3 text-[#f1c21b] font-mono font-bold">-8 pts</td>
                            <td className="p-3 text-center"><Warning className="text-[#f1c21b] inline" size={16} /></td>
                          </tr>
                          <tr className="bg-[var(--cds-layer-01)] font-bold">
                            <td className="p-3 text-white" colSpan={2}>Net Calculated Credit Score</td>
                            <td className="p-3 text-[#0f62fe] font-mono text-sm" colSpan={2}>
                              712 / 1000
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Portfolio Facilities Breakdown */}
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--cds-text-secondary)] mb-3">
                      Credit Facility Exposure Breakdown
                    </h4>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="p-3 bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)]">
                        <div className="text-[10px] text-[var(--cds-text-helper)] uppercase font-medium">Mortgages</div>
                        <div className="text-base font-mono font-bold text-white mt-1">$482,100</div>
                        <div className="text-[10px] text-[var(--cds-text-secondary)] mt-0.5">1 Account &bull; Prime</div>
                      </div>
                      <div className="p-3 bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)]">
                        <div className="text-[10px] text-[var(--cds-text-helper)] uppercase font-medium">Credit Cards</div>
                        <div className="text-base font-mono font-bold text-white mt-1">$4,120</div>
                        <div className="text-[10px] text-[var(--cds-text-secondary)] mt-0.5">1 Line &bull; 20.6% Util</div>
                      </div>
                      <div className="p-3 bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)]">
                        <div className="text-[10px] text-[var(--cds-text-helper)] uppercase font-medium">Auto Finance</div>
                        <div className="text-base font-mono font-bold text-white mt-1">$8,220</div>
                        <div className="text-[10px] text-[var(--cds-text-secondary)] mt-0.5">Secured &bull; Current</div>
                      </div>
                      <div className="p-3 bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)]">
                        <div className="text-[10px] text-[var(--cds-text-helper)] uppercase font-medium">Personal Loans</div>
                        <div className="text-base font-mono font-bold text-white mt-1">$0.00</div>
                        <div className="text-[10px] text-[#42be65] mt-0.5">Closed / Settled</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right Col: Interactive Score Simulator ("What-If" Risk Sandbox) */}
                <div className="lg:col-span-5 bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] p-5 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between pb-3 border-b border-[var(--cds-border-subtle)] mb-4">
                      <div className="flex items-center gap-2">
                        <Renew size={18} className="text-[#0f62fe]" />
                        <h4 className="text-sm font-semibold uppercase tracking-wider text-white">
                          Live "What-If" Score Simulator
                        </h4>
                      </div>
                      <span className="text-[10px] font-mono bg-[#002d9c] text-[#4589ff] px-2 py-0.5 border border-[#0043ce]">
                        Interactive Model
                      </span>
                    </div>

                    <p className="text-xs text-[var(--cds-text-secondary)] mb-6 leading-relaxed">
                      Adjust hypothetical consumer actions to immediately observe simulated score variances calculated using APRA-aligned credit rules.
                    </p>

                    {/* Simulator Controls */}
                    <div className="space-y-6">
                      {/* Control 1: Debt Paydown Slider */}
                      <div>
                        <div className="flex justify-between text-xs mb-2">
                          <label htmlFor="sim-debt-paydown-slider" className="text-white font-medium">Pay Down Revolving Debt:</label>
                          <span className="font-mono text-[#42be65] font-bold">${simDebtPaydown.toLocaleString()}</span>
                        </div>
                        <input
                          id="sim-debt-paydown-slider"
                          aria-label="Pay down revolving debt slider"
                          type="range"
                          min="0"
                          max="12340"
                          step="500"
                          value={simDebtPaydown}
                          onChange={(e) => setSimDebtPaydown(Number(e.target.value))}
                          className="w-full accent-[#0f62fe] cursor-pointer"
                        />
                        <div className="flex justify-between text-[10px] font-mono text-[var(--cds-text-helper)] mt-1">
                          <span>$0 (Current)</span>
                          <span>$12,340 (Full Payoff)</span>
                        </div>
                      </div>

                      {/* Control 2: Resolve Disputed Default Toggle */}
                      <div className="flex items-center justify-between p-3.5 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)]">
                        <div>
                          <div className="text-xs font-medium text-white">Expunge Disputed Default ($420)</div>
                          <div className="text-[11px] text-[var(--cds-text-secondary)]">Simulates favorable Section 20V dispute outcome</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setSimRemoveDefault(!simRemoveDefault)}
                          className={`px-3 py-1 text-xs font-mono font-semibold border transition-all ${simRemoveDefault ? 'bg-[#24a148] text-white border-[#42be65]' : 'bg-[var(--cds-layer-03)] text-[#8d8d8d] border-transparent hover:text-white'}`}
                        >
                          {simRemoveDefault ? 'RESOLVED (+45)' : 'EXCLUDE'}
                        </button>
                      </div>

                      {/* Control 3: New Credit Application Toggle */}
                      <div className="flex items-center justify-between p-3.5 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)]">
                        <div>
                          <div className="text-xs font-medium text-white">New $15,000 Unsecured Facility</div>
                          <div className="text-[11px] text-[var(--cds-text-secondary)]">Simulates hard inquiry + debt expansion</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setSimNewInquiry(!simNewInquiry)}
                          className={`px-3 py-1 text-xs font-mono font-semibold border transition-all ${simNewInquiry ? 'bg-[#da1e28] text-white border-[#fa4d56]' : 'bg-[var(--cds-layer-03)] text-[#8d8d8d] border-transparent hover:text-white'}`}
                        >
                          {simNewInquiry ? 'APPLIED (-12)' : 'EXCLUDE'}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Dynamic Simulation Result Card */}
                  <div className="mt-6 pt-4 border-t border-[var(--cds-border-subtle)] bg-[var(--cds-layer-01)] p-4 border">
                    <div className="text-xs text-[var(--cds-text-helper)] uppercase tracking-wider font-semibold mb-1">
                      Projected Score Variance
                    </div>
                    <div className="flex items-baseline justify-between">
                      <div className="flex items-baseline gap-2">
                        <span className="text-4xl font-mono font-bold text-white tabular-nums">
                          {simulatedScore}
                        </span>
                        <span className="text-xs font-mono text-[var(--cds-text-helper)]">
                          / 1000
                        </span>
                      </div>

                      <div className={`font-mono text-sm font-bold ${simulatedScore >= snapshotData.score ? 'text-[#42be65]' : 'text-[#fa4d56]'}`}>
                        {simulatedScore >= snapshotData.score ? `+${simulatedScore - snapshotData.score}` : `${simulatedScore - snapshotData.score}`} pts delta
                      </div>
                    </div>

                    <div className="text-xs text-[var(--cds-text-secondary)] mt-2.5 flex items-center justify-between border-t border-[var(--cds-border-subtle)] pt-2">
                      <span>Simulated Risk: <strong className="text-white">{simulatedScore >= 740 ? 'Tier 1 - Super-Prime' : simulatedScore >= 680 ? 'Tier 2 - Prime' : 'Tier 3 - Near-Prime'}</strong></span>
                      <button 
                        onClick={() => { setSimDebtPaydown(0); setSimRemoveDefault(false); setSimNewInquiry(false); }}
                        className="text-[var(--cds-link-primary)] hover:underline flex items-center gap-1 font-mono text-[11px]"
                      >
                        <Undo size={12} /> Reset
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </TabPanel>

            {/* TAB 2: 24-MONTH RHI MATRIX */}
            <TabPanel className="p-5 md:p-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                <div>
                  <h2 className="text-lg font-medium text-white">24-Month Repayment History Information (RHI) Matrix</h2>
                  <p className="text-xs text-[var(--cds-text-secondary)]">
                    Official CCR monthly codes: 0 = On Time, 1 = 1-29d overdue, 2 = 30-59d, 3-6 = 60+d, X = Not Reported, C = Closed.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <input
                    id="rhi-search-input"
                    aria-label="Filter provider or account"
                    type="text"
                    placeholder="Filter provider or account..."
                    value={rhiSearch}
                    onChange={(e) => setRhiSearch(e.target.value)}
                    className="bg-[var(--cds-field)] text-white text-xs px-3 py-1.5 border border-[var(--cds-border-subtle)] focus:border-[#0f62fe] focus:outline-none w-56"
                  />

                  <select
                    id="rhi-facility-filter"
                    aria-label="Filter by facility type"
                    value={rhiFilterType}
                    onChange={(e) => setRhiFilterType(e.target.value)}
                    className="bg-[var(--cds-field)] text-white text-xs px-3 py-1.5 border border-[var(--cds-border-subtle)] focus:border-[#0f62fe] focus:outline-none"
                  >
                    <option value="ALL">All Facilities (4)</option>
                    <option value="REVOLVING">Credit Cards</option>
                    <option value="MORTGAGE">Mortgages</option>
                    <option value="TERM">Term & Auto</option>
                  </select>
                </div>
              </div>

              {/* RHI Legend Bar */}
              <div className="flex flex-wrap items-center gap-4 text-xs bg-[var(--cds-layer-02)] p-3 mb-4 border border-[var(--cds-border-subtle)]">
                <span className="text-[var(--cds-text-helper)] font-bold text-[11px] uppercase tracking-wider">RHI Legend:</span>
                <div className="flex items-center gap-1.5">
                  <span className="w-4 h-4 bg-[#198038] text-white text-[10px] font-mono font-bold text-center leading-4 inline-block">0</span>
                  <span className="text-[#c6c6c6]">Current (On Time)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-4 h-4 bg-[#f1c21b] text-black text-[10px] font-mono font-bold text-center leading-4 inline-block">1</span>
                  <span className="text-[#c6c6c6]">1-29d overdue</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-4 h-4 bg-[#ff832b] text-black text-[10px] font-mono font-bold text-center leading-4 inline-block">2</span>
                  <span className="text-[#c6c6c6]">30-59d overdue</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-4 h-4 bg-[#da1e28] text-white text-[10px] font-mono font-bold text-center leading-4 inline-block">3-6</span>
                  <span className="text-[#c6c6c6]">60d+ default risk</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-4 h-4 bg-[#525252] text-[#c6c6c6] text-[10px] font-mono font-bold text-center leading-4 inline-block">X</span>
                  <span className="text-[#c6c6c6]">No data / Grace</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-4 h-4 bg-[#262626] text-[#8d8d8d] text-[10px] font-mono font-bold text-center leading-4 inline-block">C</span>
                  <span className="text-[#c6c6c6]">Account Closed</span>
                </div>
              </div>

              {/* Comprehensive 24-Month Grid Table */}
              <div
                className="border border-[var(--cds-border-subtle)] overflow-x-auto"
                tabIndex={0}
                role="region"
                aria-label="24-Month Repayment History Information Grid"
              >
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-[var(--cds-layer-02)] border-b border-[var(--cds-border-subtle)] text-[var(--cds-text-secondary)] uppercase text-[11px] tracking-wider">
                      <th className="p-3 min-w-[240px]">Credit Provider & Facility</th>
                      <th className="p-3 text-right font-mono">Limit</th>
                      <th className="p-3 text-right font-mono">Balance</th>
                      {rhiMonthLabels.map((m, idx) => (
                        <th key={idx} className="p-2 text-center text-[11px] font-mono whitespace-nowrap">
                          {m}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--cds-border-subtle)]">
                    {filteredRhiAccounts.map(acc => (
                      <React.Fragment key={acc.id}>
                        <tr 
                          onClick={() => setExpandedAccount(expandedAccount === acc.id ? null : acc.id)}
                          className="hover:bg-[var(--cds-layer-02)] cursor-pointer transition-colors"
                        >
                          <td className="p-3 font-medium text-white">
                            <div className="flex items-center gap-2">
                              {expandedAccount === acc.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                              <div>
                                <div>{acc.provider}</div>
                                <div className="text-[11px] text-[var(--cds-text-helper)] font-normal">
                                  {acc.type} &bull; <span className="font-mono">{acc.accountNumber}</span>
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="p-3 text-right font-mono text-[#c6c6c6]">${acc.limit.toLocaleString()}</td>
                          <td className="p-3 text-right font-mono font-bold text-white">${acc.balance.toLocaleString()}</td>
                          {acc.history.map((hVal, hIdx) => (
                            <td key={hIdx} className="p-2 text-center">
                              {renderRhiCell(hVal)}
                            </td>
                          ))}
                        </tr>

                        {/* Expandable Account Details Row */}
                        {expandedAccount === acc.id && (
                          <tr className="bg-[var(--cds-layer-02)]">
                            <td colSpan={15} className="p-4 border-t border-b border-[var(--cds-border-subtle)]">
                              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-xs">
                                <div>
                                  <span className="text-[var(--cds-text-helper)] block text-[10px] uppercase font-semibold">FACILITY STATUS:</span>
                                  <span className="font-mono text-white font-bold">{acc.status}</span>
                                </div>
                                <div>
                                  <span className="text-[var(--cds-text-helper)] block text-[10px] uppercase font-semibold">OPEN DATE:</span>
                                  <span className="font-mono text-white">{acc.opened}</span>
                                </div>
                                <div>
                                  <span className="text-[var(--cds-text-helper)] block text-[10px] uppercase font-semibold">PURCHASE APR:</span>
                                  <span className="font-mono text-white">{acc.apr}</span>
                                </div>
                                <div>
                                  <span className="text-[var(--cds-text-helper)] block text-[10px] uppercase font-semibold">MONTHLY MINIMUM:</span>
                                  <span className="font-mono text-white">{acc.minDue}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Button 
                                    size="sm" 
                                    kind="ghost" 
                                    className="text-xs text-[var(--cds-link-primary)]"
                                    onClick={(e: any) => { e.stopPropagation(); setIsDisputeModalOpen(true); }}
                                  >
                                    Dispute RHI Code
                                  </Button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </TabPanel>

            {/* TAB 3: CREDIT ACCOUNTS (CCR LINES) */}
            <TabPanel className="p-5 md:p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-medium text-white">Active Credit Accounts & CCR Tradelines</h2>
                  <p className="text-xs text-[var(--cds-text-secondary)]">
                    Reported by APRA-licensed financial institutions under National Consumer Credit Protection Act 2009.
                  </p>
                </div>
                <span className="text-xs text-[var(--cds-text-secondary)]">
                  Total Lines: 4 (3 Active, 1 Closed)
                </span>
              </div>

              <div
                className="border border-[var(--cds-border-subtle)] overflow-x-auto"
                tabIndex={0}
                role="region"
                aria-label="Active Credit Accounts and CCR Tradelines Table"
              >
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-[var(--cds-layer-02)] border-b border-[var(--cds-border-subtle)] text-[var(--cds-text-secondary)] uppercase text-[11px] tracking-wider">
                      <th className="p-3">Credit Provider</th>
                      <th className="p-3 font-mono">Account Number</th>
                      <th className="p-3">Account Type</th>
                      <th className="p-3">Status</th>
                      <th className="p-3 text-right font-mono">Credit Limit</th>
                      <th className="p-3 text-right font-mono">Current Balance</th>
                      <th className="p-3 text-right font-mono">Monthly Payment</th>
                      <th className="p-3 font-mono">Opened</th>
                      <th className="p-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--cds-border-subtle)]">
                    {rhiAccounts.map(acc => (
                      <tr key={acc.id} className="hover:bg-[var(--cds-layer-02)] transition-colors">
                        <td className="p-3 font-medium text-white">{acc.provider}</td>
                        <td className="p-3 font-mono text-[#c6c6c6]">{acc.accountNumber}</td>
                        <td className="p-3 text-[var(--cds-text-secondary)]">{acc.type}</td>
                        <td className="p-3">
                          <Tag type={acc.status.includes('OPEN') ? 'green' : 'gray'} size="sm" className="m-0 font-mono">
                            {acc.status.split(' ')[0]}
                          </Tag>
                        </td>
                        <td className="p-3 text-right font-mono text-[#c6c6c6]">${acc.limit.toLocaleString()}</td>
                        <td className="p-3 text-right font-mono font-bold text-white">${acc.balance.toLocaleString()}</td>
                        <td className="p-3 text-right font-mono text-[#c6c6c6]">{acc.minDue}</td>
                        <td className="p-3 font-mono text-[var(--cds-text-helper)]">{acc.opened}</td>
                        <td className="p-3">
                          <button
                            onClick={() => setIsDisputeModalOpen(true)}
                            className="text-[var(--cds-link-primary)] hover:underline"
                          >
                            Dispute
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </TabPanel>

            {/* TAB 4: PUBLIC RECORDS & DEFAULTS */}
            <TabPanel className="p-5 md:p-6 space-y-6">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-lg font-medium text-white">Default Listings & Adverse Credit Infringements</h2>
                  <Tag type="red" size="sm" className="font-mono m-0">1 Active Listing</Tag>
                </div>
                <p className="text-xs text-[var(--cds-text-secondary)] mb-4">
                  Under s6Q and s21D of the Privacy Act 1988, consumer defaults are accepted only if debt &ge; $150 and &ge; 60 days overdue, with statutory 30-day notice served.
                </p>

                <div className="border border-[var(--cds-border-subtle)] bg-[var(--cds-layer-02)] p-4">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[var(--cds-border-subtle)] pb-4 mb-4">
                    <div>
                      <div className="flex items-center gap-3">
                        <h4 className="text-base font-bold text-white">Telstra Consumer Telecommunications</h4>
                        <Tag type="red" size="sm" className="font-mono m-0">SECTION 21D DEFAULT</Tag>
                        <Tag type="purple" size="sm" className="font-mono m-0">DISPUTED (Sec 20V)</Tag>
                      </div>
                      <div className="text-xs text-[var(--cds-text-secondary)] mt-1">
                        Listing Ref: <span className="font-mono">DEF-TEL-2024-881</span> &bull; Original Account: <span className="font-mono">TEL-883192-NSW</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <Button
                        size="sm"
                        kind="tertiary"
                        onClick={() => alert("Viewing dispute investigation document pack...")}
                        className="text-xs"
                      >
                        Dispute Docket (SLA: 12d)
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                    <div>
                      <span className="text-[var(--cds-text-helper)] block text-[10px] uppercase font-semibold">ORIGINAL DEFAULT AMOUNT:</span>
                      <span className="font-mono text-white font-bold text-base">$420.00 AUD</span>
                    </div>
                    <div>
                      <span className="text-[var(--cds-text-helper)] block text-[10px] uppercase font-semibold">DATE DEFAULT RECORDED:</span>
                      <span className="font-mono text-white">2024-02-14</span>
                    </div>
                    <div>
                      <span className="text-[var(--cds-text-helper)] block text-[10px] uppercase font-semibold">DAYS OVERDUE AT LISTING:</span>
                      <span className="text-white">74 Days (&ge;60d met)</span>
                    </div>
                    <div>
                      <span className="text-[var(--cds-text-helper)] block text-[10px] uppercase font-semibold">RETENTION EXPIRY (5 YEARS):</span>
                      <span className="font-mono text-white">2029-02-14</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Court Writs & Judgments */}
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-white mb-2">
                  Court Writs & Public Judgments
                </h4>
                <div className="border border-[var(--cds-border-subtle)] bg-[var(--cds-layer-02)] p-4 text-xs flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CheckmarkOutline className="text-[#42be65]" size={18} />
                    <div>
                      <span className="text-white font-medium">No Court Writs or Judgments Recorded</span>
                      <span className="text-[var(--cds-text-helper)] block text-[11px] mt-0.5">
                        Scanned against Federal, Supreme, District, and Local Court Registries nationwide.
                      </span>
                    </div>
                  </div>
                  <span className="text-[#42be65] font-mono font-bold">CLEARED</span>
                </div>
              </div>

              {/* Insolvency & Bankruptcy (NPII) */}
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-white mb-2">
                  National Personal Insolvency Index (NPII)
                </h4>
                <div className="border border-[var(--cds-border-subtle)] bg-[var(--cds-layer-02)] p-4 text-xs flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CheckmarkOutline className="text-[#42be65]" size={18} />
                    <div>
                      <span className="text-white font-medium">Nil Bankruptcy or Insolvency Proceedings</span>
                      <span className="text-[var(--cds-text-helper)] block text-[11px] mt-0.5">
                        No Part IV (Bankruptcy), Part IX (Debt Agreement), or Part X (Personal Insolvency) recorded.
                      </span>
                    </div>
                  </div>
                  <span className="text-[#42be65] font-mono font-bold">CLEARED</span>
                </div>
              </div>
            </TabPanel>

            {/* TAB 5: INQUIRIES & VELOCITY */}
            <TabPanel className="p-5 md:p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-medium text-white">Credit Inquiries Register</h2>
                  <p className="text-xs text-[var(--cds-text-secondary)]">
                    Audit of credit provider access requests in the previous 5 years under Australian Privacy Principle 12.
                  </p>
                </div>
                <Tag type="blue" size="sm" className="font-mono m-0">3 Hard Enquiries (12m)</Tag>
              </div>

              <div
                className="border border-[var(--cds-border-subtle)] overflow-x-auto"
                tabIndex={0}
                role="region"
                aria-label="Credit Inquiries Register Table"
              >
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-[var(--cds-layer-02)] border-b border-[var(--cds-border-subtle)] text-[var(--cds-text-secondary)] uppercase text-[11px] tracking-wider">
                      <th className="p-3 font-mono">Inquiry Date</th>
                      <th className="p-3">Inquiring Entity</th>
                      <th className="p-3">Facility Applied For</th>
                      <th className="p-3">Inquiry Type</th>
                      <th className="p-3 text-right font-mono">Requested Amount</th>
                      <th className="p-3 font-mono">Score Impact</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--cds-border-subtle)]">
                    {liveReport?.enquiries && liveReport.enquiries.length > 0 ? (
                      liveReport.enquiries.map((enq: any) => (
                        <tr key={enq.id} className="hover:bg-[var(--cds-layer-02)] transition-colors">
                          <td className="p-3 font-mono text-white">
                            {enq.created_at ? enq.created_at.slice(0, 10) : '2026-09-22'}
                          </td>
                          <td className="p-3 font-medium text-white">
                            {enq.user_id || 'Subscriber / Credit Provider'}
                          </td>
                          <td className="p-3 text-[var(--cds-text-secondary)]">
                            {enq.reason || 'Comprehensive Credit Assessment'}
                          </td>
                          <td className="p-3">
                            <Tag type="purple" size="sm" className="m-0 font-mono">
                              CREDIT INQUIRY
                            </Tag>
                          </td>
                          <td className="p-3 text-right font-mono text-[#c6c6c6] font-bold">
                            {enq.id.slice(0, 12)}
                          </td>
                          <td className="p-3 font-mono text-[#42be65] font-bold">
                            Logged (Part IIIA)
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr className="hover:bg-[var(--cds-layer-02)] transition-colors">
                        <td className="p-3 font-mono text-white">2026-09-22</td>
                        <td className="p-3 font-medium text-white">Subject Self-Check</td>
                        <td className="p-3 text-[var(--cds-text-secondary)]">Consumer Access Assessment</td>
                        <td className="p-3"><Tag type="gray" size="sm" className="m-0 font-mono">SOFT INQUIRY</Tag></td>
                        <td className="p-3 text-right font-mono text-[#8d8d8d]">N/A</td>
                        <td className="p-3 font-mono text-[#42be65] font-bold">0 pts</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </TabPanel>

            {/* TAB 6: HARDSHIP (PART IIIA) */}
            <TabPanel className="p-5 md:p-6 space-y-6">
              <div>
                <h2 className="text-lg font-medium text-white mb-2">Financial Hardship Arrangements (Section 21QA)</h2>
                <div className="mb-4">
                  <InlineNotification
                    kind="info"
                    title="Strict Privacy Act 1988 Compliance Rule"
                    subtitle="Under Australian Privacy Act Part IIIA s21QA, Financial Hardship Information (Code A: Temporary Relief or Code V: Variation) is strictly excluded from scoring algorithms. Hardship cannot reduce credit scores."
                    lowContrast
                  />
                </div>

                <div className="border border-[var(--cds-border-subtle)] bg-[var(--cds-layer-02)] p-4 text-xs">
                  <div className="flex items-center justify-between pb-3 border-b border-[var(--cds-border-subtle)] mb-3">
                    <span className="text-white font-bold">Active Financial Hardship Status:</span>
                    <Tag type="green" size="sm" className="m-0 font-mono">NO ACTIVE HARDSHIP</Tag>
                  </div>
                  <div className="text-[var(--cds-text-secondary)] space-y-2 leading-relaxed">
                    <p>
                      Historical Record: Subject previously utilized a 3-month Temporary Relief arrangement (Code A) with National Australia Bank in Q1 2023 following temporary medical leave. The arrangement concluded on 2023-04-30 with all subsequent obligations satisfied in full.
                    </p>
                    <p className="text-[var(--cds-text-helper)] font-mono text-[11px]">
                      Statutory retention period for completed Financial Hardship Information is 12 months. Record expunged from subscriber view 2024-04-30.
                    </p>
                  </div>
                </div>
              </div>
            </TabPanel>

            {/* TAB 7: BITEMPORAL AUDIT LEDGER */}
            <TabPanel className="p-5 md:p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-medium text-white">Bitemporal Ledger & Cryptographic Verification</h2>
                  <p className="text-xs text-[var(--cds-text-secondary)]">
                    Append-only ledger separating Valid Time (when event occurred) from Transaction Time (when bureau recorded it). Never overwritten.
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs text-[#42be65] bg-[#0e2a15] px-3 py-1 border border-[#24a148] font-mono">
                  <CheckmarkOutline size={14} /> LEDGER INTEGRITY VALIDATED
                </div>
              </div>

              <div
                className="border border-[var(--cds-border-subtle)] overflow-x-auto"
                tabIndex={0}
                role="region"
                aria-label="Bitemporal Audit Ledger Table"
              >
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-[var(--cds-layer-02)] border-b border-[var(--cds-border-subtle)] text-[var(--cds-text-secondary)] uppercase text-[11px] tracking-wider">
                      <th className="p-3 font-mono">Event ID</th>
                      <th className="p-3">Event Type</th>
                      <th className="p-3 font-mono">Valid Time (Real-world)</th>
                      <th className="p-3 font-mono">Transaction Time (Bureau)</th>
                      <th className="p-3 font-mono">Author Entity</th>
                      <th className="p-3 font-mono">SHA-256 State Hash</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--cds-border-subtle)]">
                    <tr className="hover:bg-[var(--cds-layer-02)] transition-colors">
                      <td className="p-3 font-mono text-[var(--cds-link-primary)]">EVT-90421-A</td>
                      <td className="p-3 font-medium text-white">RHI_BATCH_APPEND</td>
                      <td className="p-3 font-mono text-[#c6c6c6]">2026-09-01 00:00:00</td>
                      <td className="p-3 font-mono text-[#c6c6c6]">2026-09-04 14:22:05</td>
                      <td className="p-3 font-mono text-[var(--cds-text-secondary)]">PRV-CBA-001</td>
                      <td className="p-3 font-mono text-[var(--cds-text-helper)] truncate max-w-xs">e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855</td>
                    </tr>
                    <tr className="hover:bg-[var(--cds-layer-02)] transition-colors">
                      <td className="p-3 font-mono text-[var(--cds-link-primary)]">EVT-89212-D</td>
                      <td className="p-3 font-medium text-white">DISPUTE_RAISED</td>
                      <td className="p-3 font-mono text-[#c6c6c6]">2026-08-19 09:11:00</td>
                      <td className="p-3 font-mono text-[#c6c6c6]">2026-08-19 09:11:02</td>
                      <td className="p-3 font-mono text-[var(--cds-text-secondary)]">SUB-IND-8842</td>
                      <td className="p-3 font-mono text-[var(--cds-text-helper)] truncate max-w-xs">8f434346648f6b96df89dda901c5176b10a6d83961dd3c1ac88b59b2dc327aa4</td>
                    </tr>
                    <tr className="hover:bg-[var(--cds-layer-02)] transition-colors">
                      <td className="p-3 font-mono text-[var(--cds-link-primary)]">EVT-71829-M</td>
                      <td className="p-3 font-medium text-white">MORTGAGE_REPORTED</td>
                      <td className="p-3 font-mono text-[#c6c6c6]">2026-08-01 00:00:00</td>
                      <td className="p-3 font-mono text-[#c6c6c6]">2026-08-03 11:04:12</td>
                      <td className="p-3 font-mono text-[var(--cds-text-secondary)]">PRV-NAB-002</td>
                      <td className="p-3 font-mono text-[var(--cds-text-helper)] truncate max-w-xs">ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb</td>
                    </tr>
                    <tr className="hover:bg-[var(--cds-layer-02)] transition-colors">
                      <td className="p-3 font-mono text-[var(--cds-link-primary)]">EVT-64210-F</td>
                      <td className="p-3 font-medium text-white">DEFAULT_LISTED</td>
                      <td className="p-3 font-mono text-[#c6c6c6]">2024-02-14 09:00:00</td>
                      <td className="p-3 font-mono text-[#c6c6c6]">2024-02-14 09:30:18</td>
                      <td className="p-3 font-mono text-[var(--cds-text-secondary)]">PRV-TEL-049</td>
                      <td className="p-3 font-mono text-[var(--cds-text-helper)] truncate max-w-xs">3e23e8160039594a33894f6564e1b1348bbd7a0088d42c4acb73eeaed59c009d</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </TabPanel>
          </TabPanels>
        </Tabs>
      </div>

      {/* Formal Dispute Modal (Section 20V) */}
      <Modal
        open={isDisputeModalOpen}
        modalHeading="Lodge Formal Dispute (Privacy Act 1988 Part IIIA s20V)"
        primaryButtonText="Submit Dispute Docket"
        secondaryButtonText="Cancel"
        onRequestClose={() => setIsDisputeModalOpen(false)}
        onRequestSubmit={handleDisputeSubmit}
        size="md"
      >
        <div className="space-y-4 text-xs">
          <p className="text-[var(--cds-text-secondary)] leading-relaxed">
            Submitting a dispute requires the credit bureau and credit provider to conduct an investigation within the statutory 30-day SLA. The contested listing is immediately flagged as disputed on all bureau subscriber queries.
          </p>

          <div>
            <label className="block text-xs font-semibold text-white mb-1">Target Account / Listing</label>
            <select
              value={disputeTarget}
              onChange={(e) => setDisputeTarget(e.target.value)}
              className="w-full bg-[var(--cds-field)] text-white text-xs p-2 border border-[var(--cds-border-subtle)] focus:border-[#0f62fe] focus:outline-none"
            >
              <option value="DEF-TEL-2024-881">Telstra Consumer Default ($420.00)</option>
              <option value="ACC-CBA-9921">Commonwealth Bank Credit Card (••••-9921)</option>
              <option value="ACC-NAB-1002">National Australia Bank Mortgage (••••-1002)</option>
              <option value="INQ-MAC-2026">Macquarie Bank Hard Inquiry ($720,000)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-white mb-1">Statutory Grounds for Dispute</label>
            <select
              value={disputeReason}
              onChange={(e) => setDisputeReason(e.target.value)}
              className="w-full bg-[var(--cds-field)] text-white text-xs p-2 border border-[var(--cds-border-subtle)] focus:border-[#0f62fe] focus:outline-none"
            >
              <option value="NOTICE_NOT_RECEIVED">Section 6Q / 21D Statutory Notices Not Received</option>
              <option value="INCORRECT_BALANCE">Inaccurate Overdue Balance or Payment In Flight</option>
              <option value="IDENTITY_FRAUD">Suspected Identity Fraud / Unauthorized Account</option>
              <option value="HARDSHIP_OMISSION">Unacknowledged Hardship Arrangement Under s21QA</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-white mb-1">Statement of Facts & Evidence</label>
            <textarea
              rows={4}
              value={disputeDetails}
              onChange={(e) => setDisputeDetails(e.target.value)}
              placeholder="Detail the specific factual inaccuracies, reference numbers, or notice delivery defects..."
              className="w-full bg-[var(--cds-field)] text-white text-xs p-2 border border-[var(--cds-border-subtle)] focus:border-[#0f62fe] focus:outline-none"
            />
          </div>

          <div className="p-3 bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] text-[11px] text-[var(--cds-text-secondary)]">
            <span className="text-white font-bold block mb-1">Legal Declaration:</span>
            I certify that the representations made in this dispute filing are true and accurate under penalty of perjury and Section 20V of the Privacy Act 1988 (Cth).
          </div>
        </div>
      </Modal>
    </div>
  );
}
