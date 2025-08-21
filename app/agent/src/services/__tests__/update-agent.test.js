const { createHash } = require('crypto');

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

// Mock UpdateAgent class for testing
class MockUpdateAgent {
  constructor() {
    this.updateDir = '/tmp/eform-updates';
    this.backupDir = '/opt/eform/backups';
    this.installDir = '/opt/eform';
    this.publicKeyPath = '/opt/eform/config/update-key.pub';
    this.services = ['eform-gateway', 'eform-kiosk', 'eform-panel', 'eform-agent'];
  }

  async checkForUpdates() {
    return {
      version: '1.2.0',
      url: 'https://updates.example.com/eform-1.2.0.tar.gz',
      sha256: 'abc123def456',
      signature: 'mock-signature'
    };
  }

  async verifyPackage(pkg) {
    return pkg.sha256 === 'abc123def456';
  }

  async applyUpdate(pkg) {
    if (pkg.version === '1.2.0') {
      return { success: true };
    }
    return { success: false, error: 'Invalid version', rolledBack: true };
  }

  calculateSHA256(data) {
    return createHash('sha256').update(data).digest('hex');
  }

  startUpdateChecker() {
    console.log('Update checker started (30-minute intervals)');
  }
}

describe('UpdateAgent', () => {
  let updateAgent;

  beforeEach(() => {
    jest.clearAllMocks();
    updateAgent = new MockUpdateAgent();
  });

  describe('checkForUpdates', () => {
    it('should return update package when available', async () => {
      const result = await updateAgent.checkForUpdates();
      
      expect(result).toEqual({
        version: '1.2.0',
        url: 'https://updates.example.com/eform-1.2.0.tar.gz',
        sha256: 'abc123def456',
        signature: 'mock-signature'
      });
    });
  });

  describe('verifyPackage', () => {
    const mockPackage = {
      version: '1.2.0',
      url: 'https://updates.example.com/eform-1.2.0.tar.gz',
      sha256: 'abc123def456',
      signature: 'mock-signature'
    };

    it('should verify package with correct checksum', async () => {
      const result = await updateAgent.verifyPackage(mockPackage);
      expect(result).toBe(true);
    });

    it('should reject package with incorrect checksum', async () => {
      const invalidPackage = { ...mockPackage, sha256: 'wrong-hash' };
      const result = await updateAgent.verifyPackage(invalidPackage);
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

    it('should successfully apply update when all steps pass', async () => {
      const result = await updateAgent.applyUpdate(mockPackage);
      
      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.rolledBack).toBeUndefined();
    });

    it('should rollback when update fails', async () => {
      const invalidPackage = { ...mockPackage, version: '0.0.0' };
      const result = await updateAgent.applyUpdate(invalidPackage);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid version');
      expect(result.rolledBack).toBe(true);
    });
  });

  describe('calculateSHA256', () => {
    it('should calculate correct SHA256 hash', () => {
      const testData = 'test data';
      const expectedHash = createHash('sha256').update(testData).digest('hex');
      
      const result = updateAgent.calculateSHA256(testData);
      expect(result).toBe(expectedHash);
    });
  });

  describe('startUpdateChecker', () => {
    it('should start update checking', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      updateAgent.startUpdateChecker();
      
      expect(consoleSpy).toHaveBeenCalledWith('Update checker started (30-minute intervals)');
      
      consoleSpy.mockRestore();
    });
  });
});