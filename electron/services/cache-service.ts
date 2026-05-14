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

    private saveToDisk() {
        try {
            fs.writeFileSync(this.cachePath, JSON.stringify(Object.fromEntries(this.store)));
        } catch (err) {
            console.error('Cache save error:', err);
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
}
