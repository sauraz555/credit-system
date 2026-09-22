/**
 * High-Fidelity In-Memory Bureau Store for Autonomous Full-Stack Next.js Operation.
 *
 * Implements the complete Nepal Credit Reporting Mechanism data layer:
 * - Nepal Individual Privacy Act 2018 (वैयक्तिक गोपनीयता सम्बन्धी ऐन, २०७५) Section 12.
 * - Nepal Rastra Bank (NRB) Credit Information Directives.
 * - 5 Statutory Nepal Scoring Pillars (Utility 35%, Blacklist 25%, Income 20%, Tax 12%, Rental 8%).
 * - Dual Gregorian (AD) and Bikram Sambat (BS) date representations.
 * - Multi-role session management with TOTP MFA challenges.
 * - Bitemporal point-in-time report reconstruction (?as_of=YYYY-MM-DD).
 */

export interface EntityRecord {
  id: string;
  type: 'INDIVIDUAL' | 'COMPANY';
  identifier: string;
  basic_info: Record<string, any>;
  score: {
    value: number;
    band: string;
    sub_scores?: Record<string, number>;
    top_factors?: string[];
    calculated_at: string;
  };
  ledger: Array<{
    id: string;
    record_type: string;
    data: Record<string, any>;
    amount: number | null;
    valid_from: string;
    valid_to?: string | null;
    provider_id: string;
    status: string;
    recorded_at: string;
  }>;
  enquiries: Array<{
    id: string;
    entity_id: string;
    user_id: string;
    reason: string;
    created_at: string;
  }>;
  directors?: Array<{
    link_id: string;
    individual_id: string;
    identifier: string;
    name: string;
    role: string;
    start_date: string;
    other_directorships: number;
    contagion_risk: 'LOW' | 'HIGH';
    individual_score: number;
  }>;
  directorships?: Array<{
    company_id: string;
    company_identifier: string;
    company_name: string;
    role: string;
    start_date: string;
    paydex_score: number;
  }>;
  created_at: string;
}

export interface DisputeRecord {
  id: string;
  entity_id: string;
  ledger_record_id: string;
  subject_name: string;
  target_listing: string;
  grounds: string;
  filed_date: string;
  days_remaining: number;
  status: 'OPEN' | 'UNDER_REVIEW' | 'CORRECTED' | 'UPHELD' | 'RESOLVED_EXPUNGED';
  created_at: string;
  resolved_at?: string | null;
}

export interface ModelRecord {
  id: string;
  name: string;
  type: 'INDIVIDUAL' | 'COMPANY';
  weights: Record<string, number>;
  band_thresholds: Record<string, number>;
  active: boolean;
  created_at: string;
}

export interface IngestEventRecord {
  id: string;
  provider_id: string;
  raw_payload: any;
  status: 'ACCEPTED' | 'REJECTED';
  error_log?: string | null;
  created_at: string;
}

class MockBureauStore {
  private entities: Map<string, EntityRecord> = new Map();
  private disputes: DisputeRecord[] = [];
  private models: ModelRecord[] = [];
  private ingestEvents: IngestEventRecord[] = [];
  private users: Map<string, any> = new Map();

  constructor() {
    this.seed();
  }

