import { GoogleAuth } from 'google-auth-library';
import { getGoogle } from '../google-lazy';
import { getServiceAccountCredentials } from '../secrets/service-account-loader';
import { institutionService } from './institution-service';
import { templateService } from './template-service';
import { renderTemplate, sanitizeTemplateHtml, type TemplateVariables } from './template-renderer';
import { getUserInfo } from './google-admin-sa';
import { formatPhoneForSignature } from './phone';
import { signatureStateService } from './signature-state-service';

const authCache = new Map<string, GoogleAuth>();

function getAuthForUser(userEmail: string): GoogleAuth {
    const existing = authCache.get(userEmail);
    if (existing) return existing;
    const credentials = getServiceAccountCredentials();
    if (!credentials) {
        throw new Error('Service Account yapılandırılmamış. Ayarlar → Service Account sekmesinden JSON yükleyin.');
    }
    const auth = new GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/gmail.settings.basic'],
        clientOptions: { subject: userEmail },
    });
    authCache.set(userEmail, auth);
    return auth;
}

export function clearGmailAuthCache(): void {
    authCache.clear();
}

export async function getSignature(userEmail: string): Promise<string> {
    const auth = getAuthForUser(userEmail);
    const gmail = getGoogle().gmail({ version: 'v1', auth });
    const res = await gmail.users.settings.sendAs.get({
        userId: 'me',
        sendAsEmail: userEmail,
    });
    return res.data.signature || '';
}

export async function setSignature(userEmail: string, html: string): Promise<void> {
    const auth = getAuthForUser(userEmail);
    const gmail = getGoogle().gmail({ version: 'v1', auth });
    await gmail.users.settings.sendAs.update({
        userId: 'me',
        sendAsEmail: userEmail,
        requestBody: { signature: html },
    });
}

export interface PushSignatureInput {
    templateId?: number;
    variables?: Record<string, string>;
    html?: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * A person's signature-related profile fields — a simplified form of the Google Directory data.
 */
export interface SignatureProfile {
    email: string;
    givenName: string;
    familyName: string;
    title: string;
    department: string;
    phone: string;
    suspended?: boolean;
    orgUnitPath?: string;
}

/** Reduces a raw Google Directory user object to a `SignatureProfile`. */
export function profileFromGoogleUser(email: string, user: any): SignatureProfile {
    const org = user?.organizations?.[0] || {};
    return {
        email,
        givenName: user?.name?.givenName || '',
        familyName: user?.name?.familyName || '',
        title: org.title || '',
        department: org.department || '',
        phone: user?.phones?.[0]?.value || '',
        suspended: user?.suspended || false,
        orgUnitPath: user?.orgUnitPath || undefined,
    };
}

/**
 * Builds signature template variables from the profile + the local institution record.
 * `pushSignature`, the bulk push worker, and the Signature Audit scan worker must **all**
 * use this function so the same hash is produced from the same data.
 */
export function buildSignatureVariables(profile: SignatureProfile): TemplateVariables {
    let institutionAddress = '';
    let institutionPhone = '';
    if (profile.department) {
        const institution = institutionService.findByName(profile.department);
        if (institution) {
            institutionAddress = institution.address || '';
            institutionPhone = institution.phone || '';
        }
    }

    return {
        ad_soyad: `${profile.givenName} ${profile.familyName}`.trim(),
        unvan: profile.title,
        kurum_adi: profile.department,
        kurum_adres: institutionAddress,
        kurum_telefon: institutionPhone ? formatPhoneForSignature(institutionPhone) : '',
        telefon: profile.phone ? formatPhoneForSignature(profile.phone) : '',
        eposta: profile.email,
    };
}

/**
 * Resolves a person's signature template variables from their Google Admin profile (SA+DWD).
 */
export async function resolveSignatureVariables(
    userEmail: string,
    adminEmail: string,
): Promise<TemplateVariables> {
    const userInfo = await getUserInfo(userEmail, adminEmail);
    return buildSignatureVariables(profileFromGoogleUser(userEmail, userInfo));
}


export async function pushSignature(
    userEmail: string,
    input: PushSignatureInput,
    adminEmail: string,
): Promise<{ success: true; email: string }> {
    if (!EMAIL_REGEX.test(userEmail)) {
        throw new Error('Geçersiz e-posta adresi');
    }

    // Mode 1: Raw HTML (sanitize then push)
    if (input.html) {
        const html = sanitizeTemplateHtml(input.html);
        await setSignature(userEmail, html);
        signatureStateService.recordPush(userEmail, null, html, null);
        return { success: true, email: userEmail };
    }

    // Mode 2/3: Template-based (if no templateId, resolve the default template)
    let resolvedTemplateId = input.templateId;
    if (!resolvedTemplateId) {
        const def = templateService.getDefault();
        if (def) resolvedTemplateId = def.id;
    }

    if (!resolvedTemplateId) {
        throw new Error('templateId veya html gerekli');
    }

    const tpl = templateService.get(resolvedTemplateId);
    if (!tpl) throw new Error('Şablon bulunamadı');

    let vars: TemplateVariables = input.variables || {};
    if (!input.variables || Object.keys(input.variables).length === 0) {
        // Auto-resolve from Google Admin + the local institution record
        vars = await resolveSignatureVariables(userEmail, adminEmail);
    }

    const html = renderTemplate(tpl.htmlContent, vars);
    await setSignature(userEmail, html);
    signatureStateService.recordPush(userEmail, resolvedTemplateId, html, vars);
    return { success: true, email: userEmail };
}
