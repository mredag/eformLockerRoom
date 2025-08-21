import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import * as fsSync from 'fs';
import { spawn } from 'child_process';
import * as path from 'path';
import * as https from 'https';

interface UpdatePackage {
  version: string;
  url: string;
  sha256: string;
  signature: string;
}

interface UpdateResult {
  success: boolean;
  error?: string;
  rolledBack?: boolean;
}

class UpdateAgent {
  private readonly updateDir = '/tmp/eform-updates';
  private readonly backupDir = '/opt/eform/backups';
  private readonly installDir = '/opt/eform';
  private readonly publicKeyPath = '/opt/eform/config/update-key.pub';
  private readonly services = ['eform-gateway', 'eform-kiosk', 'eform-panel', 'eform-agent'];

  constructor() {
    this.ensureDirectories();
  }

  private async ensureDirectories(): Promise<void> {
    await fs.mkdir(this.updateDir, { recursive: true });
    await fs.mkdir(this.backupDir, { recursive: true });
  }

  async checkForUpdates(): Promise<UpdatePackage | null> {
    try {
      const response = await this.httpGet('https://panel.local/api/updates/check');
      const data = JSON.parse(response);
      
      if (data.available) {
        return {
          version: data.version,
          url: data.url,
          sha256: data.sha256,
          signature: data.signature
        };
      }
      
      return null;
    } catch (error) {
      console.error('Failed to check for updates:', error);
      return null;
    }
  }

  async verifyPackage(pkg: UpdatePackage): Promise<boolean> {
    try {
      const packagePath = path.join(this.updateDir, `update-${pkg.version}.tar.gz`);
      await this.downloadFile(pkg.url, packagePath);

      const actualHash = await this.calculateSHA256(packagePath);
      if (actualHash !== pkg.sha256) {
        console.error('SHA256 checksum mismatch');
        return false;
      }

      const signatureValid = await this.verifyMinisignSignature(packagePath, pkg.signature);
      if (!signatureValid) {
        console.error('Minisign signature verification failed');
        return false;
      }

      return true;
    } catch (error) {
      console.error('Package verification failed:', error);
      return false;
    }
  }

  async applyUpdate(pkg: UpdatePackage): Promise<UpdateResult> {
    const backupPath = path.join(this.backupDir, `backup-${Date.now()}`);
    
    try {
      console.log('Stopping services...');
      await this.stopServices();

      console.log('Creating backup...');
      await this.createBackup(backupPath);

      console.log('Applying update...');
      const packagePath = path.join(this.updateDir, `update-${pkg.version}.tar.gz`);
      await this.extractUpdate(packagePath);

      console.log('Running migrations...');
      await this.runMigrations();

      console.log('Starting services...');
      await this.startServices();

      console.log('Verifying system health...');
      const healthOk = await this.verifyHealth();
      
      if (!healthOk) {
        console.error('Health check failed, rolling back...');
        await this.rollback(backupPath);
        return { success: false, error: 'Health check failed', rolledBack: true };
      }

      console.log(`Update to version ${pkg.version} completed successfully`);
      return { success: true };

    } catch (error: any) {
      console.error('Update failed, rolling back...', error);
      try {
        await this.rollback(backupPath);
        return { success: false, error: error.message, rolledBack: true };
      } catch (rollbackError: any) {
        console.error('Rollback failed:', rollbackError);
        return { 
          success: false, 
          error: `Update failed: ${error.message}, Rollback failed: ${rollbackError.message}` 
        };
      }
    }
  }