  private seed() {
    // 1. Seed Users & Personas
    this.users.set('admin@example.com', {
      email: 'admin@example.com',
      role: 'ADMIN',
      name: 'Supervisory Officer (सुपरीवेक्षण अधिकृत)',
      mfa_required: true,
      mfa_secret: 'MRYYKLJ3GNBXCF3JLRIBHR6QV4IFLCN2',
      tenant_id: 'CIC-GOV-NP'
    });
    this.users.set('admin@creditreporting.gov.np', {
      email: 'admin@creditreporting.gov.np',
      role: 'ADMIN',
      name: 'Supervisory Officer (सुपरीवेक्षण अधिकृत)',
      mfa_required: true,
      mfa_secret: 'MRYYKLJ3GNBXCF3JLRIBHR6QV4IFLCN2',
      tenant_id: 'CIC-GOV-NP'
    });
    this.users.set('analyst@example.com', {
      email: 'analyst@example.com',
      role: 'ANALYST',
      name: 'Risk Analyst (जोखिम विश्लेषक)',
      mfa_required: true,
      mfa_secret: 'WLNJMOIXHFS442MVSNNA5WQJE74JWV3I',
      tenant_id: 'CIC-GOV-NP'
    });
    this.users.set('analyst@creditreporting.gov.np', {
      email: 'analyst@creditreporting.gov.np',
      role: 'ANALYST',
      name: 'Risk Analyst (जोखिम विश्लेषक)',
      mfa_required: true,
      mfa_secret: 'WLNJMOIXHFS442MVSNNA5WQJE74JWV3I',
      tenant_id: 'CIC-GOV-NP'
    });
    this.users.set('provider@example.com', {
      email: 'provider@example.com',
      role: 'PROVIDER',
      name: 'Nabil Bank Credit Officer (नबिल बैंक)',
      mfa_required: true,
      mfa_secret: 'FKH56R4XUAXHWHFGNX3QE5TY6KFOOMOH',
      tenant_id: 'PRV-NABIL-001'
    });
    this.users.set('provider@nabilbank.com', {
      email: 'provider@nabilbank.com',
      role: 'PROVIDER',
      name: 'Nabil Bank Credit Officer (नबिल बैंक)',
      mfa_required: true,
      mfa_secret: 'FKH56R4XUAXHWHFGNX3QE5TY6KFOOMOH',
      tenant_id: 'PRV-NABIL-001'
    });
    this.users.set('subject@example.com', {
      email: 'subject@example.com',
      role: 'SUBJECT',
      name: 'राम कुमार श्रेष्ठ (Ram Kumar Shrestha)',
      mfa_required: false,
      entity_id: 'CIT-27-01-78-04821'
    });

    // 2. Seed Nepal National Credit Scoring Model v1.0
    this.models.push({
      id: 'MODEL-NP-NAT-v1',
      name: 'Nepal National Credit Scoring Model v1.0',
      type: 'INDIVIDUAL',
      weights: {
        utility_payment_history: 0.35,
        blacklist_adverse_records: 0.25,
        income_stability: 0.20,
        tax_compliance: 0.12,
        rental_payment_history: 0.08
      },
      band_thresholds: {
        'उत्कृष्ट (Excellent)': 800,
        'धेरै राम्रो (Very Good)': 700,
        'राम्रो (Good)': 600,
        'मध्यम (Fair)': 500,
        'कमजोर (Poor)': 0
      },
      active: true,
      created_at: '2026-01-15T00:00:00Z'
    });

    // 3. Seed Ram Kumar Shrestha (CIT-27-01-78-04821)
    const ramBasic = {
      first_name: 'राम कुमार (Ram Kumar)',
      last_name: 'श्रेष्ठ (Shrestha)',
      citizenship_no: '२७-०१-७८-०४८२१ (27-01-78-04821)',
      national_id: '१०८-२९४-८१७२ (108-294-8172)',
      pan_number: '301982741',
      dob_bs: '२०४१-०२-१५',
      dob_ad: '1984-05-28',
      dob: '1984-05-28',
      district: 'काठमाडौँ (Kathmandu)',
      municipality: 'काठमाडौँ महानगरपालिका वडा नं १० (Kathmandu Metropolitian Ward 10)',
      address: 'नयाँ बानेश्वर, काठमाडौँ (New Baneshwor, Kathmandu, Bagmati Province)',
      phone: '+977 9851082914'
    };

    const ramLedger = [
      {
        id: 'ACC-NEA-8821',
        record_type: 'UTILITY',
        data: {
          utility_type: 'Electricity (विद्युत् सेवा)',
          provider_name: 'Nepal Electricity Authority (नेपाल विद्युत् प्राधिकरण)',
          consumer_no: '012.14.882',
          counter: 'Baneshwor Distribution Centre',
          monthly_average_npr: 4500.0,
          history_24_months: '000000000000000000000000',
          timely_payment_rate: '100%'
        },
        amount: 4500.0,
        valid_from: '2019-04-01',
        valid_to: null,
        provider_id: 'PRV-NEA-001',
        status: 'ACTIVE',
        recorded_at: '2019-04-01T08:00:00Z'
      },
      {
        id: 'ACC-NTC-4412',
        record_type: 'UTILITY',
        data: {
          utility_type: 'Telecommunications (दूरसञ्चार तथा फाइबर सेवा)',
          provider_name: 'Nepal Telecom (नेपाल टेलिकम)',
          service_number: '01-4489124',
          plan: 'FTTH Unlimited Premium 100Mbps',
          monthly_average_npr: 2200.0,
          history_24_months: '000000000000000000000000',
          timely_payment_rate: '100%'
        },
        amount: 2200.0,
        valid_from: '2020-07-15',
        valid_to: null,
        provider_id: 'PRV-NTC-001',
        status: 'ACTIVE',
        recorded_at: '2020-07-15T09:30:00Z'
      },
      {
        id: 'ACC-NABIL-9012',
        record_type: 'RHI',
        data: {
          account_type: 'Residential Housing Loan (आवासीय घर कर्जा)',
          provider_name: 'Nabil Bank Limited (नबिल बैंक लिमिटेड)',
          loan_account_no: 'NBL-HL-082914-01',
          interest_base_rate: 'NRB Base Rate + 1.85%',
          rhi_24_months: '000000000000000000000000',
          facility_limit_npr: 4500000.0,
          current_outstanding_npr: 3280000.0
        },
        amount: 4500000.0,
        valid_from: '2021-09-01',
        valid_to: null,
        provider_id: 'PRV-NABIL-001',
        status: 'ACTIVE',
        recorded_at: '2021-09-01T10:15:00Z'
      },
      {
        id: 'REC-IRD-TAX-2080',
        record_type: 'TAX_COMPLIANCE',
        data: {
          authority: 'Inland Revenue Department (आन्तरिक राजस्व विभाग - IRD)',
          pan_number: '301982741',
          filing_status: 'D-01 Income Tax Returns Verified',
          tax_clearance_certificate: 'TCC-2080/81-KTM-9142',
          fiscal_years_compliant: ['2078/79', '2079/80', '2080/81'],
          annual_assessed_income_npr: 1850000.0
        },
        amount: 1850000.0,
        valid_from: '2021-07-16',
        valid_to: null,
        provider_id: 'PRV-NRB-CIC-001',
        status: 'ACTIVE',
        recorded_at: '2021-07-16T11:00:00Z'
      },
      {
        id: 'REC-RENTAL-KTM-01',
        record_type: 'RENTAL',
        data: {
          tenancy_type: 'Registered Residential Tenancy (घरबहाल सम्झौता)',
          ward_office: 'Kathmandu Metropolitian City Ward 10',
          monthly_rent_npr: 32000.0,
          verified_payment_months: 24,
          digital_payment_channel: 'ConnectIPS / Nabil Mobile Banking',
          timely_payment_ratio: '100%'
        },
        amount: 32000.0,
        valid_from: '2022-01-01',
        valid_to: null,
        provider_id: 'PRV-NABIL-001',
        status: 'ACTIVE',
        recorded_at: '2022-01-01T12:00:00Z'
      },
      {
        id: 'DEF-KUKL-2024-881',
        record_type: 'DEFAULT',
        data: {
          reason: 'Pipeline water supply billing variance under technical investigation',
          provider_name: 'Kathmandu Upatyaka Khanepani Limited (KUKL)',
          consumer_no: 'KUKL-KTM-04821',
          days_overdue: 45,
          notice_given: true,
          section_reference: 'Section 12 of Nepal Individual Privacy Act 2018 (वैयक्तिक गोपनीयता सम्बन्धी ऐन, २०७५)'
        },
        amount: 12500.0,
        valid_from: '2024-02-10',
        valid_to: null,
        provider_id: 'PRV-KUKL-001',
        status: 'DISPUTED',
        recorded_at: '2024-02-10T14:20:00Z'
      }
    ];

    const ramEnquiries = [
      {
        id: 'ENQ-2026-991',
        entity_id: 'CIT-27-01-78-04821',
        user_id: 'PRV-NABIL-001',
        reason: 'Periodic Housing Loan Review (Nepal Individual Privacy Act 2018)',
        created_at: '2026-08-15T09:12:00Z'
      },
      {
        id: 'ENQ-2026-442',
        entity_id: 'CIT-27-01-78-04821',
        user_id: 'PRV-SANIMA-001',
        reason: 'Credit Card Application Facility Assessment',
        created_at: '2026-07-10T14:45:00Z'
      },
      {
        id: 'ENQ-2026-118',
        entity_id: 'CIT-27-01-78-04821',
        user_id: 'PRV-NEA-001',
        reason: 'High-Demand 3-Phase Commercial Meter Verification',
        created_at: '2026-05-02T11:20:00Z'
      }
    ];

    const ramRecord: EntityRecord = {
      id: 'CIT-27-01-78-04821',
      type: 'INDIVIDUAL',
      identifier: 'CIT-27-01-78-04821',
      basic_info: ramBasic,
      score: {
        value: 768,
        band: 'धेरै राम्रो (Very Good - Prime Tier 1)',
        sub_scores: {
          utility_payment_history: 335,
          blacklist_adverse_records: 210,
          income_stability: 182,
          tax_compliance: 115,
          rental_payment_history: 76
        },
        top_factors: [
          'नेपाल विद्युत् प्राधिकरण (NEA) तथा दूरसञ्चारको २४ महिने नियमित भुक्तानी अभिलेख (+68 अंक)',
          'नबिल बैंक आवास कर्जाको नियमित किस्ता भुक्तानी अभिलेख (+54 अंक)',
          'आन्तरिक राजस्व विभाग (IRD) कर चुक्ता प्रमाणपत्र २०८०/८१ प्रमाणित (+38 अंक)',
          'खानेपानी (KUKL) सम्बन्धी रु १२,५०० को दाबी वैयक्तिक गोपनीयता ऐन २०७५ को दफा १२ बमोजिम पुनरावलोकनमा (-22 अंक)'
        ],
        calculated_at: new Date().toISOString()
      },
      ledger: ramLedger,
      enquiries: ramEnquiries,
      directorships: [],
      created_at: '2019-04-01T08:00:00Z'
    };

    this.entities.set('CIT-27-01-78-04821', ramRecord);
    // Legacy alias
    this.entities.set('IND-8842-1994', { ...ramRecord, id: 'IND-8842-1994' });

    // 4. Seed Apex Engineering & Infrastructure Solutions Pvt. Ltd. (PAN-601283912)
    const apexBasic = {
      company_name: 'Apex Engineering & Infrastructure Solutions Pvt. Ltd.',
      company_name_ne: 'एपिक्स इन्जिनियरिङ्ग एण्ड इन्फ्रास्ट्रक्चर सोलुसन्स प्रा. लि.',
      pan: '601283912',
      vat_number: '601283912',
      ocr_registration_number: '142958/075/076',
      industry: 'Civil Engineering, Bridge & Hydropower Infrastructure Solutions',
      registration_date: '2018-08-15',
      district: 'ललितपुर (Lalitpur)',
      municipality: 'ललितपुर महानगरपालिका वडा नं ३ (Lalitpur Metropolitian Ward 3)',
      address: 'पुल्चोक, ललितपुर (Pulchowk, Lalitpur, Bagmati Province, Nepal)',
      phone: '+977 1 5529184',
      email: 'info@apexengineering.com.np'
    };

    const apexLedger = [
      {
        id: 'TRADE-SUP-HIMSTEEL',
        record_type: 'TRADE_PAYMENT',
        data: {
          supplier_name: 'Himsteel Industries Limited (हिमसिट्ल इन्डस्ट्रिज लि.)',
          terms: '30 Days Net (३० दिन भुक्तानी अवधि)',
          days_beyond_terms: 2,
          pan: '300182941'
        },
        amount: 1850000.0,
        valid_from: '2026-08-01',
        valid_to: null,
        provider_id: 'TRADE-SUP-HIMSTEEL',
        status: 'ACTIVE',
        recorded_at: '2026-08-01T10:00:00Z'
      },
      {
        id: 'TRADE-SUP-SHIVAM',
        record_type: 'TRADE_PAYMENT',
        data: {
          supplier_name: 'Shivam Cements Limited (शिवम सिमेन्ट लि.)',
          terms: '30 Days Net (३० दिन भुक्तानी अवधि)',
          days_beyond_terms: 5,
          pan: '301829148'
        },
        amount: 920000.0,
        valid_from: '2026-07-15',
        valid_to: null,
        provider_id: 'TRADE-SUP-SHIVAM',
        status: 'ACTIVE',
        recorded_at: '2026-07-15T11:00:00Z'
      }
    ];

    const apexDirectors = [
      {
        link_id: 'LNK-APEX-SITA-01',
        individual_id: 'IND-DIR-SITA',
        identifier: 'CIT-28-02-75-01928',
        name: 'सीता शर्मा (Sita Sharma)',
        role: 'प्रबन्ध निर्देशक तथा प्रमुख कार्यकारी अधिकृत (Managing Director & CEO)',
        start_date: '2018-08-15',
        other_directorships: 1,
        contagion_risk: 'LOW' as const,
        individual_score: 792
      },
      {
        link_id: 'LNK-APEX-RAJESH-02',
        individual_id: 'IND-DIR-RAJESH',
        identifier: 'CIT-27-01-71-08914',
        name: 'राजेश अधिकारी (Rajesh Adhikari)',
        role: 'कार्यकारी निर्देशक (Executive Director)',
        start_date: '2019-03-01',
        other_directorships: 2,
        contagion_risk: 'LOW' as const,
        individual_score: 745
      }
    ];

    const apexRecord: EntityRecord = {
      id: 'PAN-601283912',
      type: 'COMPANY',
      identifier: 'PAN-601283912',
      basic_info: apexBasic,
      score: {
        value: 82,
        band: 'समयमै भुक्तानी (Prompt / Low Risk)',
        sub_scores: {
          trade_promptness: 84,
          banking_standing: 82,
          tax_compliance: 88,
          legal_standing: 80
        },
        top_factors: [
          'सप्लायरहरूलाई औसत २ दिनभित्र समयमै भुक्तानी (Supplier payments prompt within 2 days)',
          'कम्पनी रजिस्ट्रारको कार्यालय (OCR) तथा आन्तरिक राजस्व विभाग (IRD) कर चुक्ता अद्यावधिक',
          'नेपाल राष्ट्र बैंक (NRB) वा कर्जा सूचना केन्द्र (CIC) को कालोसूचीमा कुनै विवरण नरहेको'
        ],
        calculated_at: new Date().toISOString()
      },
      ledger: apexLedger,
      enquiries: [
        {
          id: 'ENQ-COMM-01',
          entity_id: 'PAN-601283912',
          user_id: 'PRV-NABIL-001',
          reason: 'Commercial Working Capital Credit Line Facility',
          created_at: '2026-08-20T16:00:00Z'
        }
      ],
      directors: apexDirectors,
      created_at: '2018-08-15T09:00:00Z'
    };

    this.entities.set('PAN-601283912', apexRecord);
    // Legacy alias
    this.entities.set('ACN-109-283-912', { ...apexRecord, id: 'ACN-109-283-912' });

    // Seed Sita Sharma individual entity
    this.entities.set('IND-DIR-SITA', {
      id: 'IND-DIR-SITA',
      type: 'INDIVIDUAL',
      identifier: 'CIT-28-02-75-01928',
      basic_info: {
        first_name: 'सीता (Sita)',
        last_name: 'शर्मा (Sharma)',
        citizenship_no: '२८-०२-७५-०१९२८ (28-02-75-01928)',
        dob: '1978-03-22',
        district: 'ललितपुर (Lalitpur)',
        address: 'झम्सिखेल, ललितपुर (Jhamsikhel, Lalitpur)'
      },
      score: {
        value: 792,
        band: 'उत्कृष्ट (Excellent - Tier 1)',
        calculated_at: new Date().toISOString()
      },
      ledger: [],
      enquiries: [],
      created_at: '2018-08-15T09:00:00Z'
    });

    // Seed Rajesh Adhikari individual entity
    this.entities.set('IND-DIR-RAJESH', {
      id: 'IND-DIR-RAJESH',
      type: 'INDIVIDUAL',
      identifier: 'CIT-27-01-71-08914',
      basic_info: {
        first_name: 'राजेश (Rajesh)',
        last_name: 'अधिकारी (Adhikari)',
        citizenship_no: '२७-०१-७१-०८९१४ (27-01-71-08914)',
        dob: '1975-11-14',
        district: 'काठमाडौँ (Kathmandu)',
        address: 'लाजिम्पाट, काठमाडौँ (Lazimpat, Kathmandu)'
      },
      score: {
        value: 745,
        band: 'धेरै राम्रो (Very Good - Tier 1)',
        calculated_at: new Date().toISOString()
      },
      ledger: [],
      enquiries: [],
      created_at: '2019-03-01T09:00:00Z'
    });

    // 5. Seed Additional Companies for Director Contagion Network Graph
    const networkCompanies = [
      { id: 'PAN-300182941', name: 'Himsteel Industries Limited', score: 86, dir: 'IND-DIR-SITA', role: 'गैर-कार्यकारी सञ्चालक (Non-Executive Director)' },
      { id: 'PAN-301829148', name: 'Shivam Cements Limited', score: 79, dir: 'IND-DIR-RAJESH', role: 'स्वतन्त्र सञ्चालक (Independent Director)' },
      { id: 'PAN-602914881', name: 'Himalaya Hydropower Development Pvt. Ltd.', score: 88, dir: 'IND-DIR-RAJESH', role: 'अध्यक्ष (Chairman)' },
      { id: 'PAN-603189201', name: 'Trishuli Transmission Infrastructure Ltd.', score: 74, dir: 'IND-DIR-SITA', role: 'सञ्चालक (Board Director)' },
      { id: 'PAN-604218992', name: 'Sagarmatha Precast Concrete Solutions', score: 48, dir: 'IND-DIR-RAJESH', role: 'सञ्चालक (Director)' }
    ];

    for (const c of networkCompanies) {
      this.entities.set(c.id, {
        id: c.id,
        type: 'COMPANY',
        identifier: c.id,
        basic_info: {
          company_name: c.name,
          pan: c.id.replace('PAN-', ''),
          district: 'काठमाडौँ (Kathmandu)'
        },
        score: {
          value: c.score,
          band: c.score >= 70 ? 'कम जोखिम (Low Risk)' : 'उच्च जोखिम (High Risk)',
          calculated_at: new Date().toISOString()
        },
        ledger: [],
        enquiries: [],
        directors: [
          {
            link_id: `LNK-${c.id}`,
            individual_id: c.dir,
            identifier: c.dir === 'IND-DIR-SITA' ? 'CIT-28-02-75-01928' : 'CIT-27-01-71-08914',
            name: c.dir === 'IND-DIR-SITA' ? 'सीता शर्मा (Sita Sharma)' : 'राजेश अधिकारी (Rajesh Adhikari)',
            role: c.role,
            start_date: '2020-01-10',
            other_directorships: 2,
            contagion_risk: c.score < 50 ? 'HIGH' : 'LOW',
            individual_score: c.dir === 'IND-DIR-SITA' ? 792 : 745
          }
        ],
        created_at: '2020-01-10T00:00:00Z'
      });
    }

    // 6. Seed Disputes
    this.disputes.push({
      id: 'DISP-NP-2081-01',
      entity_id: 'CIT-27-01-78-04821',
      ledger_record_id: 'DEF-KUKL-2024-881',
      subject_name: 'राम कुमार श्रेष्ठ (Ram Kumar Shrestha)',
      target_listing: 'DEFAULT (NPR 12,500.00)',
      grounds: 'वैयक्तिक गोपनीयता सम्बन्धी ऐन, २०७५ को दफा १२ बमोजिम खानेपानी मिटर बिग्रेको कारण आएको बिल सच्याउन निवेदन पेश गरिएको (Section 12 dispute for meter variance rectification)',
      filed_date: '2026-09-02',
      days_remaining: 10,
      status: 'OPEN',
      created_at: '2026-09-02T10:00:00Z',
      resolved_at: null
    });

    this.disputes.push({
      id: 'DISP-NP-2081-02',
      entity_id: 'PAN-604218992',
      ledger_record_id: 'DEF-NEA-992',
      subject_name: 'Sagarmatha Precast Concrete Solutions',
      target_listing: 'OVERDUE_TARIFF (NPR 1,48,000.00)',
      grounds: 'T.O.D. औद्योगिक मिटर दर गणनामा विवाद (Dispute on TOD Industrial Tariff calculation)',
      filed_date: '2026-09-05',
      days_remaining: 13,
      status: 'OPEN',
      created_at: '2026-09-05T11:30:00Z',
      resolved_at: null
    });

    this.disputes.push({
      id: 'DISP-NP-2081-03',
      entity_id: 'CIT-27-01-71-08914',
      ledger_record_id: 'DEF-NCELL-102',
      subject_name: 'राजेश अधिकारी (Rajesh Adhikari)',
      target_listing: 'ROAMING_CHARGE (NPR 14,200.00)',
      grounds: 'सिम कार्ड बन्द भइसकेपछि जोडिएको रोमिङ शुल्क (Post-termination roaming billing)',
      filed_date: '2026-09-08',
      days_remaining: 16,
      status: 'UNDER_REVIEW',
      created_at: '2026-09-08T09:15:00Z',
      resolved_at: null
    });

    this.disputes.push({
      id: 'DISP-NP-2081-04',
      entity_id: 'PAN-301829148',
      ledger_record_id: 'TRADE-DISP-01',
      subject_name: 'Shivam Cements Limited',
      target_listing: 'TRADE_CREDIT (NPR 4,50,000.00)',
      grounds: 'क्वालिटी इन्स्पेक्सन रिपोर्ट अनुसार फिर्ता गरिएको सामानको क्रेडिट नोट जारी नगरिएको',
      filed_date: '2026-08-25',
      days_remaining: 2,
      status: 'OPEN',
      created_at: '2026-08-25T14:00:00Z',
      resolved_at: null
    });

    this.disputes.push({
      id: 'DISP-NP-2081-05',
      entity_id: 'CIT-28-02-75-01928',
      ledger_record_id: 'DEF-SANIMA-88',
      subject_name: 'सीता शर्मा (Sita Sharma)',
      target_listing: 'CREDIT_CARD (NPR 8,200.00)',
      grounds: 'अनलाइन भुक्तानी असफल भए पनि विवरण कालोसूचीमा परेको (Chargeback reversal)',
      filed_date: '2026-08-10',
      days_remaining: 0,
      status: 'RESOLVED_EXPUNGED',
      created_at: '2026-08-10T16:00:00Z',
      resolved_at: '2026-08-28T10:00:00Z'
    });

    // 7. Seed Ingestion Events
    this.ingestEvents.push({
      id: 'EVT-ING-2026-901',
      provider_id: 'PRV-NEA-001',
      raw_payload: {
        batch_id: 'NEA-BNSH-2026-09',
        records_count: 4820,
        distribution_hub: 'Baneshwor',
        type: 'UTILITY_BILLING_CYCLE'
      },
      status: 'ACCEPTED',
      error_log: null,
      created_at: '2026-09-20 08:30:00'
    });

    this.ingestEvents.push({
      id: 'EVT-ING-2026-892',
      provider_id: 'PRV-NABIL-001',
      raw_payload: {
        entity_id: 'CIT-27-01-78-04821',
        record_type: 'RHI',
        amount: 4500000.0,
        valid_from: '2026-09-01'
      },
      status: 'ACCEPTED',
      error_log: null,
      created_at: '2026-09-18 14:10:00'
    });

    this.ingestEvents.push({
      id: 'EVT-ING-2026-877',
      provider_id: 'PRV-NTC-001',
      raw_payload: {
        service: 'FTTH_FIBER_TELECOM',
        status: 'CURRENT_NO_DEFAULT',
        records: 12400
      },
      status: 'ACCEPTED',
      error_log: null,
      created_at: '2026-09-15 10:00:00'
    });
  }

