import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Trans } from 'react-i18next';
import i18n from './index';

/**
 * Locks the `<Trans>` contract this app actually relies on.
 *
 * react-i18next v17 changed how `transKeepBasicHtmlNodesFor` serialises kept
 * HTML that contains interpolation: `<strong>{{name}}</strong>` used to become
 * `<1>{{name}}</1>`, and now the tag name survives. The release notes warn that
 * "auto-generated keys in translation files require updates".
 *
 * That upgrade was a no-op here — every locale string uses *named* placeholders
 * (`<b>`, `<code>`) bound through the `components` prop, and a sweep of all 22×2
 * namespace files found zero numbered tags. Nothing verified that, though, and
 * `<Trans>` had no test at all, so a future bump could quietly change what these
 * seven call sites render. These cases mirror the real usage:
 *
 *   - named component + interpolated value  (SessionWarningModal, CsvUploadStep,
 *     Settings, GroupsList)
 *   - named component, no values            (Dashboard authError)
 *   - `defaults` with no `i18nKey`          (HelpGuide — the atypical one)
 */

const NS = 'transtest';

// A private namespace keeps this independent of copy edits in the shipped locales.
i18n.addResourceBundle('tr', NS, {
    withValue: 'Oturum <b>{{value}}</b> içinde sona erecek.',
    withoutValue: 'Lütfen <b>Çıkış Yap</b> yapıp tekrar giriş yapın.',
    twoTags: '<b>{{count}}</b> kayıt <code>{{file}}</code> dosyasından okundu.',
});

describe('Trans', () => {
    it('keeps the named component and interpolates the value', () => {
        render(
            <Trans
                i18nKey={`${NS}:withValue`}
                values={{ value: '2:00' }}
                components={{ b: <strong data-testid="bold" /> }}
            />,
        );

        expect(screen.getByTestId('bold')).toHaveTextContent('2:00');
        expect(document.body).toHaveTextContent('Oturum 2:00 içinde sona erecek.');
    });

    it('renders a named component with no interpolation', () => {
        render(
            <Trans
                i18nKey={`${NS}:withoutValue`}
                components={{ b: <strong data-testid="bold" /> }}
            />,
        );

        expect(screen.getByTestId('bold')).toHaveTextContent('Çıkış Yap');
    });

    it('binds each named component separately when a string has two', () => {
        render(
            <Trans
                i18nKey={`${NS}:twoTags`}
                values={{ count: 42, file: 'users.csv' }}
                components={{
                    b: <strong data-testid="bold" />,
                    code: <code data-testid="code" />,
                }}
            />,
        );

        expect(screen.getByTestId('bold')).toHaveTextContent('42');
        expect(screen.getByTestId('code')).toHaveTextContent('users.csv');
    });

    it('renders `defaults` without an i18nKey (the HelpGuide form)', () => {
        render(
            <Trans
                defaults="Şablonu <b>Kaydet</b> ile saklayın, <code>{{token}}</code> tokenını kullanın."
                values={{ token: '{{ad_soyad}}' }}
                components={{
                    b: <strong data-testid="bold" />,
                    code: <code data-testid="code" />,
                }}
            />,
        );

        expect(screen.getByTestId('bold')).toHaveTextContent('Kaydet');
        expect(screen.getByTestId('code')).toHaveTextContent('{{ad_soyad}}');
    });

    it('emits no numbered placeholders — the v17 serialisation change', () => {
        const { container } = render(
            <Trans
                i18nKey={`${NS}:withValue`}
                values={{ value: '2:00' }}
                components={{ b: <strong /> }}
            />,
        );

        expect(container.innerHTML).not.toMatch(/<\d+>/);
    });
});