  private async downloadFile(url: string, destination: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const file = fsSync.createWriteStream(destination);
      
      https.get(url, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
          return;
        }
        
        response.pipe(file);
        
        file.on('finish', () => {
          file.close();
          resolve();
        });
        
        file.on('error', (err) => {
          fs.unlink(destination).catch(() => {});
          reject(err);
        });
      }).on('error', reject);
    });
  }

  private async calculateSHA256(filePath: string): Promise<string> {
    const fileBuffer = await fs.readFile(filePath);
    const hash = createHash('sha256');
    hash.update(fileBuffer);
    return hash.digest('hex');
  }

  private async verifyMinisignSignature(filePath: string, signature: string): Promise<boolean> {
    try {
      const sigPath = `${filePath}.sig`;
      await fs.writeFile(sigPath, signature);

      const result = await this.execCommand(`minisign -Vm ${filePath} -P ${await fs.readFile(this.publicKeyPath, 'utf8')}`);
      
      await fs.unlink(sigPath).catch(() => {});
      
      return result.exitCode === 0;
    } catch (error) {
      console.error('Signature verification error:', error);
      return false;
    }
  }

  private async stopServices(): Promise<void> {
    for (const service of this.services) {
      try {
        await this.execCommand(`systemctl stop ${service}`);
      } catch (error: any) {
        console.warn(`Failed to stop ${service}:`, error.message);
      }
    }
    
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  private async startServices(): Promise<void> {
    for (const service of this.services) {
      try {
        await this.execCommand(`systemctl start ${service}`);
      } catch (error: any) {
        console.warn(`Failed to start ${service}:`, error.message);
      }
    }
    
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  private async createBackup(backupPath: string): Promise<void> {
    await fs.mkdir(backupPath, { recursive: true });
    await this.execCommand(`cp -r ${this.installDir}/* ${backupPath}/`);
  }

  private async extractUpdate(packagePath: string): Promise<void> {
    await this.execCommand(`tar -xzf ${packagePath} -C ${this.installDir} --strip-components=1`);
  }

  private async runMigrations(): Promise<void> {
    try {
      const migrationScript = path.join(this.installDir, 'scripts', 'migrate.js');
      await this.execCommand(`node ${migrationScript}`);
    } catch (error: any) {
      console.warn('Migration script not found or failed:', error.message);
    }
  }

  private async rollback(backupPath: string): Promise<void> {
    console.log('Rolling back to previous version...');
    
    await this.stopServices();
    await this.execCommand(`rm -rf ${this.installDir}/*`);
    await this.execCommand(`cp -r ${backupPath}/* ${this.installDir}/`);
    await this.startServices();
  }

  private async verifyHealth(): Promise<boolean> {
    const healthEndpoints = [
      'http://localhost:3000/health',
      'http://localhost:3001/health',
      'http://localhost:3002/health'
    ];

    for (const endpoint of healthEndpoints) {
      try {
        const response = await this.httpGet(endpoint);
        const health = JSON.parse(response);
        if (health.status !== 'healthy') {
          return false;
        }
      } catch (error: any) {
        console.error(`Health check failed for ${endpoint}:`, error.message);
        return false;
      }
    }

    return true;
  }

  private async httpGet(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      https.get(url, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
          return;
        }

        let data = '';
        response.on('data', (chunk) => data += chunk);
        response.on('end', () => resolve(data));
      }).on('error', reject);
    });
  }

  private async execCommand(command: string): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const child = spawn('sh', ['-c', command]);
      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        resolve({ exitCode: code || 0, stdout, stderr });
      });

      child.on('error', reject);
    });
  }

  startUpdateChecker(): void {
    const checkInterval = 30 * 60 * 1000;

    const check = async () => {
      try {
        const updatePackage = await this.checkForUpdates();
        if (updatePackage) {
          console.log(`Update available: ${updatePackage.version}`);
          
          const verified = await this.verifyPackage(updatePackage);
          if (verified) {
            console.log('Update package verified, applying...');
            const result = await this.applyUpdate(updatePackage);
            
            if (result.success) {
              console.log('Update applied successfully');
            } else {
              console.error('Update failed:', result.error);
            }
          } else {
            console.error('Update package verification failed');
          }
        }
      } catch (error) {
        console.error('Update check failed:', error);
      }
    };

    setTimeout(check, 5 * 60 * 1000);
    setInterval(check, checkInterval);
    
    console.log('Update checker started (30-minute intervals)');
  }
}

export { UpdateAgent };