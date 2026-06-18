import { app } from 'electron';
import fs from 'fs';
import path from 'path';

interface CacheEntry<T = any> {
    data: T;
    expiry: number;
    createdAt: number;
}

export class CacheService {
    private store = new Map<string, CacheEntry>();
    private cachePath = path.join(app.getPath('userData'), 'dashboard-cache.json');
    private savePromise: Promise<void> | null = null;
    private dirty = false;

    constructor() {
        this.loadFromDisk();
    }

    private loadFromDisk() {
        try {
            if (fs.existsSync(this.cachePath)) {
                const raw = fs.readFileSync(this.cachePath, 'utf-8');
                const parsed = JSON.parse(raw);
                this.store = new Map(Object.entries(parsed));
            }
        } catch (err) {
            console.error('Cache load error:', err);
        }
    }

    /**
     * Persists the cache using asynchronous file I/O instead of blocking the
     * Electron main thread with `fs.writeFileSync`. A `savePromise` + `dirty`
     * flag serialize consecutive writes: while a write is in flight, later calls
     * just mark the cache dirty, and the latest state is flushed once the current
     * write settles — no data loss, near-zero main-thread blocking.
     */
    private saveToDisk() {
        if (this.savePromise) {
            this.dirty = true;
            return;
        }

        try {
            const raw = JSON.stringify(Object.fromEntries(this.store));
            this.savePromise = fs.promises.writeFile(this.cachePath, raw)
                .then(() => {
                    this.savePromise = null;
                    if (this.dirty) {
                        this.dirty = false;
                        this.saveToDisk();
                    }
                })
                .catch((err) => {
                    console.error('Cache save async error:', err);
                    this.savePromise = null;
                });
        } catch (err) {
            console.error('Cache save serialization error:', err);
        }
    }

    get<T>(key: string): T | null {
        const entry = this.store.get(key);
        if (!entry) return null;
        if (Date.now() > entry.expiry) {
            this.store.delete(key);
            this.saveToDisk();
            return null;
        }
        return entry.data as T;
    }

    set<T>(key: string, data: T, ttlMs: number): void {
        this.store.set(key, { data, expiry: Date.now() + ttlMs, createdAt: Date.now() });
        this.saveToDisk();
    }

    getWithMeta<T>(key: string): { data: T; createdAt: number } | null {
        const entry = this.store.get(key);
        if (!entry) return null;
        if (Date.now() > entry.expiry) {
            this.store.delete(key);
            this.saveToDisk();
            return null;
        }
        return { data: entry.data as T, createdAt: entry.createdAt };
    }

    invalidate(key: string): void {
        this.store.delete(key);
        this.saveToDisk();
    }

    /** Wipes the in-memory store and removes the on-disk cache file (factory reset). */
    clear(): void {
        this.store.clear();
        try {
            if (fs.existsSync(this.cachePath)) fs.unlinkSync(this.cachePath);
        } catch (err) {
            console.error('Cache clear error:', err);
        }
    }
}
