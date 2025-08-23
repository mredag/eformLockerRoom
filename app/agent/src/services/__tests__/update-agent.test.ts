import { UpdateAgent } from '../update-agent';
import { promises as fs } from 'fs';
import { createHash } from 'crypto';
import * as path from 'path';

// Mock external dependencies
jest.mock('fs', () => ({
  promises: {
    mkdir: jest.fn(),
    readFile: jest.fn(),
    writeFile: jest.fn(),
    unlink: jest.fn()
  }
}));

jest.mock('https');
jest.mock('child_process');

describe('UpdateAgent', () => {
  let updateAgent: UpdateAgent;
  const mockFs = fs as jest.Mocked<typeof fs>;

  beforeEach(() => {
    jest.clearAllMocks();
    updateAgent = new UpdateAgent();
  });

  describe('verifyPackage', () => {
    const mockPackage = {
      version: '1.2.0',
      url: 'https://updates.example.com/eform-1.2.0.tar.gz',
      sha256: 'abc123def456',
      signature: 'mock-signature'
    };

    it('should verify package with correct checksum and signature', async () => {
      // Mock successful download
      jest.spyOn(updateAgent as any, 'downloadFile').mockResolvedValue(undefined);
      
      // Mock correct SHA256
      jest.spyOn(updateAgent as any, 'calculateSHA256').mockResolvedValue('abc123def456');
      
      // Mock valid signature
      jest.spyOn(updateAgent as any, 'verifyMinisignSignature').mockResolvedValue(true);

      const result = await updateAgent.verifyPackage(mockPackage);
      expect(result).toBe(true);
    });

    it('should reject package with incorrect checksum', async () => {
      jest.spyOn(updateAgent as any, 'downloadFile').mockResolvedValue(undefined);
      jest.spyOn(updateAgent as any, 'calculateSHA256').mockResolvedValue('wrong-hash');
      jest.spyOn(updateAgent as any, 'verifyMinisignSignature').mockResolvedValue(true);

      const result = await updateAgent.verifyPackage(mockPackage);
      expect(result).toBe(false);
    });

    it('should reject package with invalid signature', async () => {
      jest.spyOn(updateAgent as any, 'downloadFile').mockResolvedValue(undefined);
      jest.spyOn(updateAgent as any, 'calculateSHA256').mockResolvedValue('abc123def456');
      jest.spyOn(updateAgent as any, 'verifyMinisignSignature').mockResolvedValue(false);

      const result = await updateAgent.verifyPackage(mockPackage);
      expect(result).toBe(false);
    });

    it('should handle download errors', async () => {
      jest.spyOn(updateAgent as any, 'downloadFile').mockRejectedValue(new Error('Download failed'));

      const result = await updateAgent.verifyPackage(mockPackage);
      expect(result).toBe(false);
    });
  });

  describe('applyUpdate', () => {
    const mockPackage = {
      version: '1.2.0',
      url: 'https://updates.example.com/eform-1.2.0.tar.gz',
      sha256: 'abc123def456',
      signature: 'mock-signature'
    };

    beforeEach(() => {
      // Mock all the private methods
      jest.spyOn(updateAgent as any, 'stopServices').mockResolvedValue(undefined);
      jest.spyOn(updateAgent as any, 'startServices').mockResolvedValue(undefined);
      jest.spyOn(updateAgent as any, 'createBackup').mockResolvedValue(undefined);
      jest.spyOn(updateAgent as any, 'extractUpdate').mockResolvedValue(undefined);
      jest.spyOn(updateAgent as any, 'runMigrations').mockResolvedValue(undefined);
      jest.spyOn(updateAgent as any, 'verifyHealth').mockResolvedValue(true);
      jest.spyOn(updateAgent as any, 'rollback').mockResolvedValue(undefined);
    });

    it('should successfully apply update when all steps pass', async () => {
      const result = await updateAgent.applyUpdate(mockPackage);
      
      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.rolledBack).toBeUndefined();
    });

    it('should rollback when health check fails', async () => {
      jest.spyOn(updateAgent as any, 'verifyHealth').mockResolvedValue(false);

      const result = await updateAgent.applyUpdate(mockPackage);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Health check failed');
      expect(result.rolledBack).toBe(true);
    });

    it('should rollback when update extraction fails', async () => {
      jest.spyOn(updateAgent as any, 'extractUpdate').mockRejectedValue(new Error('Extraction failed'));

      const result = await updateAgent.applyUpdate(mockPackage);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Extraction failed');
      expect(result.rolledBack).toBe(true);
    });

    it('should handle rollback failures', async () => {
      jest.spyOn(updateAgent as any, 'extractUpdate').mockRejectedValue(new Error('Extraction failed'));
      jest.spyOn(updateAgent as any, 'rollback').mockRejectedValue(new Error('Rollback failed'));

      const result = await updateAgent.applyUpdate(mockPackage);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Extraction failed');
      expect(result.error).toContain('Rollback failed');
    });
  });

  describe('checkForUpdates', () => {
    it('should return update package when available', async () => {
      const mockResponse = JSON.stringify({
        available: true,
        version: '1.2.0',
        url: 'https://updates.example.com/eform-1.2.0.tar.gz',
        sha256: 'abc123def456',
        signature: 'mock-signature'
      });

      jest.spyOn(updateAgent as any, 'httpGet').mockResolvedValue(mockResponse);

      const result = await updateAgent.checkForUpdates();
      
      expect(result).toEqual({
        version: '1.2.0',
        url: 'https://updates.example.com/eform-1.2.0.tar.gz',
        sha256: 'abc123def456',
        signature: 'mock-signature'
      });
    });

    it('should return null when no updates available', async () => {
      const mockResponse = JSON.stringify({ available: false });
      jest.spyOn(updateAgent as any, 'httpGet').mockResolvedValue(mockResponse);

      const result = await updateAgent.checkForUpdates();
      expect(result).toBeNull();
    });

    it('should return null on network errors', async () => {
      jest.spyOn(updateAgent as any, 'httpGet').mockRejectedValue(new Error('Network error'));

      const result = await updateAgent.checkForUpdates();
      expect(result).toBeNull();
    });
  });

  describe('calculateSHA256', () => {
    it('should calculate correct SHA256 hash', async () => {
      const testData = Buffer.from('test data');
      const expectedHash = createHash('sha256').update(testData).digest('hex');
      
      mockFs.readFile.mockResolvedValue(testData);

      const result = await (updateAgent as any).calculateSHA256('/test/file');
      expect(result).toBe(expectedHash);
    });
  });

  describe('verifyMinisignSignature', () => {
    beforeEach(() => {
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.unlink.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue('mock-public-key');
    });

    it('should return true for valid signature', async () => {
      jest.spyOn(updateAgent as any, 'execCommand').mockResolvedValue({ exitCode: 0 });

      const result = await (updateAgent as any).verifyMinisignSignature('/test/file', 'valid-signature');
      expect(result).toBe(true);
    });

    it('should return false for invalid signature', async () => {
      jest.spyOn(updateAgent as any, 'execCommand').mockResolvedValue({ exitCode: 1 });

      const result = await (updateAgent as any).verifyMinisignSignature('/test/file', 'invalid-signature');
      expect(result).toBe(false);
    });

    it('should handle minisign command errors', async () => {
      jest.spyOn(updateAgent as any, 'execCommand').mockRejectedValue(new Error('Command failed'));

      const result = await (updateAgent as any).verifyMinisignSignature('/test/file', 'signature');
      expect(result).toBe(false);
    });
  });

  describe('verifyHealth', () => {
    it('should return true when all services are healthy', async () => {
      const healthyResponse = JSON.stringify({ status: 'healthy' });
      jest.spyOn(updateAgent as any, 'httpGet').mockResolvedValue(healthyResponse);

      const result = await (updateAgent as any).verifyHealth();
      expect(result).toBe(true);
    });

    it('should return false when any service is unhealthy', async () => {
      const unhealthyResponse = JSON.stringify({ status: 'unhealthy' });
      jest.spyOn(updateAgent as any, 'httpGet')
        .mockResolvedValueOnce(JSON.stringify({ status: 'healthy' }))
        .mockResolvedValueOnce(unhealthyResponse);

      const result = await (updateAgent as any).verifyHealth();
      expect(result).toBe(false);
    });

    it('should return false when health endpoint is unreachable', async () => {
      jest.spyOn(updateAgent as any, 'httpGet').mockRejectedValue(new Error('Connection refused'));

      const result = await (updateAgent as any).verifyHealth();
      expect(result).toBe(false);
    });
  });

  describe('startUpdateChecker', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should start update checking with correct intervals', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      updateAgent.startUpdateChecker();
      
      expect(consoleSpy).toHaveBeenCalledWith('Update checker started (30-minute intervals)');
      
      consoleSpy.mockRestore();
    });
  });
});
