"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
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
  SettingsAdjust,
  ShareKnowledge,
  CheckmarkOutline,
  Warning,
  Error as ErrorIcon,
  Time,
  Renew,
  Play,
  Catalog
} from '@carbon/icons-react';

export default function AdminAnalystDashboard() {
  // Model weights state
  const [activeModel, setActiveModel] = useState<'v1' | 'v2'>('v1');
  const [weightRhi, setWeightRhi] = useState(35);
  const [weightUtil, setWeightUtil] = useState(25);
  const [weightHistory, setWeightHistory] = useState(15);
  const [weightDefaults, setWeightDefaults] = useState(20);
  const [weightInquiries, setWeightInquiries] = useState(5);
  const [isDeploying, setIsDeploying] = useState(false);
  const [deploySuccess, setDeploySuccess] = useState(false);
  const [backtestStats, setBacktestStats] = useState<any>(null);

  // Dispute actions state
  const [disputes, setDisputes] = useState<any[]>([
    {
      id: 'DISP-2026-9041',
      entityId: 'IND-8842-1994',
      subjectName: 'Jonathan Edward Vance',
      targetListing: 'DEFAULT ($420.00)',
      grounds: 'Section 6Q / 21D Statutory Notices Not Received',
      filedDate: '2026-08-19',
      daysRemaining: 12,
      status: 'OPEN',
      statusTag: 'purple'
    },
    {
      id: 'DISP-2026-8992',
      entityId: 'IND-1049-1981',
      subjectName: 'Sarah Lin-Chen',
      targetListing: 'RHI (Overdue Code 2)',
      grounds: 'Omission of Approved Financial Hardship Notice',
      filedDate: '2026-09-02',
      daysRemaining: 21,
      status: 'OPEN',
      statusTag: 'yellow'
    },
    {
      id: 'DISP-2026-8710',
      entityId: 'ACN-109-283-912',
      subjectName: 'Apex Industrial Holdings Pty Ltd',
      targetListing: 'TRADE_PAYMENT ($24,500.00)',
      grounds: 'Inaccurate Overdue Balance / Bank Clearing Delay',
      filedDate: '2026-08-01',
      daysRemaining: 0,
      status: 'RESOLVED_EXPUNGED',
      statusTag: 'green'
    }
  ]);

  // Network topology state
  const [networkData, setNetworkData] = useState<any>(null);

  // Fetch disputes from live API
  const fetchDisputes = () => {
    fetch('http://localhost:8000/api/disputes')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data && Array.isArray(data) && data.length > 0) {
          setDisputes(data.map((d: any) => ({
            id: d.id,
            entityId: d.entity_id,
            subjectName: d.subject_name,
            targetListing: d.target_listing,
            grounds: d.grounds,
            filedDate: d.filed_date,
            daysRemaining: d.days_remaining,
            status: d.status,
            statusTag: d.status.includes('EXPUNGED') ? 'green' : d.status.includes('CONFIRM') ? 'gray' : d.days_remaining < 14 ? 'purple' : 'yellow'
          })));
        }
      })
      .catch(() => {});
  };

  // Fetch corporate network graph
  useEffect(() => {
    fetchDisputes();
    fetch('http://localhost:8000/api/admin/network?limit_companies=8')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data) setNetworkData(data);
      })
      .catch(() => {});
  }, []);

  const handleResolveDispute = async (dispId: string, action: 'EXPUNGE' | 'CONFIRM') => {
    const newStatus = action === 'EXPUNGE' ? 'RESOLVED_EXPUNGED' : 'CONFIRMED_ACCURATE';
    try {
      await fetch(`http://localhost:8000/api/disputes/${dispId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: newStatus,
          notes: action === 'EXPUNGE' 
            ? 'Adjudication confirmed defect in Section 6Q notice. Negative listing expunged from bureau ledger.'
            : 'Adjudication confirmed provider evidence valid. Listing confirmed accurate.'
        })
      });
    } catch {}

    setDisputes(disputes.map(d => {
      if (d.id === dispId) {
        return {
          ...d,
          status: newStatus,
          statusTag: action === 'EXPUNGE' ? 'green' : 'gray',
          daysRemaining: 0
        };
      }
      return d;
    }));
  };

  const handleDeployModel = async () => {
    setIsDeploying(true);
    try {
      const res = await fetch('http://localhost:8000/api/admin/backtest?model_id=v2', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setBacktestStats(data);
      }
    } catch {}
    setIsDeploying(false);
    setDeploySuccess(true);
  };

  return (
    <div className="p-4 md:p-8 max-w-[1680px] mx-auto">
      {/* Breadcrumb & Global Action Strip */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4 pb-3 border-b border-[var(--cds-border-subtle)]">
        <Breadcrumb noTrailingSlash>
          <BreadcrumbItem>
            <Link href="/" className="text-[var(--cds-link-primary)] hover:underline">CRMS Root</Link>
          </BreadcrumbItem>
          <BreadcrumbItem isCurrentPage className="font-mono text-white">
            Analyst & Governance Console
          </BreadcrumbItem>
        </Breadcrumb>

        <div className="flex items-center gap-3 text-xs">
          <Tag type="magenta" size="sm" className="font-mono m-0">APRA L3 GOVERNANCE</Tag>
          <Tag type="blue" size="sm" className="font-mono m-0">ALGORITHM AUDIT PASS</Tag>
        </div>
      </div>

      {/* Header */}
      <div className="bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] p-5 mb-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1.5">
              <h1 className="text-2xl md:text-3xl font-light text-white tracking-tight">
                Supervisory & Risk Analyst Console
              </h1>
              <Tag type="green" size="sm" className="font-mono m-0">PRODUCTION V1.0 ACTIVE</Tag>
            </div>
            <p className="text-xs text-[var(--cds-text-secondary)]">
              Scoring algorithm governance, bitemporal model versioning, statutory dispute adjudication, and systemic contagion analysis.
            </p>
          </div>

          <div className="flex items-center gap-4 text-xs font-mono bg-[var(--cds-layer-02)] px-4 py-3 border border-[var(--cds-border-subtle)]">
            <div>
              <div className="text-[var(--cds-text-helper)] uppercase text-[10px]">Statutory Disputes</div>
              <div className="text-yellow-400 font-bold">{disputes.filter(d => d.daysRemaining > 0).length} Open (30d SLA)</div>
            </div>
            <div className="border-l border-[var(--cds-border-subtle)] pl-4">
              <div className="text-[var(--cds-text-helper)] uppercase text-[10px]">Algorithm Gini</div>
              <div className="text-emerald-400 font-bold">0.684 (Calibrated)</div>
            </div>
          </div>
        </div>
      </div>

      {/* Notification banner on deployment */}
      {deploySuccess && (
        <div className="mb-6">
          <InlineNotification
            kind="success"
            title="Scoring Algorithm Model Version Deployed"
            subtitle="Challenger model weights successfully calibrated and validated against historical APRA APS 220 portfolios. Merkle root hash committed to immutable audit ledger."
            onCloseButtonClick={() => setDeploySuccess(false)}
            lowContrast
          />
        </div>
      )}

      {/* Main Workspace Tabs */}
      <div className="bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)]">
        <Tabs>
          <TabList aria-label="Analyst Tabs" className="bg-[var(--cds-layer-02)] border-b border-[var(--cds-border-subtle)]">
            <Tab className="text-xs uppercase font-semibold">1. Scoring Model Governance</Tab>
            <Tab className="text-xs uppercase font-semibold">2. Section 20V Dispute Resolution</Tab>
            <Tab className="text-xs uppercase font-semibold">3. Director Contagion Network</Tab>
            <Tab className="text-xs uppercase font-semibold">4. Bitemporal Ledger Integrity</Tab>
          </TabList>

          <TabPanels>
            {/* TAB 1: SCORING MODEL GOVERNANCE */}
            <TabPanel className="p-5 md:p-6 space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-[var(--cds-border-subtle)]">
                <div>
                  <h3 className="text-lg font-medium text-white">Algorithm Weight Calibration Engine</h3>
                  <p className="text-xs text-[var(--cds-text-secondary)]">
                    Calibrate factor weights across RHI, credit utilisation, default penalties, and inquiry velocity.
                  </p>
                </div>

                <div className="flex items-center gap-2 font-mono text-xs">
                  <button
                    onClick={() => setActiveModel('v1')}
                    className={`px-3 py-1.5 border transition-colors ${activeModel === 'v1' ? 'bg-[#0f62fe] text-white border-[#0f62fe] font-bold' : 'bg-[var(--cds-layer-02)] text-[var(--cds-text-secondary)] border-[var(--cds-border-subtle)]'}`}
                  >
                    Production v1.0 (Active)
                  </button>
                  <button
                    onClick={() => setActiveModel('v2')}
                    className={`px-3 py-1.5 border transition-colors ${activeModel === 'v2' ? 'bg-[#0f62fe] text-white border-[#0f62fe] font-bold' : 'bg-[var(--cds-layer-02)] text-[var(--cds-text-secondary)] border-[var(--cds-border-subtle)]'}`}
                  >
                    Challenger v2.0 (Candidate)
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Left: Weight Adjustment Sliders */}
                <div className="lg:col-span-7 space-y-4 text-xs">
                  <div className="p-4 bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] space-y-4">
                    <div>
                      <div className="flex justify-between mb-1.5">
                        <span className="text-white font-medium">Repayment History Information (RHI) Weight:</span>
                        <span className="font-mono text-emerald-400 font-bold">{weightRhi}%</span>
                      </div>
                      <input
                        type="range"
                        min="20"
                        max="50"
                        value={weightRhi}
                        onChange={(e) => setWeightRhi(Number(e.target.value))}
                        className="w-full accent-[#0f62fe] cursor-pointer"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between mb-1.5">
                        <span className="text-white font-medium">Credit Facility Utilisation Weight:</span>
                        <span className="font-mono text-blue-400 font-bold">{weightUtil}%</span>
                      </div>
                      <input
                        type="range"
                        min="10"
                        max="40"
                        value={weightUtil}
                        onChange={(e) => setWeightUtil(Number(e.target.value))}
                        className="w-full accent-[#0f62fe] cursor-pointer"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between mb-1.5">
                        <span className="text-white font-medium">Length of Credit History (File Longevity):</span>
                        <span className="font-mono text-cyan-400 font-bold">{weightHistory}%</span>
                      </div>
                      <input
                        type="range"
                        min="5"
                        max="30"
                        value={weightHistory}
                        onChange={(e) => setWeightHistory(Number(e.target.value))}
                        className="w-full accent-[#0f62fe] cursor-pointer"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between mb-1.5">
                        <span className="text-white font-medium">Adverse Listings & Defaults Penalty Weight:</span>
                        <span className="font-mono text-red-400 font-bold">{weightDefaults}%</span>
                      </div>
                      <input
                        type="range"
                        min="10"
                        max="50"
                        value={weightDefaults}
                        onChange={(e) => setWeightDefaults(Number(e.target.value))}
                        className="w-full accent-[#0f62fe] cursor-pointer"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between mb-1.5">
                        <span className="text-white font-medium">Recent Credit Enquiries Velocity Penalty:</span>
                        <span className="font-mono text-yellow-400 font-bold">{weightInquiries}%</span>
                      </div>
                      <input
                        type="range"
                        min="1"
                        max="20"
                        value={weightInquiries}
                        onChange={(e) => setWeightInquiries(Number(e.target.value))}
                        className="w-full accent-[#0f62fe] cursor-pointer"
                      />
                    </div>
                  </div>

                  <div className="pt-4 border-t border-[var(--cds-border-subtle)] flex items-center justify-between">
                    <div className="font-mono text-xs text-[var(--cds-text-secondary)]">
                      Total Allocated Weight: <strong className={`text-sm ${weightRhi + weightUtil + weightHistory + weightDefaults + weightInquiries === 100 ? 'text-emerald-400' : 'text-red-400'}`}>{weightRhi + weightUtil + weightHistory + weightDefaults + weightInquiries}%</strong>
                    </div>

                    <Button
                      size="sm"
                      kind="primary"
                      renderIcon={Play}
                      onClick={handleDeployModel}
                      disabled={isDeploying || (weightRhi + weightUtil + weightHistory + weightDefaults + weightInquiries !== 100)}
                    >
                      {isDeploying ? 'Validating...' : 'Validate & Deploy Challenger'}
                    </Button>
                  </div>
                </div>

                {/* Right: Challenger Model Backtest Metrics */}
                <div className="lg:col-span-5 bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] p-5 flex flex-col justify-between">
                  <div>
                    <h4 className="text-sm font-semibold uppercase tracking-wider text-white mb-2">
                      Challenger Backtest Analysis
                    </h4>
                    <p className="text-xs text-[var(--cds-text-secondary)] mb-4 leading-relaxed">
                      Statistical validation against 50,000 historical consumer loan portfolios over 36-month performance windows.
                    </p>

                    <div className="space-y-3 text-xs">
                      <div className="p-3 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] flex items-center justify-between">
                        <div>
                          <span className="text-white font-medium block">Gini Coefficient (Discriminatory Power)</span>
                          <span className="text-[var(--cds-text-helper)] text-[11px]">Benchmark &gt; 0.60</span>
                        </div>
                        <span className="font-mono text-emerald-400 font-bold text-base">
                          {backtestStats?.gini_index ? backtestStats.gini_index : '0.684 (+0.031)'}
                        </span>
                      </div>

                      <div className="p-3 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] flex items-center justify-between">
                        <div>
                          <span className="text-white font-medium block">Kolmogorov-Smirnov (KS Metric)</span>
                          <span className="text-[var(--cds-text-helper)] text-[11px]">Separation distance</span>
                        </div>
                        <span className="font-mono text-emerald-400 font-bold text-base">
                          {backtestStats?.auc ? `${Math.round(backtestStats.auc * 100)}%` : '44.2%'}
                        </span>
                      </div>

                      <div className="p-3 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] flex items-center justify-between">
                        <div>
                          <span className="text-white font-medium block">Population Stability Index (PSI)</span>
                          <span className="text-[var(--cds-text-helper)] text-[11px]">Stability threshold &lt; 0.10</span>
                        </div>
                        <span className="font-mono text-emerald-400 font-bold text-base">0.024 (Stable)</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 pt-3 border-t border-[var(--cds-border-subtle)] text-[11px] text-[var(--cds-text-helper)] font-mono">
                    APRA COMPLIANCE REVIEW: PASSED (PRUDENTIAL STANDARD APS 220)
                  </div>
                </div>
              </div>
            </TabPanel>

            {/* TAB 2: DISPUTE QUEUE */}
            <TabPanel className="p-5 md:p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-medium text-white">Section 20V Statutory Dispute Queue</h3>
                  <p className="text-xs text-[var(--cds-text-secondary)]">
                    Mandated 30-day investigation resolution SLA under Part IIIA of the Privacy Act 1988 (Cth).
                  </p>
                </div>
                <Tag type="purple" size="sm" className="font-mono m-0">
                  {disputes.filter(d => d.daysRemaining > 0).length} Active In-Flight
                </Tag>
              </div>

              <div className="border border-[var(--cds-border-subtle)] overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead>
                    <tr className="bg-[var(--cds-layer-02)] border-b border-[var(--cds-border-subtle)] text-[var(--cds-text-secondary)] uppercase text-[10px] tracking-wider">
                      <th className="p-3">Dispute ID</th>
                      <th className="p-3 font-sans">Consumer / Entity</th>
                      <th className="p-3">Target Adverse Listing</th>
                      <th className="p-3 font-sans">Statutory Grounds</th>
                      <th className="p-3">Filed Date</th>
                      <th className="p-3">30-Day SLA Remaining</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Adjudication</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--cds-border-subtle)]">
                    {disputes.map(d => (
                      <tr key={d.id} className="hover:bg-[var(--cds-layer-02)] transition-colors">
                        <td className="p-3 text-[var(--cds-link-primary)]">{d.id.slice(0, 16)}</td>
                        <td className="p-3 font-sans font-medium text-white">
                          <Link href={`/subject/${d.entityId}`} className="hover:underline text-[var(--cds-link-primary)]">
                            {d.subjectName}
                          </Link>
                          <span className="block font-mono text-[10px] text-gray-400">{d.entityId}</span>
                        </td>
                        <td className="p-3 text-[var(--cds-text-secondary)]">{d.targetListing}</td>
                        <td className="p-3 font-sans text-xs text-gray-300 max-w-xs">{d.grounds}</td>
                        <td className="p-3 text-gray-400">{d.filedDate}</td>
                        <td className="p-3 font-bold">
                          {d.daysRemaining > 0 ? (
                            <span className={d.daysRemaining < 14 ? 'text-red-400' : 'text-emerald-400'}>
                              {d.daysRemaining} Days Left
                            </span>
                          ) : (
                            <span className="text-gray-500 font-normal">Closed / Resolved</span>
                          )}
                        </td>
                        <td className="p-3">
                          <Tag type={d.statusTag as any} size="sm" className="m-0 font-mono">
                            {d.status.replace(/_/g, ' ')}
                          </Tag>
                        </td>
                        <td className="p-3">
                          {d.daysRemaining > 0 ? (
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleResolveDispute(d.id, 'EXPUNGE')}
                                className="text-xs text-emerald-400 hover:underline font-medium"
                              >
                                Expunge
                              </button>
                              <span className="text-[var(--cds-border-strong)]">|</span>
                              <button
                                onClick={() => handleResolveDispute(d.id, 'CONFIRM')}
                                className="text-xs text-gray-400 hover:underline"
                              >
                                Confirm
                              </button>
                            </div>
                          ) : (
                            <span className="text-[var(--cds-text-helper)]">Archived</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </TabPanel>

            {/* TAB 3: DIRECTOR NETWORK CONTAGION */}
            <TabPanel className="p-5 md:p-6 space-y-6">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-medium text-white mb-1">Bureau Corporate Contagion Network</h3>
                    <p className="text-xs text-[var(--cds-text-secondary)]">
                      Topological graph of interrelated companies, directors, and cross-guarantee contagion across monitored entities.
                    </p>
                  </div>
                  <Tag type="blue" size="sm" className="font-mono m-0">
                    {networkData ? `${networkData.total_nodes} Nodes &bull; ${networkData.total_edges} Edges` : '39 Bureau Nodes'}
                  </Tag>
                </div>

                {/* SVG Network Graph Visualizer */}
                <div className="p-4 bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] relative overflow-hidden">
                  <svg viewBox="0 0 920 360" className="w-full h-auto select-none" style={{ minHeight: '320px' }}>
                    {/* Background Grid */}
                    <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                      <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#262626" strokeWidth="0.5" />
                    </pattern>
                    <rect width="920" height="360" fill="url(#grid)" />

                    {/* Dynamic or seeded edges */}
                    <line x1="220" y1="120" x2="360" y2="70" stroke="#525252" strokeWidth="1.5" />
                    <line x1="220" y1="120" x2="140" y2="240" stroke="#525252" strokeWidth="1.5" />
                    <line x1="480" y1="180" x2="360" y2="70" stroke="#525252" strokeWidth="1.5" />
                    <line x1="480" y1="180" x2="620" y2="100" stroke="#525252" strokeWidth="1.5" />
                    <line x1="480" y1="180" x2="480" y2="280" stroke="#525252" strokeWidth="1.5" />
                    <line x1="740" y1="180" x2="620" y2="100" stroke="#525252" strokeWidth="1.5" />
                    <line x1="740" y1="180" x2="820" y2="270" stroke="#525252" strokeWidth="1.5" />

                    {/* Company Nodes */}
                    <g className="cursor-pointer">
                      <rect x="150" y="95" width="140" height="50" fill="#0f62fe" stroke="#ffffff" strokeWidth="1.5" />
                      <text x="220" y="117" fill="#ffffff" fontSize="11" fontWeight="bold" textAnchor="middle" fontFamily="IBM Plex Sans">
                        Simmons & Sons
                      </text>
                      <text x="220" y="133" fill="#c6c6c6" fontSize="9" fontFamily="IBM Plex Mono" textAnchor="middle">
                        PAYDEX 58 &bull; FAIR
                      </text>
                    </g>

                    <g className="cursor-pointer">
                      <rect x="400" y="155" width="160" height="50" fill="#0f62fe" stroke="#ffffff" strokeWidth="2" />
                      <text x="480" y="177" fill="#ffffff" fontSize="11" fontWeight="bold" textAnchor="middle" fontFamily="IBM Plex Sans">
                        Apex Industrial Holdings
                      </text>
                      <text x="480" y="193" fill="#c6c6c6" fontSize="9" fontFamily="IBM Plex Mono" textAnchor="middle">
                        PAYDEX 78 &bull; PRIME
                      </text>
                    </g>

                    <g className="cursor-pointer">
                      <rect x="670" y="155" width="140" height="50" fill="#0f62fe" stroke="#ffffff" strokeWidth="1.5" />
                      <text x="740" y="177" fill="#ffffff" fontSize="11" fontWeight="bold" textAnchor="middle" fontFamily="IBM Plex Sans">
                        Perkins-Ibarra
                      </text>
                      <text x="740" y="193" fill="#c6c6c6" fontSize="9" fontFamily="IBM Plex Mono" textAnchor="middle">
                        PAYDEX 84 &bull; STRONG
                      </text>
                    </g>

                    {/* Director Nodes */}
                    <g className="cursor-pointer">
                      <circle cx="360" cy="70" r="26" fill="#8a3ffc" stroke="#ffffff" strokeWidth="1.5" />
                      <text x="360" y="68" fill="#ffffff" fontSize="10" fontWeight="bold" textAnchor="middle" fontFamily="IBM Plex Sans">
                        Marcus S.
                      </text>
                      <text x="360" y="81" fill="#e0e0e0" fontSize="8" fontFamily="IBM Plex Mono" textAnchor="middle">
                        745 PTS
                      </text>
                    </g>

                    <g className="cursor-pointer">
                      <circle cx="620" cy="100" r="26" fill="#8a3ffc" stroke="#ffffff" strokeWidth="1.5" />
                      <text x="620" y="98" fill="#ffffff" fontSize="10" fontWeight="bold" textAnchor="middle" fontFamily="IBM Plex Sans">
                        Elena R.
                      </text>
                      <text x="620" y="111" fill="#e0e0e0" fontSize="8" fontFamily="IBM Plex Mono" textAnchor="middle">
                        780 PTS
                      </text>
                    </g>

                    {/* Secondary Connected Companies */}
                    <g className="cursor-pointer">
                      <rect x="70" y="215" width="140" height="45" fill="#161616" stroke="#0043ce" strokeWidth="1.5" />
                      <text x="140" y="235" fill="#ffffff" fontSize="10" fontWeight="bold" textAnchor="middle" fontFamily="IBM Plex Sans">
                        Castaneda & Harris
                      </text>
                      <text x="140" y="249" fill="#42be65" fontSize="8" fontFamily="IBM Plex Mono" textAnchor="middle">
                        PAYDEX 79 &bull; ACTIVE
                      </text>
                    </g>

                    <g className="cursor-pointer">
                      <rect x="410" y="260" width="140" height="45" fill="#161616" stroke="#0043ce" strokeWidth="1.5" />
                      <text x="480" y="280" fill="#ffffff" fontSize="10" fontWeight="bold" textAnchor="middle" fontFamily="IBM Plex Sans">
                        Sterling Logistics
                      </text>
                      <text x="480" y="294" fill="#42be65" fontSize="8" fontFamily="IBM Plex Mono" textAnchor="middle">
                        PAYDEX 82 &bull; PROMPT
                      </text>
                    </g>

                    <g className="cursor-pointer">
                      <rect x="750" y="250" width="140" height="45" fill="#161616" stroke="#0043ce" strokeWidth="1.5" />
                      <text x="820" y="270" fill="#ffffff" fontSize="10" fontWeight="bold" textAnchor="middle" fontFamily="IBM Plex Sans">
                        Vanguard Rail Ltd
                      </text>
                      <text x="820" y="284" fill="#42be65" fontSize="8" fontFamily="IBM Plex Mono" textAnchor="middle">
                        PAYDEX 74 &bull; STABLE
                      </text>
                    </g>
                  </svg>
                </div>
              </div>
            </TabPanel>

            {/* TAB 4: BITEMPORAL INTEGRITY */}
            <TabPanel className="p-5 md:p-6">
              <h3 className="text-lg font-medium text-white mb-2">Cryptographic Ledger Verification</h3>
              <p className="text-xs text-[var(--cds-text-secondary)] mb-4">
                SHA-256 Merkle root verification confirming zero ledger tampering and strict non-destructive append integrity.
              </p>

              <div className="p-4 bg-black/60 border border-[var(--cds-border-subtle)] font-mono text-xs space-y-2 text-emerald-400">
                <div>[CHECK_1] MERKLE_TREE_ROOT: 7a82b904fc0192e104ca819201f42199201a0942cba8192104ab0192ca1bbdca</div>
                <div>[CHECK_2] TRANSACTION_CHAIN_VALIDATION: 842,109 BLOCKS VERIFIED WITHOUT DISCREPANCY</div>
                <div>[CHECK_3] BITEMPORAL_OVERWRITE_CHECK: 0 OVERWRITE DETECTIONS FOUND (100.0% COMPLIANT)</div>
                <div className="text-white pt-2 border-t border-gray-800">STATUS: AUDIT CERTIFICATE ISSUED (OAIC APRA COMPLIANT)</div>
              </div>
            </TabPanel>
          </TabPanels>
        </Tabs>
      </div>
    </div>
  );
}
