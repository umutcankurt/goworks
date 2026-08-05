// Locale profiles for demo mode.
//
// A profile is *only* the strings that differ between the Turkish and English
// prototype tenants. Everything structural (how many users, which ones are
// suspended, group membership, job history) is derived from these in
// `build.ts`, so the two datasets stay structurally identical — the screenshot
// sets line up one-to-one.
//
// The company names and domains here are placeholders, not real organisations.
// Phone numbers come from ranges reserved for fiction (+1 555-01xx, Ofcom's
// +44 20 7946 0xxx) and login-activity IPs from RFC 5737's 203.0.113.0/24.

export interface DemoProfile {
    lang: 'tr' | 'en';
    companyName: string;
    sidebarAbbr: string;
    emailSenderName: string;
    domain: string;
    secondaryDomain: string;
    adminGivenName: string;
    adminFamilyName: string;
    adminLocalPart: string;
    /** Dial prefix for generated user phone numbers, e.g. '+90 532 000 00'. */
    phonePrefix: string;
    orgUnits: string[];
    titles: string[];
    institutions: Array<{ name: string; address: string; phone: string }>;
    groups: Array<{ localPart: string; name: string; description: string }>;
    givenNames: string[];
    familyNames: string[];
    templateNames: [string, string, string, string];
    mediaNames: [string, string, string];
    /** Signature line labels ("Mobile", "Office"...). */
    signatureLabels: { mobile: string; office: string; web: string };
    /** Error strings shown in failed job reports. */
    jobErrors: string[];
    auditReasons: { drift: string; noSignature: string; missingData: string; error: string };
    /**
     * CSV validation errors for the bulk-operations analysis step. Mirrors
     * `MESSAGES` in `electron/services/csv-analysis.ts` — the renderer cannot
     * import that module (it pulls in institutionService → SQLite), so the
     * wording is duplicated here deliberately. Keep the two in sync.
     */
    csvErrors: {
        missingRequired: (field: string) => string;
        invalidEmail: (email: string) => string;
        duplicate: string;
        userNotFound: string;
        institutionNotFound: (name: string) => string;
        groupNotFound: (email: string) => string;
    };
}

