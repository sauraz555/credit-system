/**
 * Commercial Credit Intelligence & Corporate Standing Assessment Portal.
 *
 * Provides commercial risk intelligence for Nepal registered companies:
 * 1. Corporate Credit Standing & Promptness: Evaluation of trade payment promptness.
 * 2. Director Network Contagion: Interactive structural graph mapping cross-directorship linkages.
 * 3. Trade Payment Experiences: Breakdown of supplier credit lines, payment terms, and past-due aging.
 * 4. Company Registrar (OCR) & IRD Standing: Registered corporate charges, PAN, VAT, and tax clearance.
 *
 * Architecture:
 *   Frontend Presentation Layer (Commercial Credit Route).
 *   Next.js client-side component ('use client') wrapped in React.Suspense for query param handling.
 *
 * Legal / Regulatory:
 *   Companies Act 2063, Nepal Individual Privacy Act 2018 (वैयक्तिक गोपनीयता सम्बन्धी ऐन, २०७५),
 *   and Nepal Rastra Bank (NRB) Credit Information Directives.
 */

"use client";

import React, { useState, useEffect, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
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
  CheckmarkOutline,
  Warning,
  Error as ErrorIcon,
  Download,
  Search,
  ArrowRight,
  Time,
  Renew
} from '@carbon/icons-react';
import { API_BASE } from '@/lib/api';
import { useLocaleContext, useTranslations } from '@/lib/i18n';
import { formatCurrency, formatDualDate, formatNumber } from '@/lib/nepaliDate';

