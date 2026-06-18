import { describe, it, expect } from 'vitest';
import { extractDriveFileId, toDirectUrl, toCdnUrl, driveUrlToDirectUrl } from './drive-media';

describe('drive-media', () => {
    describe('extractDriveFileId', () => {
        it('extracts ID from /file/d/ format', () => {
            const url = 'https://drive.google.com/file/d/1B2_a3b4c5d6e7f8g9h0i1j2k3l4m5n6o/view?usp=sharing';
            expect(extractDriveFileId(url)).toBe('1B2_a3b4c5d6e7f8g9h0i1j2k3l4m5n6o');
        });

        it('extracts ID from /open?id= format', () => {
            const url = 'https://drive.google.com/open?id=1B2_a3b4c5d6e7f8g9h0i1j2k3l4m5n6o';
            expect(extractDriveFileId(url)).toBe('1B2_a3b4c5d6e7f8g9h0i1j2k3l4m5n6o');
        });

        it('returns null for invalid or empty URLs', () => {
            expect(extractDriveFileId('')).toBeNull();
            expect(extractDriveFileId('https://google.com')).toBeNull();
            expect(extractDriveFileId('https://drive.google.com/drive/my-drive')).toBeNull();
        });

        it('extracts ID regardless of protocol or domain prefix', () => {
            const url = 'drive.google.com/file/d/abc123_-/view';
            expect(extractDriveFileId(url)).toBe('abc123_-');
        });
    });

    describe('toDirectUrl', () => {
        it('returns the correct direct URL format', () => {
            const id = 'abc123_-';
            expect(toDirectUrl(id)).toBe(`https://drive.google.com/uc?export=view&id=${id}`);
        });
    });

    describe('toCdnUrl', () => {
        it('returns the correct CDN URL format', () => {
            const id = 'abc123_-';
            expect(toCdnUrl(id)).toBe(`https://lh3.googleusercontent.com/d/${id}`);
        });
    });

    describe('driveUrlToDirectUrl', () => {
        it('converts a valid Drive URL to a direct URL', () => {
            const url = 'https://drive.google.com/file/d/1B2_a3b4c5d6e7f8g9h0i1j2k3l4m5n6o/view';
            expect(driveUrlToDirectUrl(url)).toBe('https://drive.google.com/uc?export=view&id=1B2_a3b4c5d6e7f8g9h0i1j2k3l4m5n6o');
        });

        it('returns null if the Drive URL is invalid', () => {
            expect(driveUrlToDirectUrl('https://example.com')).toBeNull();
        });
    });
});
