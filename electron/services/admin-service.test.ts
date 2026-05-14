
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdminService } from './admin-service';
import { OAuth2Client } from 'google-auth-library';

const usersMock = vi.hoisted(() => ({
    list: vi.fn(),
    get: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
}));

vi.mock('../google-lazy', () => ({
    getGoogle: vi.fn(() => ({
        admin: vi.fn(() => ({
            users: usersMock,
        })),
    })),
}));

describe('AdminService', () => {
    let adminService: AdminService;
    let mockAuthClient: OAuth2Client;
    let mockUsersResource: any;

    beforeEach(() => {
        vi.clearAllMocks();
        mockAuthClient = {} as OAuth2Client;
        adminService = new AdminService(mockAuthClient);
        mockUsersResource = usersMock;
    });

    it('should fetch users successfully', async () => {
        const mockResponse = {
            data: {
                users: [
                    {
                        primaryEmail: 'test@example.com',
                        name: { fullName: 'Test User' },
                        suspended: false,
                        isAdmin: false,
                    },
                ],
                nextPageToken: 'token123',
            },
        };
        mockUsersResource.list.mockResolvedValue(mockResponse);

        const result = await adminService.getUsers();

        expect(result.users).toHaveLength(1);
        expect(result.users[0].primaryEmail).toBe('test@example.com');
        expect(result.nextPageToken).toBe('token123');
        expect(mockUsersResource.list).toHaveBeenCalledWith(expect.objectContaining({
            customer: 'my_customer',
            maxResults: 10,
        }));
    });

    it('should suspend a user successfully', async () => {
        mockUsersResource.get.mockResolvedValue({
            data: { suspended: false },
        });
        const mockResponse = {
            data: {
                primaryEmail: 'test@example.com',
                suspended: true,
            }
        };
        mockUsersResource.update.mockResolvedValue(mockResponse);

        const result = await adminService.suspendUser('test@example.com');

        expect(result.suspended).toBe(true);
        expect(mockUsersResource.get).toHaveBeenCalledWith(expect.objectContaining({
            userKey: 'test@example.com',
            fields: 'suspended',
        }));
        expect(mockUsersResource.update).toHaveBeenCalledWith(expect.objectContaining({
            userKey: 'test@example.com',
            requestBody: { suspended: true }
        }));
    });

    it('should throw error if user is already suspended', async () => {
        mockUsersResource.get.mockResolvedValue({
            data: { suspended: true },
        });

        await expect(adminService.suspendUser('test@example.com')).rejects.toThrow('Kullanıcı zaten askıda');
        expect(mockUsersResource.update).not.toHaveBeenCalled();
    });
});
