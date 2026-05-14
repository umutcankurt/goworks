/// <reference types="vite/client" />

import type { TypedIpcRenderer } from './types/ipc';

interface Window {
    ipcRenderer: TypedIpcRenderer;
}
