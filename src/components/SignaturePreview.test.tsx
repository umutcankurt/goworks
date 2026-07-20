import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SignaturePreview } from './SignaturePreview';

/**
 * The component became an IPC client, so its correctness now lives in effect
 * plumbing — debounce coalescing, out-of-order responses, and dependency
 * identity — none of which is visible by reading the JSX.
 */

vi.mock('../services/server-api', () => ({
    templatesApi: { renderPreview: vi.fn() },
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string) => k }),
}));

const { templatesApi } = await import('../services/server-api');
const renderPreview = templatesApi.renderPreview as unknown as ReturnType<typeof vi.fn>;

/** Advance past the debounce and let the resolved promise flush. */
async function flush(ms = 300) {
    await act(async () => {
        vi.advanceTimersByTime(ms);
        await Promise.resolve();
    });
}

function frameHtml(): string {
    return (screen.getByTitle('Signature Preview') as HTMLIFrameElement).getAttribute('srcDoc') ?? '';
}

beforeEach(() => {
    vi.useFakeTimers();
    renderPreview.mockReset();
    renderPreview.mockResolvedValue({ html: '<p>ok</p>' });
});

afterEach(() => {
    vi.useRealTimers();
});

describe('SignaturePreview — IPC render', () => {
    it('renders the html the main process returns', async () => {
        render(<SignaturePreview html="<p>{{ad_soyad}}</p>" />);
        await flush();

        expect(frameHtml()).toContain('<p>ok</p>');
    });

    it('coalesces a typing burst into a single render', async () => {
        const { rerender } = render(<SignaturePreview html="a" />);
        await flush(); // first paint is deliberately not debounced

        renderPreview.mockClear();
        rerender(<SignaturePreview html="ab" />);
        act(() => { vi.advanceTimersByTime(50); });
        rerender(<SignaturePreview html="abc" />);
        act(() => { vi.advanceTimersByTime(50); });
        rerender(<SignaturePreview html="abcd" />);
        await flush();

        expect(renderPreview).toHaveBeenCalledTimes(1);
        expect(renderPreview.mock.calls[0][0]).toMatchObject({ html: 'abcd' });
    });

    it('ignores a superseded response that arrives late', async () => {
        // Request 1 resolves AFTER request 2. Without the sequence latch the stale
        // body wins and the pane shows text the user already edited away.
        let resolveFirst: (v: unknown) => void = () => { };
        renderPreview.mockImplementationOnce(() => new Promise((r) => { resolveFirst = r; }));

        const { rerender } = render(<SignaturePreview html="first" />);
        await flush();

        renderPreview.mockResolvedValueOnce({ html: '<p>second</p>' });
        rerender(<SignaturePreview html="second" />);
        await flush();

        await act(async () => {
            resolveFirst({ html: '<p>first</p>' });
            await Promise.resolve();
        });

        expect(frameHtml()).toContain('second');
        expect(frameHtml()).not.toContain('<p>first</p>');
    });

    it('does not re-render for a new object with identical variables', async () => {
        // The infinite-loop guard. Two of three call sites build a fresh literal on
        // every render, so identity-based deps would loop forever once the effect
        // calls setState.
        const { rerender } = render(
            <SignaturePreview html="x" variables={{ ad_soyad: 'Ayşe', unvan: 'Müdür' }} />,
        );
        await flush();
        renderPreview.mockClear();

        rerender(<SignaturePreview html="x" variables={{ ad_soyad: 'Ayşe', unvan: 'Müdür' }} />);
        await flush();

        expect(renderPreview).not.toHaveBeenCalled();
    });

    it('is insensitive to variable key order', async () => {
        // NewUser appends media keys via Object.fromEntries, so the same set can
        // serialise two ways; plain JSON.stringify would see a spurious change.
        const { rerender } = render(
            <SignaturePreview html="x" variables={{ a: '1', b: '2' }} />,
        );
        await flush();
        renderPreview.mockClear();

        rerender(<SignaturePreview html="x" variables={{ b: '2', a: '1' }} />);
        await flush();

        expect(renderPreview).not.toHaveBeenCalled();
    });

    it('re-renders when a variable value actually changes', async () => {
        const { rerender } = render(<SignaturePreview html="x" variables={{ unvan: 'Müdür' }} />);
        await flush();
        renderPreview.mockClear();

        rerender(<SignaturePreview html="x" variables={{ unvan: 'Uzman' }} />);
        await flush();

        expect(renderPreview).toHaveBeenCalledTimes(1);
    });

    it('re-renders when revision changes even though html and variables do not', async () => {
        // Media lives outside htmlContent, so uploading an image changes nothing
        // else the effect depends on.
        const { rerender } = render(<SignaturePreview html="x" revision="v1" />);
        await flush();
        renderPreview.mockClear();

        rerender(<SignaturePreview html="x" revision="v2" />);
        await flush();

        expect(renderPreview).toHaveBeenCalledTimes(1);
    });

    it('keeps the last good frame when a render fails', async () => {
        // The editor is a raw textarea, so a conditional block is unbalanced on
        // nearly every keystroke while being typed. Blanking here would strobe.
        const { rerender } = render(<SignaturePreview html="good" />);
        await flush();
        expect(frameHtml()).toContain('<p>ok</p>');

        renderPreview.mockRejectedValueOnce(new Error('Kapatılmamış koşullu blok'));
        rerender(<SignaturePreview html="<div data-condition='x'>" />);
        await flush();

        expect(screen.getByText('Kapatılmamış koşullu blok')).toBeInTheDocument();
        expect(frameHtml()).toContain('<p>ok</p>');
    });

    it('does not call the main process for an empty buffer', async () => {
        // requireString rejects '', and SignatureTemplates' "new template" button
        // produces exactly that.
        render(<SignaturePreview html="   " />);
        await flush();

        expect(renderPreview).not.toHaveBeenCalled();
    });

    it('forwards raw mode without variables', async () => {
        render(<SignaturePreview html="<p>x</p>" mode="raw" />);
        await flush();

        expect(renderPreview.mock.calls[0][0]).toMatchObject({ mode: 'raw' });
    });
});