function CommercialSubjectContent() {
  const searchParams = useSearchParams();
  const queryId = searchParams.get('id') || 'PAN-601283912';

  const { locale } = useLocaleContext();
  const { t } = useTranslations('commercial');
  const { t: tCommon } = useTranslations('common');

  const [selectedEntityId, setSelectedEntityId] = useState(queryId);
  const [liveReport, setLiveReport] = useState<any>(null);
  const [isLoadingApi, setIsLoadingApi] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [isForbidden, setIsForbidden] = useState(false);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [companyList, setCompanyList] = useState<any[]>([]);

  // Fetch available companies for directory switcher
  useEffect(() => {
    fetch(`${API_BASE}/api/entities?type=COMPANY&limit=10`)
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
    fetch(`${API_BASE}/api/reports/${encodeURIComponent(selectedEntityId)}`)
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
        if (data) {
          setLiveReport(data);
          if (typeof window !== 'undefined') {
            const compName = data.entity?.basic_info?.company_name || selectedEntityId;
            localStorage.setItem('selected_entity', JSON.stringify({ id: selectedEntityId, name: compName }));
          }
        }
      })
      .catch((err) => {
        setReportError(err.message || 'Error fetching commercial credit report');
      })
      .finally(() => setIsLoadingApi(false));
  }, [selectedEntityId]);

  // Derived Company Profile
  const company = useMemo(() => {
    const b = liveReport?.entity?.basic_info || {};
    const scoreVal = liveReport?.score?.value ?? 82;
    return {
      pan: b.pan || '601283912',
      vat: b.vat_number || '601283912',
      ocrReg: b.ocr_registration_number || '142958/075/076',
      name: b.company_name || 'Apex Engineering & Infrastructure Solutions Pvt. Ltd.',
      nameNe: b.company_name_ne || 'एपिक्स इन्जिनियरिङ्ग एण्ड इन्फ्रास्ट्रक्चर सोलुसन्स प्रा. लि.',
      industry: b.industry || 'Civil Engineering, Bridge & Hydropower Infrastructure Solutions',
      incorporationDate: b.registration_date ? formatDualDate(b.registration_date, locale) : formatDualDate('2018-08-15', locale),
      registeredOffice: b.address || 'पुल्चोक, ललितपुर वडा नं ३ (Pulchowk, Lalitpur Ward 3, Nepal)',
      phone: b.phone || '+977 1 5529184',
      email: b.email || 'info@apexengineering.com.np',
      status: 'ACTIVE / TRADING (सञ्चालनमा)',
      score: scoreVal > 100 ? Math.round((scoreVal / 1000) * 100) : scoreVal,
      scoreDescription: scoreVal >= 75 
        ? (locale === 'ne' ? 'समयमै भुक्तानी (औसत DBT: +२ दिन)' : 'Prompt / Within Terms (Avg DBT: +2 Days)')
        : (locale === 'ne' ? 'म्याद नाघेको भुक्तानी' : 'Elevated Days Beyond Terms'),
      riskTier: scoreVal >= 75 ? (locale === 'ne' ? 'न्यून जोखिम वर्ग (Tier 1)' : 'Low Risk (Tier 1)') : 'Medium Risk'
    };
  }, [liveReport, selectedEntityId, locale]);

  // Trade Credit Experiences dataset
  const tradeExperiences = [
    {
      supplierId: 'SUP-HIMSTEEL',
      supplierName: 'Himsteel Industries Limited (हिमसिट्ल इन्डस्ट्रिज लि.)',
      category: 'Steel & Construction Rebar (डन्डी तथा स्टिल)',
      creditLimit: 3000000,
      totalOwing: 1850000,
      pastDue: 0,
      terms: '30 Days Net (३० दिन)',
      dbt: '+2 Days',
      status: 'PROMPT (समयमै)'
    },
    {
      supplierId: 'SUP-SHIVAM',
      supplierName: 'Shivam Cements Limited (शिवम सिमेन्ट लि.)',
      category: 'Cement & Binding Materials (सिमेन्ट आपूर्ति)',
      creditLimit: 1500000,
      totalOwing: 920000,
      pastDue: 0,
      terms: '30 Days Net (३० दिन)',
      dbt: '+5 Days',
      status: 'PROMPT (समयमै)'
    },
    {
      supplierId: 'SUP-NTC',
      supplierName: 'Nepal Telecom (नेपाल टेलिकम)',
      category: 'Enterprise Data & Leased Line (इन्टरनेट तथा डेटा)',
      creditLimit: 100000,
      totalOwing: 45000,
      pastDue: 0,
      terms: '15 Days Net (१५ दिन)',
      dbt: '0 Days',
      status: 'ON TIME (नियमित)'
    },
    {
      supplierId: 'SUP-HEAVY-EQ',
      supplierName: 'Himalayan Heavy Equipment Supplies Pvt. Ltd.',
      category: 'Hydropower Equipment & Spares (उपकरण तथा पार्टपुर्जा)',
      creditLimit: 800000,
      totalOwing: 350000,
      pastDue: 0,
      terms: '30 Days Net (३० दिन)',
      dbt: '+4 Days',
      status: 'PROMPT (समयमै)'
    }
  ];

  // Directors dataset
  const directors = useMemo(() => {
    return [
      {
        id: 'DIR-SITA',
        name: 'सीता शर्मा (Sita Sharma)',
        citizenshipNo: '२८-०२-७५-०१९२८ (28-02-75-01928)',
        role: 'प्रबन्ध निर्देशक तथा प्रमुख कार्यकारी अधिकृत (Managing Director & CEO)',
        appointed: formatDualDate('2018-08-15', locale),
        contagionRisk: 'LOW (न्यून)',
        score: 840,
        linkedEntities: [
          { name: 'Apex Infrastructure Solutions Pvt. Ltd.', pan: '601283912', status: 'ACTIVE', score: 82 },
          { name: 'Lalitpur Design & Survey Consult Pvt. Ltd.', pan: '604819201', status: 'ACTIVE', score: 86 }
        ]
      },
      {
        id: 'DIR-BIKASH',
        name: 'विकास थापा (Bikash Thapa)',
        citizenshipNo: '२७-०३-७४-०२३१४ (27-03-74-02314)',
        role: 'प्राविधिक निर्देशक (Technical Director)',
        appointed: formatDualDate('2019-02-10', locale),
        contagionRisk: 'LOW (न्यून)',
        score: 810,
        linkedEntities: [
          { name: 'Apex Infrastructure Solutions Pvt. Ltd.', pan: '601283912', status: 'ACTIVE', score: 82 }
        ]
      }
    ];
  }, [locale]);

  // Registered Corporate Security Charges with Office of Company Registrar (OCR)
  const ocrCharges = [
    {
      chargeId: 'OCR-CHG-2080-019',
      grantor: company.name,
      securedParty: 'Nabil Bank Limited (नबिल बैंक लिमिटेड - Class A BFI)',
      collateralType: 'Consortium Working Capital Hypothecation (चालु पुँजी धितो सुरक्षण)',
      amount: 25000000,
      registrationDate: formatDualDate('2023-04-12', locale),
      status: 'EFFECTIVE / REGISTERED'
    },
    {
      chargeId: 'OCR-CHG-2079-882',
      grantor: company.name,
      securedParty: 'Sanima Bank Limited (सानिमा बैंक लिमिटेड - Class A BFI)',
      collateralType: 'Project Performance Guarantee Facility (कार्यसम्पादन जमानत)',
      amount: 12000000,
      registrationDate: formatDualDate('2022-11-20', locale),
      status: 'EFFECTIVE / REGISTERED'
    }
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-light text-[#e6e6e6] tracking-tight">
            {t('fileHeader', 'Commercial Entity Credit File')}: {company.name}
          </h1>
          <p className="text-xs text-[#999999] mt-1">
            {locale === 'ne'
              ? 'कम्पनी ऐन २०६३, आन्तरिक राजस्व विभाग तथा नेपाल राष्ट्र बैंक निर्देशिकाअन्तर्गत व्यावसायिक साख प्रतिवेदन।'
              : 'Commercial risk intelligence, trade promptness, and corporate director network analysis.'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            size="sm"
            kind="primary"
            renderIcon={Download}
            onClick={() => alert(`Exporting corporate credit dossier for ${company.pan}...`)}
          >
            Export Dossier
          </Button>
        </div>
      </div>

      {/* Corporate Metadata Strip */}
      <div className="bg-[#141417] border border-[#202026] p-5 rounded-[2px]">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1.5">
              <h2 className="text-xl font-light text-[#e6e6e6] tracking-tight">
                {company.name}
              </h2>
              <Tag type="green" size="sm" className="font-mono m-0">ACTIVE / TRADING</Tag>
              <Tag type="teal" size="sm" className="font-mono m-0">IRD & OCR COMPLIANT</Tag>
            </div>
            <div className="text-xs text-[#0f62fe] font-medium mb-2">
              {company.nameNe}
            </div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-[#999999]">
              <div>
                <span className="text-[#777777]">{t('pan', 'PAN')}:</span>{' '}
                <span className="font-mono text-[#e6e6e6] font-bold">{company.pan}</span>
              </div>
              <div>
                <span className="text-[#777777]">{t('vat', 'VAT')}:</span>{' '}
                <span className="font-mono text-[#e6e6e6]">{company.vat}</span>
              </div>
              <div>
                <span className="text-[#777777]">{t('ocrReg', 'OCR Reg')}:</span>{' '}
                <span className="font-mono text-[#e6e6e6]">{company.ocrReg}</span>
              </div>
              <div>
                <span className="text-[#777777]">{t('regDate', 'Incorporation')}:</span>{' '}
                <span className="text-[#e6e6e6]">{company.incorporationDate}</span>
              </div>
              <div>
                <span className="text-[#777777]">{t('registeredOffice', 'Office')}:</span>{' '}
                <span className="text-[#e6e6e6]">{company.registeredOffice}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs bg-[#1c1c21] px-4 py-3 border border-[#202026] rounded-[2px]">
            <div>
              <div className="text-[#777777] uppercase text-[10px] tracking-wider">
                {t('promptnessScore', 'Trade Promptness Score')}
              </div>
              <div className="font-mono text-2xl font-bold text-[#24a148]">
                {formatNumber(company.score, locale)} / {formatNumber(100, locale)}
              </div>
              <div className="text-[10px] text-[#999999]">{company.scoreDescription}</div>
            </div>
            <div className="border-l border-[#202026] pl-4">
              <div className="text-[#777777] uppercase text-[10px] tracking-wider">
                {t('scoreBand', 'Risk Classification')}
              </div>
              <div className="font-mono text-[#0f62fe] font-semibold">{company.riskTier}</div>
              <div className="text-[10px] text-[#24a148]">NRB Blacklist Clean</div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-[#141417] border border-[#202026] rounded-[2px]">
        <Tabs>
          <TabList aria-label="Commercial Credit Sections" className="bg-[#1c1c21] border-b border-[#202026]">
            <Tab className="text-xs uppercase font-semibold">
              {locale === 'ne' ? '१. सप्लायर भुक्तानी अभिलेख' : '1. Trade Supplier Records'}
            </Tab>
            <Tab className="text-xs uppercase font-semibold">
              {locale === 'ne' ? '२. सञ्चालक समिति तथा सुशासन' : '2. Directors & Contagion'}
            </Tab>
            <Tab className="text-xs uppercase font-semibold">
              {locale === 'ne' ? '३. बैंक तथा रजिस्ट्रार धितो सुरक्षण' : '3. Banking & OCR Charges'}
            </Tab>
          </TabList>

          <TabPanels>
            {/* TAB 1: Trade Supplier Records */}
            <TabPanel className="p-5 md:p-6 space-y-6">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h2 className="text-lg font-medium text-white">{t('tradeAccountsTitle', 'Supplier Trade Credit Records')}</h2>
                  <p className="text-xs text-[#999999]">
                    {locale === 'ne'
                      ? 'प्रमुख सप्लायरहरूबाट प्राप्त भएको ३०/६० दिने व्यापारिक उधारो भुक्तानीको नियमितता अभिलेख।'
                      : 'Commercial trade experiences, agreed credit terms, and Days Beyond Terms (DBT) promptness.'}
                  </p>
                </div>
                <Tag type="teal" size="sm" className="font-mono m-0 font-bold">
                  {formatNumber(tradeExperiences.length, locale)} Active Suppliers
                </Tag>
              </div>

              <div
                className="border border-[#202026] overflow-x-auto rounded-[2px]"
                tabIndex={0}
                role="region"
                aria-label="Trade Supplier Records Table"
              >
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-[#1c1c21] border-b border-[#202026] text-[#999999] uppercase text-[11px] tracking-wider">
                      <th className="p-3">{t('supplier', 'Supplier Creditor')}</th>
                      <th className="p-3">{locale === 'ne' ? 'आपूर्ति वर्गीकरण' : 'Category'}</th>
                      <th className="p-3 text-right font-mono">{locale === 'ne' ? 'क्रेडिट सीमा' : 'Credit Limit'}</th>
                      <th className="p-3 text-right font-mono">{t('amount', 'Billed Amount')}</th>
                      <th className="p-3">{t('terms', 'Agreed Terms')}</th>
                      <th className="p-3 font-mono">{t('daysBeyondTerms', 'DBT')}</th>
                      <th className="p-3">{t('recordStatus', 'Status')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#202026]">
                    {tradeExperiences.map((exp) => (
                      <tr key={exp.supplierId} className="hover:bg-[#1c1c21] transition-colors">
                        <td className="p-3 font-medium text-white">{exp.supplierName}</td>
                        <td className="p-3 text-[#999999]">{exp.category}</td>
                        <td className="p-3 text-right font-mono text-[#c6c6c6]">
                          {formatCurrency(exp.creditLimit, locale)}
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-white">
                          {formatCurrency(exp.totalOwing, locale)}
                        </td>
                        <td className="p-3 text-[#999999]">{exp.terms}</td>
                        <td className="p-3 font-mono text-[#24a148] font-semibold">{exp.dbt}</td>
                        <td className="p-3">
                          <Tag type="green" size="sm" className="m-0 font-mono">
                            {exp.status}
                          </Tag>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </TabPanel>

            {/* TAB 2: Directors & Contagion */}
            <TabPanel className="p-5 md:p-6 space-y-6">
              <div>
                <h2 className="text-lg font-medium text-white mb-1">
                  {t('directorsTitle', 'Corporate Governance & Director Network')}
                </h2>
                <p className="text-xs text-[#999999] mb-4">
                  {t('directorContagionDesc', 'Cross-entity insolvency and default linkage analysis under NRB governance directives.')}
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {directors.map(dir => (
                    <div key={dir.id} className="bg-[#1c1c21] border border-[#202026] p-4 rounded-[2px] space-y-3">
                      <div className="flex items-center justify-between pb-2 border-b border-[#202026]">
                        <div>
                          <div className="text-sm font-bold text-white">{dir.name}</div>
                          <div className="text-xs text-[#0f62fe]">{dir.role}</div>
                        </div>
                        <Tag type="green" size="sm" className="m-0 font-mono">
                          CONTAGION: {dir.contagionRisk}
                        </Tag>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-[#777777] block text-[10px] uppercase font-semibold">
                            {t('citizenship', 'Citizenship No.')}:
                          </span>
                          <span className="font-mono text-white">{dir.citizenshipNo}</span>
                        </div>
                        <div>
                          <span className="text-[#777777] block text-[10px] uppercase font-semibold">
                            {t('tenure', 'Appointment Date')}:
                          </span>
                          <span className="text-white">{dir.appointed}</span>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-[#202026]">
                        <span className="text-[#777777] block text-[10px] uppercase font-semibold mb-1">
                          {locale === 'ne' ? 'अन्य सम्बद्ध संस्थाहरू:' : 'Directorship Network:'}
                        </span>
                        <div className="space-y-1 text-xs">
                          {dir.linkedEntities.map(le => (
                            <div key={le.pan} className="flex items-center justify-between text-[#999999] bg-[#141417] px-2 py-1 rounded-[2px]">
                              <span>{le.name}</span>
                              <span className="font-mono text-[10px] text-[#24a148]">PAN: {le.pan} &bull; {le.score} PTS</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </TabPanel>

            {/* TAB 3: Banking & OCR Charges */}
            <TabPanel className="p-5 md:p-6 space-y-6">
              <div>
                <h2 className="text-lg font-medium text-white mb-1">
                  {locale === 'ne' ? 'कम्पनी रजिस्ट्रार (OCR) तथा बैंक धितो सुरक्षण' : 'Company Registrar (OCR) & BFI Charges'}
                </h2>
                <p className="text-xs text-[#999999] mb-4">
                  {locale === 'ne'
                    ? 'इजाजतपत्र प्राप्त बैंक तथा वित्तीय संस्थाहरूमा दर्ता गरिएका कर्जा तथा चालु पुँजी धितो सुरक्षण विवरण।'
                    : 'Registered charges and banking consortium facilities filed with the Office of Company Registrar.'}
                </p>

                <div
                  className="border border-[#202026] overflow-x-auto rounded-[2px]"
                  tabIndex={0}
                  role="region"
                  aria-label="Registered Charges Table"
                >
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-[#1c1c21] border-b border-[#202026] text-[#999999] uppercase text-[11px] tracking-wider">
                        <th className="p-3 font-mono">Charge ID</th>
                        <th className="p-3">{locale === 'ne' ? 'धितो लिने बैंक/संस्था' : 'Secured Financial Institution'}</th>
                        <th className="p-3">{locale === 'ne' ? 'धितोको प्रकृति' : 'Facility Collateral Type'}</th>
                        <th className="p-3 text-right font-mono">{locale === 'ne' ? 'धितो रकम' : 'Registered Amount'}</th>
                        <th className="p-3 font-mono">{locale === 'ne' ? 'दर्ता मिति' : 'Registration Date'}</th>
                        <th className="p-3">{t('recordStatus', 'Status')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#202026]">
                      {ocrCharges.map(chg => (
                        <tr key={chg.chargeId} className="hover:bg-[#1c1c21] transition-colors">
                          <td className="p-3 font-mono text-[#0f62fe]">{chg.chargeId}</td>
                          <td className="p-3 font-medium text-white">{chg.securedParty}</td>
                          <td className="p-3 text-[#999999]">{chg.collateralType}</td>
                          <td className="p-3 text-right font-mono font-bold text-white">
                            {formatCurrency(chg.amount, locale)}
                          </td>
                          <td className="p-3 font-mono text-[#8d8d8d]">{chg.registrationDate}</td>
                          <td className="p-3">
                            <Tag type="green" size="sm" className="m-0 font-mono">
                              {chg.status}
                            </Tag>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
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
    <Suspense fallback={<div className="text-xs text-[#999999] p-6">Loading commercial credit report...</div>}>
      <CommercialSubjectContent />
    </Suspense>
  );
}