export const trProfile: DemoProfile = {
    lang: 'tr',
    companyName: 'ABC Şirketi',
    sidebarAbbr: 'ABC',
    emailSenderName: 'ABC Bilgi İşlem',
    domain: 'abcsirketi.com',
    secondaryDomain: 'abcsirketi.com.tr',
    adminGivenName: 'Demo',
    adminFamilyName: 'Yönetici',
    adminLocalPart: 'demo.yonetici',
    phonePrefix: '+90 532 000 00',
    orgUnits: ['Genel Müdürlük', 'Satış', 'Pazarlama', 'Bilgi İşlem', 'İnsan Kaynakları', 'Finans'],
    titles: [
        'Yazılım Geliştirici',
        'Sistem Yöneticisi',
        'DevOps Mühendisi',
        'Veri Analisti',
        'Satış Müdürü',
        'Satış Temsilcisi',
        'Pazarlama Uzmanı',
        'Grafik Tasarımcı',
        'İK Uzmanı',
        'Muhasebe Uzmanı',
        'Finans Analisti',
        'Proje Yöneticisi',
    ],
    institutions: [
        { name: 'ABC Genel Müdürlük', address: 'Maslak Mah. Büyükdere Cad. No:1, Sarıyer/İstanbul', phone: '+90 212 000 00 00' },
        { name: 'ABC Ankara Şubesi', address: 'Çankaya Mah. Atatürk Bul. No:12, Çankaya/Ankara', phone: '+90 312 000 00 00' },
        { name: 'ABC İzmir Şubesi', address: 'Alsancak Mah. Kıbrıs Şehitleri Cad. No:5, Konak/İzmir', phone: '+90 232 000 00 00' },
        { name: 'ABC Bursa Şubesi', address: 'Nilüfer Mah. Ata Bul. No:9, Nilüfer/Bursa', phone: '+90 224 000 00 00' },
    ],
    groups: [
        { localPart: 'yonetim', name: 'Yönetim', description: 'Üst yönetim ekibi' },
        { localPart: 'bilgi-islem', name: 'Bilgi İşlem', description: 'BT ekibi ve sistem yöneticileri' },
        { localPart: 'satis', name: 'Satış', description: 'Satış ekibi' },
        { localPart: 'pazarlama', name: 'Pazarlama', description: 'Pazarlama ve iletişim ekibi' },
        { localPart: 'insan-kaynaklari', name: 'İnsan Kaynakları', description: 'İK ekibi' },
        { localPart: 'finans', name: 'Finans', description: 'Finans ve muhasebe ekibi' },
        { localPart: 'tum-calisanlar', name: 'Tüm Çalışanlar', description: 'Şirket geneli duyuru listesi' },
        { localPart: 'duyurular', name: 'Duyurular', description: 'Salt okunur duyuru listesi' },
        { localPart: 'proje-atlas', name: 'Proje Atlas', description: 'Atlas projesi çalışma grubu' },
        { localPart: 'destek', name: 'Destek', description: 'Müşteri destek hattı' },
    ],
    givenNames: [
        'Ahmet', 'Ayşe', 'Mehmet', 'Zeynep', 'Can', 'Elif', 'Burak', 'Selin',
        'Emre', 'Deniz', 'Merve', 'Ozan', 'Gizem', 'Kerem', 'Buse', 'Tolga',
        'Ceren', 'Serkan', 'Pelin', 'Murat', 'Ebru', 'Hakan', 'Sinem', 'Onur',
    ],
    familyNames: [
        'Yılmaz', 'Demir', 'Kaya', 'Şahin', 'Öztürk', 'Arslan', 'Doğan', 'Aydın',
        'Çelik', 'Koç', 'Yıldız', 'Kurt', 'Polat', 'Aksoy', 'Erdoğan', 'Şimşek',
        'Aktaş', 'Balcı', 'Güneş', 'Özkan', 'Taş', 'Yücel', 'Ateş', 'Bozkurt',
    ],
    templateNames: ['Standart İmza', 'Yönetim İmzası', 'Satış İmzası', 'Sade İmza'],
    mediaNames: ['Şirket Logosu', 'LinkedIn Rozeti', 'Ayraç Çizgisi'],
    signatureLabels: { mobile: 'Cep', office: 'Ofis', web: 'Web' },
    jobErrors: [
        'Kullanıcı bulunamadı (404)',
        'Yetki reddedildi — Domain-Wide Delegation kapsamı eksik',
        'Kota aşıldı (429) — yeniden denenecek',
    ],
    auditReasons: {
        drift: 'Gmail imzası şablonla eşleşmiyor',
        noSignature: 'Kullanıcının imzası tanımlı değil',
        missingData: 'Unvan veya kurum bilgisi eksik',
        error: 'Gmail API erişim hatası',
    },
    csvErrors: {
        missingRequired: (field) => `'${field}' alanı zorunludur.`,
        invalidEmail: (email) => `Geçersiz e-posta formatı: '${email}'`,
        duplicate: 'Bu kayıt CSV\'de tekrar ediyor.',
        userNotFound: 'Kullanıcı dizinde bulunamadı.',
        institutionNotFound: (name) => `Kurum bulunamadı: '${name}'. Lütfen CSV'yi kontrol edin.`,
        groupNotFound: (email) => `Grup bulunamadı: '${email}'`,
    },
};

