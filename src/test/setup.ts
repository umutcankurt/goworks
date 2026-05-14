
import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock window.ipcRenderer for tests (Electron preload is not available in jsdom)
const ipcRenderer = {
    invoke: vi.fn().mockResolvedValue({ success: false, authenticated: false }),
    on: vi.fn(),
    off: vi.fn(),
};

Object.defineProperty(window, 'ipcRenderer', {
    value: ipcRenderer,
    writable: true,
});

// Ensure localStorage is properly available in jsdom
const localStorageMock = (() => {
    let store: Record<string, string> = {};
    return {
        getItem: (key: string) => store[key] ?? null,
        setItem: (key: string, value: string) => { store[key] = value; },
        removeItem: (key: string) => { delete store[key]; },
        clear: () => { store = {}; },
    };
})();

Object.defineProperty(window, 'localStorage', {
    value: localStorageMock,
    writable: true,
});
