import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CacheService } from './cache-service';

const fsMock = vi.hoisted(() => ({
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    unlinkSync: vi.fn(),
    // saveToDisk persists asynchronously via fs.promises.writeFile.
    promises: {
        writeFile: vi.fn().mockResolvedValue(undefined),
    },
}));

vi.mock('electron', () => ({
    app: { getPath: vi.fn(() => '/tmp/test-userData') },
}));

vi.mock('fs', () => ({ default: fsMock, ...fsMock }));

describe('CacheService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
    });

    it('should initialize empty store and continue normally when fs.readFileSync throws', () => {
        // Arrange
        fsMock.existsSync.mockReturnValue(true);
        fsMock.readFileSync.mockImplementation(() => {
            throw new Error('Test read error');
        });

        // Suppress console.error for this test as it's expected
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        // Act
        const cacheService = new CacheService();

        // Assert
        expect(consoleSpy).toHaveBeenCalledWith('Cache load error:', expect.any(Error));

        // Ensure the store is empty and we can still use the service
        cacheService.set('test-key', 'test-value', 1000);
        expect(cacheService.get('test-key')).toBe('test-value');

        consoleSpy.mockRestore();
    });

    it('should load data from disk successfully', () => {
        const mockData = {
            'test-key': {
                data: 'test-value',
                expiry: Date.now() + 1000,
                createdAt: Date.now()
            }
        };

        fsMock.existsSync.mockReturnValue(true);
        fsMock.readFileSync.mockReturnValue(JSON.stringify(mockData));

        const cacheService = new CacheService();
        expect(cacheService.get('test-key')).toBe('test-value');
    });

    it('should save data to disk when setting a key', () => {
        fsMock.existsSync.mockReturnValue(false);
        const cacheService = new CacheService();

        cacheService.set('key1', 'value1', 5000);

        expect(fsMock.promises.writeFile).toHaveBeenCalledTimes(1);
        expect(fsMock.promises.writeFile).toHaveBeenCalledWith(
            expect.any(String),
            expect.stringContaining('value1')
        );
    });

    it('should return null for expired items', () => {
        fsMock.existsSync.mockReturnValue(false);
        const cacheService = new CacheService();

        cacheService.set('expire-key', 'value', 1000);

        // Advance time past the TTL
        vi.advanceTimersByTime(2000);

        expect(cacheService.get('expire-key')).toBeNull();
    });

    it('should invalidate an item', () => {
        fsMock.existsSync.mockReturnValue(false);
        const cacheService = new CacheService();

        cacheService.set('key', 'val', 1000);
        expect(cacheService.get('key')).toBe('val');

        cacheService.invalidate('key');
        expect(cacheService.get('key')).toBeNull();
    });

    it('should clear the cache store and remove file', () => {
        fsMock.existsSync.mockReturnValue(true);
        const cacheService = new CacheService();

        cacheService.set('key', 'val', 1000);

        cacheService.clear();

        expect(cacheService.get('key')).toBeNull();
        expect(fsMock.unlinkSync).toHaveBeenCalled();
    });
});