export const enProfile: DemoProfile = {
    lang: 'en',
    companyName: 'ACME Inc.',
    sidebarAbbr: 'ACME',
    emailSenderName: 'ACME IT',
    domain: 'acme-inc.com',
    secondaryDomain: 'acme-inc.net',
    adminGivenName: 'Demo',
    adminFamilyName: 'Admin',
    adminLocalPart: 'demo.admin',
    phonePrefix: '+1 555 010 01',
    orgUnits: ['Headquarters', 'Sales', 'Marketing', 'IT', 'Human Resources', 'Finance'],
    titles: [
        'Software Engineer',
        'System Administrator',
        'DevOps Engineer',
        'Data Analyst',
        'Sales Manager',
        'Sales Representative',
        'Marketing Specialist',
        'Graphic Designer',
        'HR Specialist',
        'Accountant',
        'Financial Analyst',
        'Project Manager',
    ],
    institutions: [
        { name: 'ACME Headquarters', address: '100 Market Street, San Francisco, CA 94105', phone: '+1 555 010 1000' },
        { name: 'ACME New York Office', address: '250 Park Avenue, New York, NY 10177', phone: '+1 555 010 2000' },
        { name: 'ACME Austin Office', address: '500 Congress Avenue, Austin, TX 78701', phone: '+1 555 010 3000' },
        { name: 'ACME London Office', address: '30 St Mary Axe, London EC3A 8EP', phone: '+44 20 7946 0000' },
    ],
    groups: [
        { localPart: 'leadership', name: 'Leadership', description: 'Executive leadership team' },
        { localPart: 'it', name: 'IT', description: 'IT team and system administrators' },
        { localPart: 'sales', name: 'Sales', description: 'Sales team' },
        { localPart: 'marketing', name: 'Marketing', description: 'Marketing and communications team' },
        { localPart: 'hr', name: 'Human Resources', description: 'HR team' },
        { localPart: 'finance', name: 'Finance', description: 'Finance and accounting team' },
        { localPart: 'all-staff', name: 'All Staff', description: 'Company-wide announcement list' },
        { localPart: 'announcements', name: 'Announcements', description: 'Read-only announcement list' },
        { localPart: 'project-atlas', name: 'Project Atlas', description: 'Atlas project working group' },
        { localPart: 'support', name: 'Support', description: 'Customer support queue' },
    ],
    givenNames: [
        'John', 'Jane', 'Michael', 'Emily', 'David', 'Sarah', 'James', 'Olivia',
        'Daniel', 'Sophia', 'Emma', 'William', 'Ava', 'Ethan', 'Mia', 'Noah',
        'Isabella', 'Liam', 'Charlotte', 'Lucas', 'Amelia', 'Henry', 'Grace', 'Jack',
    ],
    familyNames: [
        'Smith', 'Doe', 'Brown', 'Davis', 'Wilson', 'Miller', 'Taylor', 'Moore',
        'Anderson', 'Thomas', 'Jackson', 'White', 'Harris', 'Martin', 'Thompson', 'Garcia',
        'Martinez', 'Robinson', 'Clark', 'Lewis', 'Walker', 'Hall', 'Allen', 'Young',
    ],
    templateNames: ['Standard Signature', 'Executive Signature', 'Sales Signature', 'Minimal Signature'],
    mediaNames: ['Company Wordmark', 'LinkedIn Badge', 'Divider Rule'],
    signatureLabels: { mobile: 'Mobile', office: 'Office', web: 'Web' },
    jobErrors: [
        'User not found (404)',
        'Permission denied — Domain-Wide Delegation scope missing',
        'Quota exceeded (429) — will retry',
    ],
    auditReasons: {
        drift: 'Gmail signature does not match the template',
        noSignature: 'User has no signature set',
        missingData: 'Title or institution data is missing',
        error: 'Gmail API access error',
    },
    csvErrors: {
        missingRequired: (field) => `The '${field}' field is required.`,
        invalidEmail: (email) => `Invalid email format: '${email}'`,
        duplicate: 'This record is duplicated in the CSV.',
        userNotFound: 'User not found in the directory.',
        institutionNotFound: (name) => `Institution not found: '${name}'. Please check the CSV.`,
        groupNotFound: (email) => `Group not found: '${email}'`,
    },
};

export function profileFor(lang: string | undefined | null): DemoProfile {
    return lang === 'en' ? enProfile : trProfile;
}
