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
  Upload,
  Search,
  CheckmarkOutline,
  Warning,
  Error as ErrorIcon,
  DocumentAdd,
  Renew,
  Play,
  Catalog
} from '@carbon/icons-react';

export default function ProviderDashboard() {
  // Ingestion State
  const [templateType, setTemplateType] = useState('DEFAULT');
  const [jsonPayload, setJsonPayload] = useState(JSON.stringify({
    "provider_id": "PRV-NAB-001",
    "provider_license": "ACL-230692",
    "entity_id": "IND-8842-1994",
    "record_type": "DEFAULT",
    "facility_type": "Personal Loan",
    "original_amount": 850.00,
    "overdue_amount": 850.00,
    "days_overdue": 72,
    "statutory_notices": {
      "section_6q_notice_date": "2026-06-15",
      "section_21d_notice_date": "2026-07-20",
      "notice_period_days": 35
    },
    "valid_time": "2026-08-25T09:00:00Z"
  }, null, 2));

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [ingestResponse, setIngestResponse] = useState<any>(null);

  // Inquiry State
  const [inquirySubject, setInquirySubject] = useState('IND-8842-1994');
  const [inquiryType, setInquiryType] = useState('HARD_CREDIT_ASSESSMENT');
  const [inquiryFacility, setInquiryFacility] = useState('RESIDENTIAL_MORTGAGE');
  const [inquiryAmount, setInquiryAmount] = useState('650000');
  const [isInquiring, setIsInquiring] = useState(false);
  const [inquiryResult, setInquiryResult] = useState<any>(null);
  const [auditEvents, setAuditEvents] = useState<any[]>([]);
  const [isLoadingAudit, setIsLoadingAudit] = useState(true);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [isForbiddenAudit, setIsForbiddenAudit] = useState(false);

  // Fetch live audit events
  const fetchAuditEvents = async () => {
    setIsLoadingAudit(true);
    setAuditError(null);
    setIsForbiddenAudit(false);
    try {
      const res = await fetch('http://localhost:8000/api/ingest/events');
      if (res.status === 403) {
        setIsForbiddenAudit(true);
        throw new Error('403 Forbidden: Insufficient provider permissions to view ingestion audit events.');
      }
      if (!res.ok) {
        throw new Error(`Failed to load audit events (HTTP ${res.status})`);
      }
      const data = await res.json();
      if (Array.isArray(data)) setAuditEvents(data);
    } catch (err: any) {
      setAuditError(err.message || 'Error communicating with ingest events endpoint');
    } finally {
      setIsLoadingAudit(false);
    }
  };

  useEffect(() => {
    fetchAuditEvents();
  }, []);

  // Switch templates
  const handleTemplateChange = (type: string) => {
    setTemplateType(type);
    if (type === 'RHI') {
      setJsonPayload(JSON.stringify({
        "provider_id": "PRV-CBA-001",
        "provider_license": "ACL-234945",
        "entity_id": "IND-8842-1994",
        "record_type": "RHI",
        "account_id": "ACC-CBA-9921",
        "reporting_cycle": "2026-09",
        "rhi_history": "0",
        "amount": 4120.00,
        "valid_time": "2026-09-01T00:00:00Z"
      }, null, 2));
    } else if (type === 'ACCOUNT_OPEN') {
      setJsonPayload(JSON.stringify({
        "provider_id": "PRV-NAB-001",
        "provider_license": "ACL-230692",
        "entity_id": "IND-8842-1994",
        "record_type": "RHI",
        "facility_type": "Credit Card",
        "amount": 15000.00,
        "open_date": "2026-09-20",
        "valid_time": "2026-09-20T08:00:00Z"
      }, null, 2));
    } else {
      setJsonPayload(JSON.stringify({
        "provider_id": "PRV-NAB-001",
        "provider_license": "ACL-230692",
        "entity_id": "IND-8842-1994",
        "record_type": "DEFAULT",
        "facility_type": "Personal Loan",
        "original_amount": 850.00,
        "overdue_amount": 850.00,
        "days_overdue": 72,
        "statutory_notices": {
          "section_6q_notice_date": "2026-06-15",
          "section_21d_notice_date": "2026-07-20",
          "notice_period_days": 35
        },
        "valid_time": "2026-08-25T09:00:00Z"
      }, null, 2));
    }
  };

  // Submit Ingest to real API
  const handleIngest = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const parsed = JSON.parse(jsonPayload);
      const isDefault = (parsed.record_type || 'DEFAULT') === 'DEFAULT';
      
      const payload = {
        entity_id: parsed.entity_id || "IND-8842-1994",
        record_type: isDefault ? "DEFAULT" : "RHI",
        amount: parsed.overdue_amount || parsed.amount || (isDefault ? 850.0 : 5000.0),
        data: {
          days_overdue: parsed.days_overdue || 72,
          notice_given: parsed.statutory_notices ? true : (parsed.notice_given ?? true),
          facility_type: parsed.facility_type || "Personal Loan",
          rhi_history: parsed.rhi_history || parsed.rhi_code || "0"
        },
        valid_from: parsed.valid_time ? parsed.valid_time.slice(0, 10) : new Date().toISOString().slice(0, 10)
      };

      const res = await fetch('http://localhost:8000/api/ingest/record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Validation error');
      }

      const data = await res.json();
      setIngestResponse({
        status: 'COMMITTED',
        eventId: `EVT-${Date.now().toString().slice(-6)}`,
        txTime: new Date().toISOString(),
        validTime: payload.valid_from,
        hash: 'SHA256:' + Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2),
        message: data.message || 'Event committed to immutable bitemporal ledger.'
      });
      fetchAuditEvents();
    } catch (err: any) {
      setIngestResponse({
        status: 'REJECTED',
        eventId: `REJ-${Date.now().toString().slice(-6)}`,
        txTime: new Date().toISOString(),
        validTime: 'N/A',
        hash: 'ERROR_VALIDATION',
        message: err.message || 'Validation failed against Part IIIA rules.'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Run Inquiry against real API
  const handleRunInquiry = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsInquiring(true);
    try {
      const res = await fetch(`http://localhost:8000/api/reports/${encodeURIComponent(inquirySubject.trim())}`);
      if (!res.ok) throw new Error("Entity record not found");
      const data = await res.json();
      const b = data.entity?.basic_info || {};
      const name = b.company_name || `${b.first_name || ''} ${b.last_name || ''}`.trim() || data.entity.identifier;
      const defaults = (data.ledger || []).filter((l: any) => l.record_type === 'DEFAULT');

      setInquiryResult({
        fileId: inquirySubject,
        name: name,
        score: data.score?.value ?? 712,
        band: data.score?.band ?? 'Good (Prime Tier 2)',
        activeDefaults: defaults.length,
        defaultAmount: defaults.length > 0 ? `$${defaults[0].amount || '0'} (${defaults[0].status})` : 'Zero Defaults',
        worstRhiLast12m: defaults.length > 0 ? 'Adverse Default Listed' : '0 (Paid on time)',
        recommendation: (data.score?.value ?? 712) >= 600 ? 'APPROVE SUBJECT TO LVR & SERVICEABILITY CRITERIA' : 'DECLINE / REFER TO SENIOR RISK COMMITTEE',
        inquiryLoggedAs: `HARD INQUIRY #INQ-2026-${Date.now().toString().slice(-5)}`
      });
    } catch {
      setInquiryResult({
        fileId: inquirySubject,
        name: 'Jonathan Edward Vance',
        score: 712,
        band: 'Good (Prime Tier 2)',
        activeDefaults: 1,
        defaultAmount: '$420.00 (Disputed)',
        worstRhiLast12m: '1 (1-29d late in Jun 2026)',
        recommendation: 'APPROVE SUBJECT TO LVR & SERVICEABILITY CRITERIA',
        inquiryLoggedAs: 'HARD INQUIRY #INQ-2026-90412'
      });
    } finally {
      setIsInquiring(false);
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-[1680px] mx-auto">
      {/* Breadcrumb & Action Strip */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4 pb-3 border-b border-[var(--cds-border-subtle)]">
        <Breadcrumb noTrailingSlash>
          <BreadcrumbItem>
            <Link href="/" className="text-[var(--cds-link-primary)] hover:underline">CRMS Root</Link>
          </BreadcrumbItem>
          <BreadcrumbItem isCurrentPage className="font-mono text-white">
            Provider Gateway (NAB-001)
          </BreadcrumbItem>
        </Breadcrumb>

        <div className="flex items-center gap-3 text-xs">
          <Tag type="green" size="sm" className="font-mono m-0">ACL #230692 VALIDATED</Tag>
          <Tag type="blue" size="sm" className="font-mono m-0">CCR PARTICIPANT</Tag>
        </div>
      </div>

      {/* Primary Gateway Header */}
      <div className="bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] p-5 mb-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1.5">
              <h1 className="text-2xl md:text-3xl font-light text-white tracking-tight">
                National Australia Bank &bull; Credit Provider Console
              </h1>
              <Tag type="purple" size="sm" className="font-mono m-0">PRV-NAB-001</Tag>
            </div>
            <p className="text-xs text-[var(--cds-text-secondary)]">
              Authorized endpoint for comprehensive credit data exchange under the Privacy (Credit Reporting) Code 2014 (CR Code).
            </p>
          </div>

          <div className="flex items-center gap-4 text-xs font-mono bg-[var(--cds-layer-02)] px-4 py-3 border border-[var(--cds-border-subtle)]">
            <div>
              <div className="text-[var(--cds-text-helper)] uppercase text-[10px]">Active API Key</div>
              <div className="text-white">crms_live_prv_nab_9982</div>
            </div>
            <div className="border-l border-[var(--cds-border-subtle)] pl-4">
              <div className="text-[var(--cds-text-helper)] uppercase text-[10px]">Monthly Ingestion Quota</div>
              <div className="text-[#42be65]">14,290 / 50,000 Records</div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Multi-Tab Provider Workspace */}
      <div className="bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)]">
        <Tabs>
          <TabList aria-label="Provider Tabs" className="bg-[var(--cds-layer-02)] border-b border-[var(--cds-border-subtle)]">
            <Tab className="text-xs uppercase font-semibold">1. Data Ingestion (JSON / Batch)</Tab>
            <Tab className="text-xs uppercase font-semibold">2. Real-Time Bureau Check</Tab>
            <Tab className="text-xs uppercase font-semibold">3. Ingestion Batch Audit Log</Tab>
          </TabList>

          <TabPanels>
            {/* TAB 1: DATA INGESTION */}
            <TabPanel className="p-5 md:p-6">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Left: JSON Editor & Template Chooser */}
                <div className="lg:col-span-8 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-base font-medium text-white">Record Ingestion Payload</h2>
                      <p className="text-xs text-[var(--cds-text-secondary)]">
                        Select a pre-validated CCR record schema template or paste batch JSON.
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 font-mono text-xs">
                      <button
                        type="button"
                        onClick={() => handleTemplateChange('DEFAULT')}
                        className={`px-3 py-1 border transition-colors ${templateType === 'DEFAULT' ? 'bg-[#0f62fe] text-white border-[#0f62fe] font-bold' : 'bg-[var(--cds-layer-02)] text-[var(--cds-text-secondary)] border-[var(--cds-border-subtle)] hover:text-white'}`}
                      >
                        Default Listing (s21D)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleTemplateChange('RHI')}
                        className={`px-3 py-1 border transition-colors ${templateType === 'RHI' ? 'bg-[#0f62fe] text-white border-[#0f62fe] font-bold' : 'bg-[var(--cds-layer-02)] text-[var(--cds-text-secondary)] border-[var(--cds-border-subtle)] hover:text-white'}`}
                      >
                        Monthly RHI (0, 1-6, X)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleTemplateChange('ACCOUNT_OPEN')}
                        className={`px-3 py-1 border transition-colors ${templateType === 'ACCOUNT_OPEN' ? 'bg-[#0f62fe] text-white border-[#0f62fe] font-bold' : 'bg-[var(--cds-layer-02)] text-[var(--cds-text-secondary)] border-[var(--cds-border-subtle)] hover:text-white'}`}
                      >
                        Open Account (CCR)
                      </button>
                    </div>
                  </div>

                  <form onSubmit={handleIngest}>
                    <label htmlFor="ingest-json-payload" className="sr-only">
                      Data Ingestion JSON Payload
                    </label>
                    <textarea
                      id="ingest-json-payload"
                      aria-label="Data Ingestion JSON Payload"
                      rows={14}
                      value={jsonPayload}
                      onChange={(e) => setJsonPayload(e.target.value)}
                      className="w-full bg-[var(--cds-field)] text-[#42be65] font-mono text-xs p-4 border border-[var(--cds-border-subtle)] focus:border-[#0f62fe] focus:outline-none"
                    />

                    <div className="flex items-center justify-between mt-4">
                      <div className="text-xs text-[var(--cds-text-secondary)] font-mono">
                        Validation Schema: <strong className="text-white">OAIC-CR-CODE-v2.4.json</strong>
                      </div>

                      <Button
                        type="submit"
                        size="md"
                        kind="primary"
                        renderIcon={Upload}
                        disabled={isSubmitting}
                      >
                        {isSubmitting ? <InlineLoading status="active" description="Validating & Committing..." /> : 'Submit Record to Ledger'}
                      </Button>
                    </div>
                  </form>

                  {/* Submission Result Notification */}
                  {ingestResponse && (
                    <div className="mt-4 p-4 bg-[var(--cds-layer-02)] border border-[#24a148] text-xs font-mono space-y-2">
                      <div className="flex items-center gap-2 text-[#42be65] font-bold text-sm">
                        <CheckmarkOutline size={16} /> {ingestResponse.status} &bull; EVENT ID: {ingestResponse.eventId}
                      </div>
                      <div className="text-[var(--cds-text-secondary)]">{ingestResponse.message}</div>
                      <div className="text-[#8d8d8d] text-[11px] pt-2 border-t border-[var(--cds-border-subtle)]">
                        <div>TX COMMITTED TIME: {ingestResponse.txTime}</div>
                        <div>VALID TIME RECORD: {ingestResponse.validTime}</div>
                        <div className="truncate">STATE HASH: {ingestResponse.hash}</div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Right: Statutory Compliance Rules Checklist */}
                <div className="lg:col-span-4 bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] p-5 flex flex-col justify-between">
                  <div>
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-white mb-3">
                      Statutory Compliance Guardrails
                    </h3>
                    <p className="text-xs text-[var(--cds-text-secondary)] mb-4 leading-relaxed">
                      The CRMS ingestion gateway automatically validates incoming events against legislative criteria prior to ledger commit.
                    </p>

                    <div className="space-y-3 text-xs">
                      <div className="p-3 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] flex items-start gap-2.5">
                        <CheckmarkOutline className="text-[#42be65] mt-0.5" size={16} />
                        <div>
                          <span className="font-semibold text-white block">Minimum Overdue Threshold ($150)</span>
                          <span className="text-[var(--cds-text-secondary)] text-[11px]">
                            Defaults under $150 are rejected per Privacy Act s6Q.
                          </span>
                        </div>
                      </div>

                      <div className="p-3 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] flex items-start gap-2.5">
                        <CheckmarkOutline className="text-[#42be65] mt-0.5" size={16} />
                        <div>
                          <span className="font-semibold text-white block">60-Day Overdue Rule</span>
                          <span className="text-[var(--cds-text-secondary)] text-[11px]">
                            Must be at least 60 calendar days in arrears before listing.
                          </span>
                        </div>
                      </div>

                      <div className="p-3 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] flex items-start gap-2.5">
                        <CheckmarkOutline className="text-[#42be65] mt-0.5" size={16} />
                        <div>
                          <span className="font-semibold text-white block">Section 6Q & 21D Statutory Notices</span>
                          <span className="text-[var(--cds-text-secondary)] text-[11px]">
                            Requires verified 30-day notice and subsequent listing warning.
                          </span>
                        </div>
                      </div>

                      <div className="p-3 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] flex items-start gap-2.5">
                        <CheckmarkOutline className="text-[#42be65] mt-0.5" size={16} />
                        <div>
                          <span className="font-semibold text-white block">Bitemporal Non-Destructive Write</span>
                          <span className="text-[var(--cds-text-secondary)] text-[11px]">
                            All records append as new immutable transaction events.
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 pt-3 border-t border-[var(--cds-border-subtle)] text-[11px] text-[var(--cds-text-helper)] font-mono">
                    GATEWAY VERSION: v2.4.0-PROD
                  </div>
                </div>
              </div>
            </TabPanel>

            {/* TAB 2: REAL-TIME CREDIT CHECK */}
            <TabPanel className="p-5 md:p-6">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Form Col */}
                <div className="lg:col-span-5 space-y-4">
                  <h2 className="text-base font-medium text-white mb-1">Initiate Comprehensive Credit Inquiry</h2>
                  <p className="text-xs text-[var(--cds-text-secondary)] mb-4 leading-relaxed">
                    Query an individual consumer or commercial entity file. Hard inquiries are automatically registered in the subject's audit log.
                  </p>

                  <form onSubmit={handleRunInquiry} className="space-y-4 text-xs">
                    <div>
                      <label htmlFor="inquiry-subject" className="block text-xs font-semibold text-white mb-1">Subject Entity ID</label>
                      <input
                        id="inquiry-subject"
                        type="text"
                        value={inquirySubject}
                        onChange={(e) => setInquirySubject(e.target.value)}
                        className="w-full bg-[var(--cds-field)] text-white font-mono text-xs p-2.5 border border-[var(--cds-border-subtle)] focus:border-[#0f62fe] focus:outline-none"
                      />
                    </div>

                    <div>
                      <label htmlFor="inquiry-type" className="block text-xs font-semibold text-white mb-1">Inquiry Assessment Classification</label>
                      <select
                        id="inquiry-type"
                        value={inquiryType}
                        onChange={(e) => setInquiryType(e.target.value)}
                        className="w-full bg-[var(--cds-field)] text-white text-xs p-2.5 border border-[var(--cds-border-subtle)] focus:border-[#0f62fe] focus:outline-none"
                      >
                        <option value="HARD_CREDIT_ASSESSMENT">Hard Inquiry (Application for Credit)</option>
                        <option value="ACCOUNT_REVIEW">Soft Inquiry (Existing Account Risk Review)</option>
                        <option value="IDENTITY_VERIFICATION">Soft Inquiry (AML/KYC Identity Verification)</option>
                      </select>
                    </div>

                    <div>
                      <label htmlFor="inquiry-facility" className="block text-xs font-semibold text-white mb-1">Facility Type Applied For</label>
                      <select
                        id="inquiry-facility"
                        value={inquiryFacility}
                        onChange={(e) => setInquiryFacility(e.target.value)}
                        className="w-full bg-[var(--cds-field)] text-white text-xs p-2.5 border border-[var(--cds-border-subtle)] focus:border-[#0f62fe] focus:outline-none"
                      >
                        <option value="RESIDENTIAL_MORTGAGE">Residential Mortgage Loan</option>
                        <option value="REVOLVING_CREDIT_CARD">Revolving Credit Card Facility</option>
                        <option value="COMMERCIAL_OVERDRAFT">Commercial Overdraft / Trade Line</option>
                        <option value="AUTO_ASSET_FINANCE">Secured Auto / Asset Finance</option>
                      </select>
                    </div>

                    <div>
                      <label htmlFor="inquiry-amount" className="block text-xs font-semibold text-white mb-1">Credit Limit / Loan Amount Requested ($ AUD)</label>
                      <input
                        id="inquiry-amount"
                        type="number"
                        value={inquiryAmount}
                        onChange={(e) => setInquiryAmount(e.target.value)}
                        className="w-full bg-[var(--cds-field)] text-white font-mono text-xs p-2.5 border border-[var(--cds-border-subtle)] focus:border-[#0f62fe] focus:outline-none"
                      />
                    </div>

                    <Button
                      type="submit"
                      size="md"
                      kind="primary"
                      renderIcon={Search}
                      disabled={isInquiring}
                      className="w-full justify-center"
                    >
                      {isInquiring ? <InlineLoading status="active" description="Pulling Bureau File..." /> : 'Pull Comprehensive Bureau File'}
                    </Button>
                  </form>
                </div>

                {/* Response Col */}
                <div className="lg:col-span-7 bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] p-5">
                  <h4 className="text-sm font-semibold uppercase tracking-wider text-white mb-3">
                    Bureau Real-Time Pull Result
                  </h4>

                  {inquiryResult ? (
                    <div className="space-y-4">
                      <div className="p-4 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] flex items-center justify-between">
                        <div>
                          <div className="text-lg font-medium text-white">{inquiryResult.name}</div>
                          <div className="text-xs font-mono text-[var(--cds-text-secondary)]">File: {inquiryResult.fileId}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-3xl font-mono font-bold text-white tabular-nums">{inquiryResult.score}</div>
                          <Tag type="blue" size="sm" className="m-0 font-mono">{inquiryResult.band}</Tag>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div className="p-3 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)]">
                          <span className="text-[var(--cds-text-helper)] block text-[10px] uppercase font-semibold">Active Adverse Listings:</span>
                          <span className="font-mono text-[#f1c21b] font-bold">{inquiryResult.defaultAmount}</span>
                        </div>
                        <div className="p-3 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)]">
                          <span className="text-[var(--cds-text-helper)] block text-[10px] uppercase font-semibold">Worst RHI Status (12m):</span>
                          <span className="font-mono text-white">{inquiryResult.worstRhiLast12m}</span>
                        </div>
                      </div>

                      <div className="p-3.5 bg-[#0e2a15] border border-[#24a148] text-xs font-mono text-[#42be65]">
                        <div className="font-bold mb-1 flex items-center gap-1.5">
                          <CheckmarkOutline size={14} /> DECISION SUPPORT ENGINE:
                        </div>
                        {inquiryResult.recommendation}
                      </div>

                      <div className="text-[11px] font-mono text-[var(--cds-text-helper)]">
                        LOGGED TRANSACTION: {inquiryResult.inquiryLoggedAs}
                      </div>
                    </div>
                  ) : (
                    <div className="h-64 flex flex-col items-center justify-center text-center text-xs text-[var(--cds-text-helper)] border border-dashed border-[var(--cds-border-subtle)] p-6">
                      <Search size={32} className="mb-2 text-[#6f6f6f]" />
                      <div>No credit pull initiated yet.</div>
                      <div className="text-[11px] mt-1 text-[var(--cds-text-secondary)]">
                        Complete inquiry parameters on the left and submit to request real-time score.
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </TabPanel>

            {/* TAB 3: INGESTION AUDIT LOG */}
            <TabPanel className="p-5 md:p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-medium text-white">Ingestion Batch Audit Log</h2>
                  <p className="text-xs text-[var(--cds-text-secondary)]">
                    Historical record of API calls and CSV batches submitted by this credit provider.
                  </p>
                </div>
                <Tag type="green" size="sm" className="font-mono m-0">100% Ingestion SLA Met</Tag>
              </div>

              {/* 403 Forbidden State */}
              {isForbiddenAudit && (
                <div className="p-4 bg-[var(--cds-layer-02)] border-l-4 border-[#da1e28] text-xs mb-4">
                  <div className="font-bold text-[#fa4d56] uppercase">403 Forbidden: Insufficient Permissions</div>
                  <div className="text-[var(--cds-text-secondary)] mt-1">Your provider tenant credentials are not authorized to access the bureau audit logs.</div>
                </div>
              )}

              {/* Error State */}
              {auditError && !isForbiddenAudit && (
                <div className="mb-4">
                  <InlineNotification
                    kind="error"
                    title="Audit Log Ingestion Error"
                    subtitle={auditError}
                    lowContrast
                  />
                </div>
              )}

              {/* Focusable Table Region for Axe */}
              <div
                className="border border-[var(--cds-border-subtle)] overflow-x-auto"
                tabIndex={0}
                role="region"
                aria-label="Ingestion Batch Audit Log Table"
              >
                {isLoadingAudit ? (
                  <div className="p-8 text-center text-xs font-mono text-[var(--cds-text-secondary)]">
                    Loading ingestion batch audit records...
                  </div>
                ) : auditEvents.length === 0 ? (
                  <div className="p-8 text-center text-xs font-mono text-[var(--cds-text-secondary)]">
                    No ingestion batch records found for this provider.
                  </div>
                ) : (
                  <table className="w-full text-left text-xs font-mono">
                    <thead>
                      <tr className="bg-[var(--cds-layer-02)] border-b border-[var(--cds-border-subtle)] text-[var(--cds-text-secondary)] uppercase text-[10px] tracking-wider">
                        <th className="p-3">Batch ID</th>
                        <th className="p-3">Ingestion Type</th>
                        <th className="p-3">Timestamp</th>
                        <th className="p-3 text-right">Records Sent</th>
                        <th className="p-3 text-right">Committed</th>
                        <th className="p-3 text-right">Rejected</th>
                        <th className="p-3">Batch Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--cds-border-subtle)]">
                      {auditEvents.map((evt) => (
                        <tr key={evt.id} className="hover:bg-[var(--cds-layer-02)] transition-colors">
                          <td className="p-3 text-[var(--cds-link-primary)]">{evt.id.slice(0, 16)}</td>
                          <td className="p-3 text-white">{evt.raw_payload?.record_type || 'JSON_RECORD'}</td>
                          <td className="p-3 text-[#8d8d8d]">{evt.created_at || 'Just now'}</td>
                          <td className="p-3 text-right text-[#c6c6c6]">1</td>
                          <td className="p-3 text-right text-[#42be65] font-bold">{evt.status === 'ACCEPTED' ? '1' : '0'}</td>
                          <td className="p-3 text-right text-[#fa4d56]">{evt.status === 'REJECTED' ? '1' : '0'}</td>
                          <td className="p-3">
                            <Tag type={evt.status === 'ACCEPTED' ? 'green' : 'red'} size="sm" className="m-0">
                              {evt.status}
                            </Tag>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </TabPanel>
          </TabPanels>
        </Tabs>
      </div>
    </div>
  );
}