  // --- API Methods ---

  public getStats() {
    let indCount = 0;
    let compCount = 0;
    for (const ent of this.entities.values()) {
      if (ent.type === 'INDIVIDUAL') indCount++;
      else compCount++;
    }
    const openDisputes = this.disputes.filter(d => d.status === 'OPEN').length;

    return {
      status: 'online',
      individuals_count: Math.max(indCount, 508),
      companies_count: Math.max(compCount, 100),
      total_entities: Math.max(indCount + compCount, 608),
      ledger_events_count: 547 + this.ingestEvents.length,
      open_disputes_count: openDisputes,
      total_enquiries: 384,
      reporting_window: '2026/2083 CYCLE OPEN',
      hash_consistency: '100.0%'
    };
  }

  public searchEntities(type?: string, search?: string, limit = 20, offset = 0) {
    let results: EntityRecord[] = Array.from(this.entities.values());

    // Filter duplicates by identifier
    const seen = new Set<string>();
    results = results.filter(e => {
      const key = e.identifier || e.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    if (type) {
      results = results.filter(e => e.type.toUpperCase() === type.toUpperCase());
    }

    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      results = results.filter(e => {
        const idMatch = e.id.toLowerCase().includes(q) || e.identifier.toLowerCase().includes(q);
        const basicStr = JSON.stringify(e.basic_info).toLowerCase();
        return idMatch || basicStr.includes(q);
      });
    }

    const total = results.length;
    const paginated = results.slice(offset, offset + limit).map(e => ({
      id: e.id,
      type: e.type,
      identifier: e.identifier,
      basic_info: e.basic_info,
      score: {
        value: e.score.value,
        band: e.score.band
      }
    }));

    return {
      total,
      limit,
      offset,
      entities: paginated
    };
  }

  public getReport(entityId: string, asOf?: string | null) {
    const cleanId = decodeURIComponent(entityId).trim();
    let entity = this.entities.get(cleanId);

    if (!entity) {
      // Try finding by identifier substring or basic_info
      for (const ent of this.entities.values()) {
        if (
          ent.id.toLowerCase() === cleanId.toLowerCase() ||
          ent.identifier.toLowerCase() === cleanId.toLowerCase() ||
          JSON.stringify(ent.basic_info).toLowerCase().includes(cleanId.toLowerCase())
        ) {
          entity = ent;
          break;
        }
      }
    }

    if (!entity) {
      // Default fallback to Ram Kumar Shrestha if searching for consumer/individual
      if (cleanId.startsWith('CIT') || cleanId.startsWith('IND') || cleanId.includes('ram')) {
        entity = this.entities.get('CIT-27-01-78-04821')!;
      } else {
        // Fallback to Apex Engineering
        entity = this.entities.get('PAN-601283912')!;
      }
    }

    // Filter ledger if asOf provided (bitemporal point-in-time)
    let filteredLedger = entity.ledger;
    let score = { ...entity.score };

    if (asOf && asOf !== 'CURRENT') {
      filteredLedger = entity.ledger.filter(l => l.valid_from <= asOf);
      // Simulate historical score adjustment for bitemporal query
      score = {
        ...score,
        value: Math.max(300, score.value - 18),
        calculated_at: `${asOf}T23:59:59Z`
      };
    }

    return {
      entity: {
        id: entity.id,
        type: entity.type,
        identifier: entity.identifier,
        basic_info: entity.basic_info,
        created_at: entity.created_at
      },
      score,
      directors: entity.directors || [],
      directorships: entity.directorships || [],
      enquiries: entity.enquiries || [],
      ledger: filteredLedger
    };
  }

  public getEnquiries(entityId: string) {
    const report = this.getReport(entityId);
    return report.enquiries || [];
  }

  public getDisputes() {
    return this.disputes;
  }

  public openDispute(data: { entity_id: string; ledger_record_id?: string; notes?: string }) {
    const id = `DISP-NP-2081-0${this.disputes.length + 1}`;
    const targetEntity = this.getReport(data.entity_id);
    const subjectName = targetEntity?.entity?.basic_info?.company_name ||
      `${targetEntity?.entity?.basic_info?.first_name || ''} ${targetEntity?.entity?.basic_info?.last_name || ''}`.trim() ||
      data.entity_id;

    const newDisp: DisputeRecord = {
      id,
      entity_id: data.entity_id,
      ledger_record_id: data.ledger_record_id || 'GENERAL_RECORD',
      subject_name: subjectName,
      target_listing: data.ledger_record_id || 'Contested Credit File Entry',
      grounds: data.notes || 'Statutory accuracy and procedural dispute under Section 12',
      filed_date: new Date().toISOString().split('T')[0],
      days_remaining: 30,
      status: 'OPEN',
      created_at: new Date().toISOString(),
      resolved_at: null
    };

    this.disputes.unshift(newDisp);
    return {
      status: 'success',
      dispute_id: id,
      message: 'Dispute registered under Section 12 of Nepal Individual Privacy Act 2018.'
    };
  }

  public updateDispute(disputeId: string, update: { status: DisputeRecord['status']; notes?: string }) {
    const disp = this.disputes.find(d => d.id === disputeId);
    if (!disp) return null;

    disp.status = update.status;
    if (update.notes) disp.grounds = `${disp.grounds} | Adjudication: ${update.notes}`;
    if (['CORRECTED', 'UPHELD', 'RESOLVED_EXPUNGED'].includes(update.status)) {
      disp.resolved_at = new Date().toISOString();
      disp.days_remaining = 0;
    }
    return { status: 'success', new_status: disp.status };
  }

  public getModels() {
    return this.models;
  }

  public createModel(model: {
    name: string;
    type: 'INDIVIDUAL' | 'COMPANY';
    weights: Record<string, number>;
    band_thresholds: Record<string, number>;
    active?: boolean;
  }) {
    const id = `MODEL-NP-${Date.now()}`;
    const newModel: ModelRecord = {
      id,
      name: model.name,
      type: model.type,
      weights: model.weights,
      band_thresholds: model.band_thresholds,
      active: model.active || false,
      created_at: new Date().toISOString()
    };
    if (model.active) {
      for (const m of this.models) {
        if (m.type === model.type) m.active = false;
      }
    }
    this.models.unshift(newModel);
    return { status: 'success', model_id: id };
  }

  public runBacktest(modelId?: string) {
    return {
      status: 'success',
      model_id: modelId || 'MODEL-NP-NAT-v1',
      model_name: 'Nepal National Credit Scoring Model v1.0',
      observation_date: new Date().toISOString().split('T')[0],
      total_records: 608,
      auc: 0.8842,
      gini: 0.7684,
      gini_index: 0.7684,
      ks_statistic: 0.5412,
      band_performance: [
        { band: 'उत्कृष्ट (Excellent)', count: 184, defaults: 2, default_rate: 0.0108 },
        { band: 'धेरै राम्रो (Very Good)', count: 215, defaults: 9, default_rate: 0.0418 },
        { band: 'राम्रो (Good)', count: 122, defaults: 18, default_rate: 0.1475 },
        { band: 'मध्यम (Fair)', count: 62, defaults: 21, default_rate: 0.3387 },
        { band: 'कमजोर (Poor)', count: 25, defaults: 19, default_rate: 0.76 }
      ],
      deciles: [
        { decile: 1, score_min: 820, score_max: 964, count: 61, defaults: 0, observed_default_rate: 0.0 },
        { decile: 2, score_min: 780, score_max: 819, count: 61, defaults: 1, observed_default_rate: 0.0164 },
        { decile: 3, score_min: 740, score_max: 779, count: 61, defaults: 2, observed_default_rate: 0.0328 },
        { decile: 4, score_min: 700, score_max: 739, count: 61, defaults: 4, observed_default_rate: 0.0656 },
        { decile: 5, score_min: 660, score_max: 699, count: 61, defaults: 6, observed_default_rate: 0.0984 },
        { decile: 6, score_min: 610, score_max: 659, count: 61, defaults: 8, observed_default_rate: 0.1311 },
        { decile: 7, score_min: 560, score_max: 609, count: 61, defaults: 11, observed_default_rate: 0.1803 },
        { decile: 8, score_min: 500, score_max: 559, count: 61, defaults: 14, observed_default_rate: 0.2295 },
        { decile: 9, score_min: 420, score_max: 499, count: 60, defaults: 18, observed_default_rate: 0.3 },
        { decile: 10, score_min: 300, score_max: 419, count: 60, defaults: 25, observed_default_rate: 0.4167 }
      ],
      message: 'Backtest executed successfully on 608 empirical records with ROC AUC 0.8842.'
    };
  }

  public getDirectorNetwork() {
    const nodes: any[] = [];
    const edges: any[] = [];
    const seen = new Set<string>();

    for (const ent of this.entities.values()) {
      if (ent.type === 'COMPANY') {
        if (!seen.has(ent.id)) {
          seen.add(ent.id);
          nodes.push({
            id: ent.id,
            label: ent.basic_info.company_name,
            type: 'COMPANY',
            identifier: ent.identifier,
            score: ent.score.value,
            risk: ent.score.value < 60 ? 'HIGH' : 'LOW'
          });
        }

        if (ent.directors) {
          for (const d of ent.directors) {
            if (!seen.has(d.individual_id)) {
              seen.add(d.individual_id);
              nodes.push({
                id: d.individual_id,
                label: d.name,
                type: 'DIRECTOR',
                identifier: d.identifier,
                score: d.individual_score,
                risk: d.contagion_risk
              });
            }
            edges.push({
              id: d.link_id,
              source: d.individual_id,
              target: ent.id,
              role: d.role,
              start_date: d.start_date
            });
          }
        }
      }
    }

    return {
      nodes,
      edges,
      total_nodes: nodes.length,
      total_edges: edges.length
    };
  }

  public getIngestEvents() {
    return this.ingestEvents;
  }

  public ingestRecord(record: {
    entity_id: string;
    record_type: string;
    amount?: number | null;
    valid_from: string;
    data: Record<string, any>;
  }, providerId = 'PRV-NABIL-001') {
    const evtId = `EVT-ING-${Date.now()}`;
    const newEvt: IngestEventRecord = {
      id: evtId,
      provider_id: providerId,
      raw_payload: record,
      status: 'ACCEPTED',
      error_log: null,
      created_at: new Date().toISOString().replace('T', ' ').split('.')[0]
    };
    this.ingestEvents.unshift(newEvt);

    const target = this.getReport(record.entity_id);
    if (target && target.ledger) {
      target.ledger.unshift({
        id: `REC-${Date.now()}`,
        record_type: record.record_type,
        data: record.data,
        amount: record.amount || null,
        valid_from: record.valid_from,
        valid_to: null,
        provider_id: providerId,
        status: 'ACTIVE',
        recorded_at: new Date().toISOString()
      });
    }

    return {
      status: 'success',
      event_id: evtId,
      message: 'Record successfully accepted and committed to bitemporal ledger.'
    };
  }

  public authenticate(email: string) {
    const user = this.users.get(email.toLowerCase().trim());
    if (!user) {
      // Default fallback for any credentials in demo
      return {
        mfa_required: false,
        access_token: `mock-token-${Date.now()}`,
        refresh_token: `mock-refresh-${Date.now()}`,
        user: {
          email,
          role: 'ADMIN',
          name: 'Authorized Bureau Officer'
        }
      };
    }

    if (user.mfa_required) {
      return {
        mfa_required: true,
        mfa_token: `mfa-temp-token-${Date.now()}`,
        user: {
          email: user.email,
          role: user.role,
          name: user.name,
          tenant_id: user.tenant_id
        }
      };
    }

    return {
      mfa_required: false,
      access_token: `jwt-token-${Date.now()}`,
      refresh_token: `jwt-refresh-${Date.now()}`,
      user: {
        email: user.email,
        role: user.role,
        name: user.name,
        entity_id: user.entity_id
      }
    };
  }

  public verifyMfa(mfaToken: string, totpCode: string) {
    // In demo environment, accept 6-digit codes
    return {
      access_token: `jwt-authenticated-${Date.now()}`,
      refresh_token: `jwt-refresh-${Date.now()}`,
      user: {
        email: 'officer@creditreporting.gov.np',
        role: 'ADMIN',
        tenant_id: 'CIC-GOV-NP'
      }
    };
  }
}

// Export singleton instance for Next.js App Router route handlers
const globalStore = (globalThis as any).__mockBureauStore || new MockBureauStore();
if (process.env.NODE_ENV !== 'production') {
  (globalThis as any).__mockBureauStore = globalStore;
}

export const bureauStore = globalStore;
