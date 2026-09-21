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
  InlineLoading,
  DataTable,
  TableContainer,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  TextInput,
  Select,
  SelectItem,
  FileUploader
} from '@carbon/react';
import {
  Search,
  Time,
  Renew,
  Play,
  Catalog,
  CheckmarkOutline,
  Warning,
  Error as ErrorIcon,
  Locked,
  DocumentView,
  Analytics
} from '@carbon/icons-react';

export default function AnalystWorkspace() {
  // Navigation / Tab state
  const [selectedTab, setSelectedTab] = useState(0);

  // 1. Dispute Queue state
  const [disputes, setDisputes] = useState<any[]>([]);
  const [loadingDisputes, setLoadingDisputes] = useState(true);
  const [disputeError, setDisputeError] = useState<string | null>(null);

  // 2. File Investigation state
  const [entityIdInput, setEntityIdInput] = useState('IND-8842-1994');
  const [asOfDateInput, setAsOfDateInput] = useState('2024-06-01');
  const [investigationData, setInvestigationData] = useState<any>(null);
  const [loadingInvestigation, setLoadingInvestigation] = useState(false);
  const [investigationError, setInvestigationError] = useState<string | null>(null);

  // 3. Back-Testing state
  const [models, setModels] = useState<any[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string>('');
  const [obsDate, setObsDate] = useState('2024-06-01');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [runningBacktest, setRunningBacktest] = useState(false);
  const [backtestResults, setBacktestResults] = useState<any>(null);
  const [backtestError, setBacktestError] = useState<string | null>(null);

  // Fetch initial disputes and models
  useEffect(() => {
    fetchDisputes();
    fetchModels();
  }, []);

  const fetchDisputes = async () => {
    setLoadingDisputes(true);
    setDisputeError(null);
    try {
      const res = await fetch('http://localhost:8000/api/disputes');
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: Failed to load dispute queue`);
      }
      const data = await res.json();
      setDisputes(data);
    } catch (err: any) {
      setDisputeError(err.message || 'Unable to connect to dispute service');
    } finally {
      setLoadingDisputes(false);
    }
  };

  const fetchModels = async () => {
    try {
      const res = await fetch('http://localhost:8000/api/admin/models');
      if (res.ok) {
        const data = await res.json();
        setModels(data);
        if (data.length > 0 && !selectedModelId) {
          setSelectedModelId(data[0].id);
        }
      }
    } catch (err) {
      // Handled gracefully in UI
    }
  };

  const runInvestigation = async () => {
    if (!entityIdInput.trim()) return;
    setLoadingInvestigation(true);
    setInvestigationError(null);
    setInvestigationData(null);
    try {
      const url = `http://localhost:8000/api/reports/${encodeURIComponent(entityIdInput.trim())}${
        asOfDateInput ? `?as_of=${encodeURIComponent(asOfDateInput)}` : ''
      }`;
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: Subject entity not found or inaccessible`);
      }
      const data = await res.json();
      setInvestigationData(data);
    } catch (err: any) {
      setInvestigationError(err.message || 'Failed to reconstruct historical file');
    } finally {
      setLoadingInvestigation(false);
    }
  };

  const triggerBacktest = async () => {
    setRunningBacktest(true);
    setBacktestError(null);
    setBacktestResults(null);

    try {
      const modelParam = selectedModelId || (models[0]?.id ?? 'v1');
      const queryParams = new URLSearchParams({
        model_id: modelParam,
        observation_date: obsDate || '2024-06-01'
      });

      let res: Response;
      if (uploadedFile) {
        const formData = new FormData();
        formData.append('file', uploadedFile);
        res = await fetch(`http://localhost:8000/api/admin/backtest?${queryParams.toString()}`, {
          method: 'POST',
          body: formData
        });
      } else {
        res = await fetch(`http://localhost:8000/api/admin/backtest?${queryParams.toString()}`, {
          method: 'POST'
        });
      }

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.detail || `Backtest failed with status ${res.status}`);
      }

      const data = await res.json();
      setBacktestResults(data);
    } catch (err: any) {
      setBacktestError(err.message || 'Backtest simulation failed');
    } finally {
      setRunningBacktest(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f4f4f4] text-[#161616]">
      {/* Enterprise Sub-Header */}
      <div className="bg-[#161616] text-[#f4f4f4] px-6 py-4 border-b border-[#393939]">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <Breadcrumb noTrailingSlash className="mb-1 text-[#c6c6c6]">
              <BreadcrumbItem href="/">Home</BreadcrumbItem>
              <BreadcrumbItem href="/analyst" isCurrentPage>
                Analyst Workspace
              </BreadcrumbItem>
            </Breadcrumb>
            <h1 className="text-xl font-semibold tracking-tight text-white flex items-center gap-3">
              Credit Bureau Analyst Workspace
              <Tag type="teal" size="sm">
                ROLE: ANALYST
              </Tag>
            </h1>
            <p className="text-xs text-[#8d8d8d] mt-1 font-mono">
              Privacy Act 1988 Part IIIA • Bitemporal Reconstruction • Discrimination & Backtesting Engine
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="bg-[#262626] border border-[#525252] px-3 py-1.5 text-xs text-[#c6c6c6] flex items-center gap-2">
              <Locked size={14} className="text-[#f1c21b]" />
              <span>Model Activation & User Management: <strong>Admin Only</strong></span>
            </div>
            <Button
              kind="secondary"
              size="sm"
              renderIcon={Renew}
              onClick={() => {
                fetchDisputes();
                fetchModels();
              }}
            >
              Refresh Data
            </Button>
          </div>
        </div>
      </div>

      {/* Main Workspace Area */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        <Tabs selectedIndex={selectedTab} onChange={({ selectedIndex }) => setSelectedTab(selectedIndex)}>
          <TabList aria-label="Analyst Workspace Navigation" contained>
            <Tab renderIcon={DocumentView}>Part IIIA Dispute Queue</Tab>
            <Tab renderIcon={Time}>Historical File Investigation</Tab>
            <Tab renderIcon={Analytics}>Model Back-Testing & Discrimination</Tab>
          </TabList>

          <TabPanels>
            {/* PANEL 1: Dispute Queue */}
            <TabPanel>
              <div className="bg-white border border-[#e0e0e0] p-6 mt-4">
                <div className="flex justify-between items-center mb-4">
                  <div>
                    <h2 className="text-base font-semibold text-[#161616]">
                      Statutory Dispute Intake & SLA Tracker
                    </h2>
                    <p className="text-xs text-[#525252] mt-0.5">
                      Privacy Act 1988 Part IIIA Section 20V mandates strict 30-calendar-day resolution.
                    </p>
                  </div>
                  <Tag type="purple" size="md">
                    Active Disputes: {disputes.filter((d) => d.status === 'OPEN').length}
                  </Tag>
                </div>

                {disputeError && (
                  <InlineNotification
                    kind="error"
                    title="Queue Error: "
                    subtitle={disputeError}
                    className="mb-4"
                  />
                )}

                {loadingDisputes ? (
                  <div className="py-12 flex justify-center items-center">
                    <InlineLoading description="Loading dispute filings from bitemporal ledger..." />
                  </div>
                ) : disputes.length === 0 ? (
                  <div className="py-12 text-center text-[#6f6f6f] border border-dashed border-[#d1d1d1]">
                    <CheckmarkOutline size={32} className="mx-auto mb-2 text-[#24a148]" />
                    <p className="font-semibold">No Pending Disputes</p>
                    <p className="text-xs mt-1">All statutory investigations have been resolved or closed.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-[#f4f4f4] border-b border-[#e0e0e0] text-[#161616] font-semibold">
                          <th className="p-3">Dispute ID</th>
                          <th className="p-3">Subject / Entity</th>
                          <th className="p-3">Contested Listing</th>
                          <th className="p-3">Grounds / Notes</th>
                          <th className="p-3">Filing Date</th>
                          <th className="p-3">Statutory SLA</th>
                          <th className="p-3">Status</th>
                          <th className="p-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {disputes.map((d) => (
                          <tr key={d.id} className="border-b border-[#e0e0e0] hover:bg-[#f9f9f9]">
                            <td className="p-3 font-mono font-medium text-[#0f62fe]">{d.id}</td>
                            <td className="p-3">
                              <div className="font-semibold text-[#161616]">{d.subject_name || d.entity_id}</div>
                              <div className="text-[11px] text-[#6f6f6f] font-mono">{d.entity_id}</div>
                            </td>
                            <td className="p-3 font-mono text-[#161616]">{d.target_listing}</td>
                            <td className="p-3 max-w-xs truncate text-[#525252]" title={d.grounds}>
                              {d.grounds}
                            </td>
                            <td className="p-3 font-mono">{d.filed_date}</td>
                            <td className="p-3">
                              {d.status === 'OPEN' ? (
                                <Tag type={d.days_remaining <= 10 ? 'red' : 'magenta'} size="sm">
                                  {d.days_remaining} Days Left
                                </Tag>
                              ) : (
                                <Tag type="cool-gray" size="sm">
                                  Resolved
                                </Tag>
                              )}
                            </td>
                            <td className="p-3">
                              <Tag type={d.status === 'OPEN' ? 'purple' : 'green'} size="sm">
                                {d.status}
                              </Tag>
                            </td>
                            <td className="p-3 text-right">
                              <Button
                                kind="ghost"
                                size="sm"
                                onClick={() => {
                                  setEntityIdInput(d.entity_id);
                                  setSelectedTab(1);
                                  runInvestigation();
                                }}
                              >
                                Investigate File
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </TabPanel>

            {/* PANEL 2: Historical File Investigation */}
            <TabPanel>
              <div className="bg-white border border-[#e0e0e0] p-6 mt-4">
                <div className="mb-6">
                  <h2 className="text-base font-semibold text-[#161616]">
                    Bitemporal Point-in-Time Credit File Reconstitution
                  </h2>
                  <p className="text-xs text-[#525252] mt-0.5">
                    Query subject credit records as they existed at a specific historical date (valid_from &le; as_of AND recorded_at &le; as_of).
                  </p>
                </div>

                {/* Scrubber Controls */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-[#f4f4f4] border border-[#e0e0e0] mb-6">
                  <div>
                    <label htmlFor="entity-id-input" className="block text-xs font-semibold text-[#525252] mb-1">
                      Entity Identifier
                    </label>
                    <TextInput
                      id="entity-id-input"
                      labelText=""
                      placeholder="e.g. IND-8842-1994 or CMP-4019-2020"
                      value={entityIdInput}
                      onChange={(e) => setEntityIdInput(e.target.value)}
                      size="md"
                    />
                  </div>
                  <div>
                    <label htmlFor="as-of-date-input" className="block text-xs font-semibold text-[#525252] mb-1">
                      As-Of Observation Date (YYYY-MM-DD)
                    </label>
                    <TextInput
                      id="as-of-date-input"
                      labelText=""
                      placeholder="YYYY-MM-DD"
                      value={asOfDateInput}
                      onChange={(e) => setAsOfDateInput(e.target.value)}
                      size="md"
                    />
                  </div>
                  <div className="flex items-end">
                    <Button
                      kind="primary"
                      renderIcon={Search}
                      onClick={runInvestigation}
                      disabled={loadingInvestigation || !entityIdInput}
                      className="w-full"
                    >
                      {loadingInvestigation ? 'Reconstituting...' : 'Reconstruct File'}
                    </Button>
                  </div>
                </div>

                {investigationError && (
                  <InlineNotification
                    kind="error"
                    title="Audit Error: "
                    subtitle={investigationError}
                    className="mb-4"
                  />
                )}

                {loadingInvestigation ? (
                  <div className="py-12 flex justify-center items-center">
                    <InlineLoading description="Executing bitemporal ledger slice across valid_from and recorded_at axes..." />
                  </div>
                ) : investigationData ? (
                  <div className="space-y-6">
                    {/* Reconstituted Summary Header */}
                    <div className="border border-[#e0e0e0] p-4 bg-[#fafafa] flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-bold text-[#161616]">
                            {investigationData.subject_name || investigationData.entity_id}
                          </span>
                          <Tag type="cyan" size="sm">
                            {investigationData.entity_type}
                          </Tag>
                          <Tag type="purple" size="sm">
                            As Of: {investigationData.as_of_date || 'Current Date'}
                          </Tag>
                        </div>
                        <div className="text-xs text-[#525252] font-mono mt-1">
                          Subject ID: {investigationData.entity_id} • Score Model:{' '}
                          {investigationData.score?.model_name || 'CCR Baseline v1'}
                        </div>
                      </div>

                      <div className="flex items-center gap-6">
                        <div className="text-right">
                          <div className="text-xs text-[#6f6f6f] uppercase font-semibold">Point-in-Time Score</div>
                          <div className="text-3xl font-mono font-bold text-[#0f62fe]">
                            {investigationData.score?.score ?? 'N/A'}
                          </div>
                        </div>
                        <Tag
                          type={
                            investigationData.score?.band === 'Excellent'
                              ? 'green'
                              : investigationData.score?.band === 'Great'
                              ? 'teal'
                              : investigationData.score?.band === 'Good'
                              ? 'blue'
                              : investigationData.score?.band === 'Fair'
                              ? 'warm-gray'
                              : 'red'
                          }
                          size="md"
                        >
                          {investigationData.score?.band ?? 'Unscored'}
                        </Tag>
                      </div>
                    </div>

                    {/* Active Records as of slice */}
                    <div>
                      <h3 className="text-sm font-semibold text-[#161616] mb-2 flex items-center justify-between">
                        <span>Ledger Records Active As Of {investigationData.as_of_date || 'Today'}</span>
                        <span className="text-xs text-[#6f6f6f] font-normal">
                          {investigationData.ledger_records?.length || 0} Records
                        </span>
                      </h3>

                      {(!investigationData.ledger_records || investigationData.ledger_records.length === 0) ? (
                        <div className="p-4 text-xs text-[#6f6f6f] border border-dashed border-[#d1d1d1]">
                          No ledger records existed or were effective as of {investigationData.as_of_date}.
                        </div>
                      ) : (
                        <div className="overflow-x-auto border border-[#e0e0e0]">
                          <table className="w-full text-left text-xs border-collapse">
                            <thead>
                              <tr className="bg-[#f4f4f4] border-b border-[#e0e0e0] font-semibold text-[#161616]">
                                <th className="p-2.5">Record ID</th>
                                <th className="p-2.5">Type</th>
                                <th className="p-2.5">Provider</th>
                                <th className="p-2.5">Amount</th>
                                <th className="p-2.5">Valid From</th>
                                <th className="p-2.5">Recorded At</th>
                                <th className="p-2.5">Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {investigationData.ledger_records.map((r: any) => (
                                <tr key={r.id} className="border-b border-[#e0e0e0] hover:bg-[#f9f9f9]">
                                  <td className="p-2.5 font-mono text-[#0f62fe]">{r.id}</td>
                                  <td className="p-2.5 font-semibold">{r.record_type}</td>
                                  <td className="p-2.5">{r.provider_id || 'N/A'}</td>
                                  <td className="p-2.5 font-mono">
                                    {r.amount ? `$${Number(r.amount).toLocaleString()}` : '-'}
                                  </td>
                                  <td className="p-2.5 font-mono">{r.valid_from}</td>
                                  <td className="p-2.5 font-mono text-[#525252]">{r.recorded_at}</td>
                                  <td className="p-2.5">
                                    <Tag
                                      type={
                                        r.status === 'ACTIVE'
                                          ? 'blue'
                                          : r.status === 'PAID'
                                          ? 'green'
                                          : r.status === 'RESOLVED'
                                          ? 'teal'
                                          : 'cool-gray'
                                      }
                                      size="sm"
                                    >
                                      {r.status}
                                    </Tag>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    {/* Enquiry History */}
                    <div>
                      <h3 className="text-sm font-semibold text-[#161616] mb-2 flex items-center justify-between">
                        <span>Enquiry Log (Access History)</span>
                        <span className="text-xs text-[#6f6f6f] font-normal">
                          {investigationData.enquiries?.length || 0} Inquiries Logged
                        </span>
                      </h3>

                      {(!investigationData.enquiries || investigationData.enquiries.length === 0) ? (
                        <div className="p-4 text-xs text-[#6f6f6f] border border-dashed border-[#d1d1d1]">
                          No commercial or personal enquiries on file as of this date.
                        </div>
                      ) : (
                        <div className="overflow-x-auto border border-[#e0e0e0]">
                          <table className="w-full text-left text-xs border-collapse">
                            <thead>
                              <tr className="bg-[#f4f4f4] border-b border-[#e0e0e0] font-semibold text-[#161616]">
                                <th className="p-2.5">Enquiry ID</th>
                                <th className="p-2.5">Date & Time</th>
                                <th className="p-2.5">Enquiring Entity</th>
                                <th className="p-2.5">Purpose / Loan Type</th>
                                <th className="p-2.5">Amount</th>
                              </tr>
                            </thead>
                            <tbody>
                              {investigationData.enquiries.map((e: any) => (
                                <tr key={e.id} className="border-b border-[#e0e0e0] hover:bg-[#f9f9f9]">
                                  <td className="p-2.5 font-mono text-[#0f62fe]">{e.id}</td>
                                  <td className="p-2.5 font-mono">{e.created_at}</td>
                                  <td className="p-2.5 font-semibold">{e.enquirer_name || e.provider_id || 'Bureau Audit'}</td>
                                  <td className="p-2.5">{e.purpose || 'Credit Assessment (s20E)'}</td>
                                  <td className="p-2.5 font-mono">
                                    {e.amount ? `$${Number(e.amount).toLocaleString()}` : '-'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="py-12 text-center text-[#6f6f6f] border border-dashed border-[#d1d1d1]">
                    <Search size={32} className="mx-auto mb-2 text-[#8d8d8d]" />
                    <p className="font-semibold">Enter Subject ID and Observation Date</p>
                    <p className="text-xs mt-1">
                      Execute a historical point-in-time reconstruction to audit scores, dispute validity, or notice timing.
                    </p>
                  </div>
                )}
              </div>
            </TabPanel>

            {/* PANEL 3: Back-Testing & Discrimination */}
            <TabPanel>
              <div className="bg-white border border-[#e0e0e0] p-6 mt-4 space-y-6">
                <div>
                  <h2 className="text-base font-semibold text-[#161616]">
                    Credit Risk Model Discrimination & Calibration Engine
                  </h2>
                  <p className="text-xs text-[#525252] mt-0.5">
                    Evaluate predictive accuracy against empirical default outcomes. Computes ROC AUC, Gini index (2 * AUC - 1), Kolmogorov-Smirnov separation, and decile calibration.
                  </p>
                </div>

                {/* Backtest Configuration */}
                <div className="p-4 bg-[#f4f4f4] border border-[#e0e0e0] grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                  <div>
                    <label htmlFor="model-select" className="block text-xs font-semibold text-[#525252] mb-1">
                      Target Model Version
                    </label>
                    <Select
                      id="model-select"
                      labelText=""
                      value={selectedModelId}
                      onChange={(e) => setSelectedModelId(e.target.value)}
                      size="md"
                    >
                      {models.map((m) => (
                        <SelectItem key={m.id} value={m.id} text={`${m.name} (${m.type})`} />
                      ))}
                      {models.length === 0 && <SelectItem value="baseline" text="Baseline CCR Model v1.0" />}
                    </Select>
                  </div>

                  <div>
                    <label htmlFor="obs-date-input" className="block text-xs font-semibold text-[#525252] mb-1">
                      Observation Date
                    </label>
                    <TextInput
                      id="obs-date-input"
                      labelText=""
                      placeholder="YYYY-MM-DD"
                      value={obsDate}
                      onChange={(e) => setObsDate(e.target.value)}
                      size="md"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#525252] mb-1">
                      Outcomes CSV (entity_id, outcome_date, defaulted)
                    </label>
                    <input
                      type="file"
                      accept=".csv"
                      aria-label="Upload Outcomes CSV"
                      onChange={(e) => {
                        if (e.target.files && e.target.files.length > 0) {
                          setUploadedFile(e.target.files[0]);
                        }
                      }}
                      className="text-xs text-[#525252] file:mr-2 file:py-1.5 file:px-3 file:border file:border-[#8d8d8d] file:text-xs file:bg-white file:text-[#161616] cursor-pointer"
                    />
                  </div>

                  <div>
                    <Button
                      kind="primary"
                      renderIcon={Play}
                      onClick={triggerBacktest}
                      disabled={runningBacktest}
                      className="w-full"
                    >
                      {runningBacktest ? 'Computing...' : 'Run Discrimination Test'}
                    </Button>
                  </div>
                </div>

                {backtestError && (
                  <InlineNotification
                    kind="error"
                    title="Simulation Failed: "
                    subtitle={backtestError}
                    className="mb-4"
                  />
                )}

                {runningBacktest ? (
                  <div className="py-12 flex justify-center items-center">
                    <InlineLoading description="Scoring entities as of observation date and evaluating Mann-Whitney AUC & KS statistics..." />
                  </div>
                ) : backtestResults ? (
                  <div className="space-y-6">
                    {/* Top-line KPI Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                      <div className="p-4 border border-[#e0e0e0] bg-[#fafafa]">
                        <div className="text-xs text-[#6f6f6f] uppercase font-semibold">ROC AUC</div>
                        <div className="text-2xl font-mono font-bold text-[#0f62fe] mt-1">
                          {backtestResults.auc}
                        </div>
                        <div className="text-[11px] text-[#525252] mt-0.5">
                          {backtestResults.auc >= 0.7 ? 'Strong Discrimination' : 'Weak Discrimination'}
                        </div>
                      </div>

                      <div className="p-4 border border-[#e0e0e0] bg-[#fafafa]">
                        <div className="text-xs text-[#6f6f6f] uppercase font-semibold">Gini Coefficient</div>
                        <div className="text-2xl font-mono font-bold text-[#161616] mt-1">
                          {backtestResults.gini}
                        </div>
                        <div className="text-[11px] text-[#525252] mt-0.5">2 × AUC - 1</div>
                      </div>

                      <div className="p-4 border border-[#e0e0e0] bg-[#fafafa]">
                        <div className="text-xs text-[#6f6f6f] uppercase font-semibold">KS Statistic</div>
                        <div className="text-2xl font-mono font-bold text-[#8a3800] mt-1">
                          {backtestResults.ks_statistic}
                        </div>
                        <div className="text-[11px] text-[#525252] mt-0.5">Max CDF Separation</div>
                      </div>

                      <div className="p-4 border border-[#e0e0e0] bg-[#fafafa]">
                        <div className="text-xs text-[#6f6f6f] uppercase font-semibold">Records Evaluated</div>
                        <div className="text-2xl font-mono font-bold text-[#161616] mt-1">
                          {backtestResults.total_records}
                        </div>
                        <div className="text-[11px] text-[#525252] mt-0.5">Ground Truth Pairs</div>
                      </div>

                      <div className="p-4 border border-[#e0e0e0] bg-[#fafafa]">
                        <div className="text-xs text-[#6f6f6f] uppercase font-semibold">Model Status</div>
                        <div className="mt-1">
                          <Tag type="teal" size="md">
                            Read Only
                          </Tag>
                        </div>
                        <div className="text-[11px] text-[#525252] mt-0.5">Analyst role</div>
                      </div>
                    </div>

                    {/* Band Performance Table */}
                    <div className="border border-[#e0e0e0]">
                      <div className="p-3 bg-[#f4f4f4] border-b border-[#e0e0e0] font-semibold text-xs text-[#161616]">
                        Empirical Default Rate by Score Band
                      </div>
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-[#e0e0e0] bg-[#fafafa] font-semibold text-[#525252]">
                            <th className="p-2.5">Score Band</th>
                            <th className="p-2.5">Entity Count</th>
                            <th className="p-2.5">Observed Defaults</th>
                            <th className="p-2.5">Empirical Default Rate</th>
                          </tr>
                        </thead>
                        <tbody>
                          {backtestResults.band_performance?.map((b: any) => (
                            <tr key={b.band} className="border-b border-[#e0e0e0] hover:bg-[#f9f9f9]">
                              <td className="p-2.5 font-semibold text-[#161616]">{b.band}</td>
                              <td className="p-2.5 font-mono">{b.count}</td>
                              <td className="p-2.5 font-mono text-[#da1e28]">{b.defaults}</td>
                              <td className="p-2.5 font-mono font-bold">
                                {(b.default_rate * 100).toFixed(2)}%
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Decile Calibration Table */}
                    <div className="border border-[#e0e0e0]">
                      <div className="p-3 bg-[#f4f4f4] border-b border-[#e0e0e0] font-semibold text-xs text-[#161616]">
                        10-Decile Calibration Table (Rank Ordered Lowest to Highest Score)
                      </div>
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-[#e0e0e0] bg-[#fafafa] font-semibold text-[#525252]">
                            <th className="p-2.5">Decile</th>
                            <th className="p-2.5">Score Range</th>
                            <th className="p-2.5">Entities</th>
                            <th className="p-2.5">Defaults</th>
                            <th className="p-2.5">Observed Default Rate</th>
                          </tr>
                        </thead>
                        <tbody>
                          {backtestResults.deciles?.map((d: any) => (
                            <tr key={d.decile} className="border-b border-[#e0e0e0] hover:bg-[#f9f9f9]">
                              <td className="p-2.5 font-mono font-semibold">Decile {d.decile}</td>
                              <td className="p-2.5 font-mono">
                                {d.score_min} – {d.score_max}
                              </td>
                              <td className="p-2.5 font-mono">{d.count}</td>
                              <td className="p-2.5 font-mono text-[#da1e28]">{d.defaults}</td>
                              <td className="p-2.5 font-mono font-bold">
                                {(d.observed_default_rate * 100).toFixed(2)}%
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <InlineNotification
                      kind="info"
                      title="Governance Notice: "
                      subtitle="Under APRA CPS 220 and internal risk governance, credit analysts may run simulations and audit discrimination metrics, but only Bureau Administrators may activate models into production."
                    />
                  </div>
                ) : (
                  <div className="py-12 text-center text-[#6f6f6f] border border-dashed border-[#d1d1d1]">
                    <Analytics size={32} className="mx-auto mb-2 text-[#8d8d8d]" />
                    <p className="font-semibold">No Backtest Results Generated Yet</p>
                    <p className="text-xs mt-1">
                      Select a model version, choose an observation date, and trigger the discrimination calculation.
                    </p>
                  </div>
                )}
              </div>
            </TabPanel>
          </TabPanels>
        </Tabs>
      </div>
    </div>
  );
}
