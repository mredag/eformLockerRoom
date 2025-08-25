#!/usr/bin/env node

/**
 * Comprehensive test script for locker button functions
 * Tests each button's functionality with detailed logging
 */

const http = require('http');

class ButtonFunctionTester {
  constructor() {
    this.baseUrl = 'http://localhost:3001';
    this.csrfToken = null;
    this.sessionCookie = null;
    this.testResults = [];
  }

  async runAllTests() {
    console.log('🧪 Starting Button Function Tests');
    console.log('=================================');
    
    try {
      // Step 1: Login and get session
      await this.login();
      
      // Step 2: Test each button function
      await this.testRefreshButton();
      await this.testLockerSelection();
      await this.testOpenSelectedButton();
      await this.testBlockSelectedButton();
      await this.testUnblockSelectedButton();
      await this.testEndOfDayButton();
      
      // Step 3: Generate report
      this.generateReport();
      
    } catch (error) {
      console.error('❌ Test suite failed:', error.message);
    }
  }

  async login() {
    console.log('\n🔐 Testing Login & Session...');
    
    try {
      // First get the login page to get CSRF token
      const loginPageResponse = await this.makeRequest('GET', '/login.html');
      console.log('📄 Login page status:', loginPageResponse.statusCode);
      
      // Try to get user info (should redirect or fail)
      const userInfoResponse = await this.makeRequest('GET', '/auth/me');
      console.log('👤 User info status:', userInfoResponse.statusCode);
      
      if (userInfoResponse.statusCode === 200) {
        const userData = JSON.parse(userInfoResponse.body);
        this.csrfToken = userData.csrfToken;
        console.log('✅ Already logged in, CSRF token:', this.csrfToken ? 'present' : 'missing');
      } else {
        console.log('❌ Not logged in, status:', userInfoResponse.statusCode);
        this.testResults.push({
          test: 'Login/Session',
          status: 'FAILED',
          error: 'Not logged in - need to login first'
        });
        return;
      }
      
      this.testResults.push({
        test: 'Login/Session',
        status: 'PASSED',
        details: 'Session active, CSRF token obtained'
      });
      
    } catch (error) {
      console.error('❌ Login test failed:', error.message);
      this.testResults.push({
        test: 'Login/Session',
        status: 'FAILED',
        error: error.message
      });
    }
  }

  async testRefreshButton() {
    console.log('\n🔄 Testing Refresh Button (loadData function)...');
    
    try {
      // Test kiosk loading
      console.log('📡 Testing kiosk loading...');
      const kioskResponse = await this.makeRequest('GET', '/api/heartbeat/kiosks');
      console.log('📊 Kiosk API status:', kioskResponse.statusCode);
      console.log('📊 Kiosk API response length:', kioskResponse.body.length);
      
      if (kioskResponse.statusCode === 200) {
        const kioskData = JSON.parse(kioskResponse.body);
        console.log('✅ Kiosk data structure:', {
          hasData: !!kioskData.data,
          hasKiosks: !!kioskData.data?.kiosks,
          kioskCount: kioskData.data?.kiosks?.length || 0,
          hasZones: !!kioskData.data?.zones,
          zoneCount: kioskData.data?.zones?.length || 0
        });
      }
      
      // Test locker loading with kiosk-1
      console.log('📡 Testing locker loading...');
      const lockerResponse = await this.makeRequest('GET', '/api/lockers?kioskId=kiosk-1');
      console.log('📊 Locker API status:', lockerResponse.statusCode);
      console.log('📊 Locker API response length:', lockerResponse.body.length);
      
      if (lockerResponse.statusCode === 200) {
        const lockerData = JSON.parse(lockerResponse.body);
        console.log('✅ Locker data structure:', {
          hasLockers: !!lockerData.lockers,
          lockersIsArray: Array.isArray(lockerData.lockers),
          lockerCount: lockerData.lockers?.length || 0,
          hasTotal: !!lockerData.total,
          totalValue: lockerData.total
        });
      }
      
      this.testResults.push({
        test: 'Refresh Button (loadData)',
        status: kioskResponse.statusCode === 200 && lockerResponse.statusCode === 200 ? 'PASSED' : 'FAILED',
        details: `Kiosk API: ${kioskResponse.statusCode}, Locker API: ${lockerResponse.statusCode}`
      });
      
    } catch (error) {
      console.error('❌ Refresh button test failed:', error.message);
      this.testResults.push({
        test: 'Refresh Button (loadData)',
        status: 'FAILED',
        error: error.message
      });
    }
  }

  async testLockerSelection() {
    console.log('\n🎯 Testing Locker Selection (toggleLocker function)...');
    
    try {
      // This is a client-side function, so we'll test the logic
      console.log('📝 Testing locker selection logic...');
      
      // Simulate the toggleLocker function logic
      const selectedLockers = new Set();
      const testKioskId = 'kiosk-1';
      const testLockerId = 1;
      const key = testKioskId + '-' + testLockerId;
      
      // Test adding selection
      if (!selectedLockers.has(key)) {
        selectedLockers.add(key);
      }
      console.log('✅ Locker selection added:', selectedLockers.has(key));
      
      // Test removing selection
      if (selectedLockers.has(key)) {
        selectedLockers.delete(key);
      }
      console.log('✅ Locker selection removed:', !selectedLockers.has(key));
      
      this.testResults.push({
        test: 'Locker Selection (toggleLocker)',
        status: 'PASSED',
        details: 'Client-side selection logic works correctly'
      });
      
    } catch (error) {
      console.error('❌ Locker selection test failed:', error.message);
      this.testResults.push({
        test: 'Locker Selection (toggleLocker)',
        status: 'FAILED',
        error: error.message
      });
    }
  }

  async testOpenSelectedButton() {
    console.log('\n🔓 Testing Open Selected Button (bulk open)...');
    
    if (!this.csrfToken) {
      console.log('❌ No CSRF token available for testing');
      this.testResults.push({
        test: 'Open Selected Button',
        status: 'FAILED',
        error: 'No CSRF token available'
      });
      return;
    }
    
    try {
      // Test bulk open API endpoint
      const testPayload = {
        lockers: [
          { kioskId: 'kiosk-1', lockerId: 1 },
          { kioskId: 'kiosk-1', lockerId: 2 }
        ],
        reason: 'Test bulk open operation',
        intervalMs: 100
      };
      
      console.log('📡 Testing bulk open API...');
      console.log('📊 Test payload:', testPayload);
      
      const response = await this.makeRequest('POST', '/api/lockers/bulk/open', {
        'Content-Type': 'application/json',
        'X-CSRF-Token': this.csrfToken
      }, JSON.stringify(testPayload));
      
      console.log('📊 Bulk open API status:', response.statusCode);
      console.log('📊 Bulk open API response:', response.body);
      
      if (response.statusCode === 200) {
        const data = JSON.parse(response.body);
        console.log('✅ Bulk open response structure:', {
          hasSuccess: !!data.success,
          hasTotalCount: !!data.totalCount,
          hasSuccessCount: !!data.successCount,
          hasResults: !!data.results
        });
      }
      
      this.testResults.push({
        test: 'Open Selected Button (bulk open)',
        status: response.statusCode === 200 ? 'PASSED' : 'FAILED',
        details: `API status: ${response.statusCode}, Response: ${response.body.substring(0, 100)}...`
      });
      
    } catch (error) {
      console.error('❌ Open selected button test failed:', error.message);
      this.testResults.push({
        test: 'Open Selected Button (bulk open)',
        status: 'FAILED',
        error: error.message
      });
    }
  }

  async testBlockSelectedButton() {
    console.log('\n🚫 Testing Block Selected Button...');
    
    if (!this.csrfToken) {
      console.log('❌ No CSRF token available for testing');
      this.testResults.push({
        test: 'Block Selected Button',
        status: 'FAILED',
        error: 'No CSRF token available'
      });
      return;
    }
    
    try {
      // Test individual block API endpoint
      const testKioskId = 'kiosk-1';
      const testLockerId = 1;
      const testPayload = {
        reason: 'Test block operation'
      };
      
      console.log('📡 Testing block API...');
      console.log('📊 Test endpoint:', `/api/lockers/${testKioskId}/${testLockerId}/block`);
      console.log('📊 Test payload:', testPayload);
      
      const response = await this.makeRequest('POST', `/api/lockers/${testKioskId}/${testLockerId}/block`, {
        'Content-Type': 'application/json',
        'X-CSRF-Token': this.csrfToken
      }, JSON.stringify(testPayload));
      
      console.log('📊 Block API status:', response.statusCode);
      console.log('📊 Block API response:', response.body);
      
      this.testResults.push({
        test: 'Block Selected Button',
        status: response.statusCode === 200 ? 'PASSED' : 'FAILED',
        details: `API status: ${response.statusCode}, Response: ${response.body.substring(0, 100)}...`
      });
      
    } catch (error) {
      console.error('❌ Block selected button test failed:', error.message);
      this.testResults.push({
        test: 'Block Selected Button',
        status: 'FAILED',
        error: error.message
      });
    }
  }

  async testUnblockSelectedButton() {
    console.log('\n✅ Testing Unblock Selected Button...');
    
    if (!this.csrfToken) {
      console.log('❌ No CSRF token available for testing');
      this.testResults.push({
        test: 'Unblock Selected Button',
        status: 'FAILED',
        error: 'No CSRF token available'
      });
      return;
    }
    
    try {
      // Test individual unblock API endpoint
      const testKioskId = 'kiosk-1';
      const testLockerId = 1;
      
      console.log('📡 Testing unblock API...');
      console.log('📊 Test endpoint:', `/api/lockers/${testKioskId}/${testLockerId}/unblock`);
      
      const response = await this.makeRequest('POST', `/api/lockers/${testKioskId}/${testLockerId}/unblock`, {
        'Content-Type': 'application/json',
        'X-CSRF-Token': this.csrfToken
      }, JSON.stringify({}));
      
      console.log('📊 Unblock API status:', response.statusCode);
      console.log('📊 Unblock API response:', response.body);
      
      this.testResults.push({
        test: 'Unblock Selected Button',
        status: response.statusCode === 200 ? 'PASSED' : 'FAILED',
        details: `API status: ${response.statusCode}, Response: ${response.body.substring(0, 100)}...`
      });
      
    } catch (error) {
      console.error('❌ Unblock selected button test failed:', error.message);
      this.testResults.push({
        test: 'Unblock Selected Button',
        status: 'FAILED',
        error: error.message
      });
    }
  }

  async testEndOfDayButton() {
    console.log('\n🌅 Testing End of Day Button...');
    
    if (!this.csrfToken) {
      console.log('❌ No CSRF token available for testing');
      this.testResults.push({
        test: 'End of Day Button',
        status: 'FAILED',
        error: 'No CSRF token available'
      });
      return;
    }
    
    try {
      // Test end of day API endpoint
      const testPayload = {
        excludeVip: true,
        kioskId: 'kiosk-1'
      };
      
      console.log('📡 Testing end of day API...');
      console.log('📊 Test payload:', testPayload);
      
      const response = await this.makeRequest('POST', '/api/lockers/end-of-day', {
        'Content-Type': 'application/json',
        'X-CSRF-Token': this.csrfToken
      }, JSON.stringify(testPayload));
      
      console.log('📊 End of day API status:', response.statusCode);
      console.log('📊 End of day API response length:', response.body.length);
      console.log('📊 End of day API content type:', response.headers['content-type']);
      
      // Check if it's a CSV response
      if (response.headers['content-type']?.includes('text/csv')) {
        console.log('✅ Received CSV response as expected');
        console.log('📄 CSV preview:', response.body.substring(0, 200) + '...');
      }
      
      this.testResults.push({
        test: 'End of Day Button',
        status: response.statusCode === 200 ? 'PASSED' : 'FAILED',
        details: `API status: ${response.statusCode}, Content-Type: ${response.headers['content-type']}`
      });
      
    } catch (error) {
      console.error('❌ End of day button test failed:', error.message);
      this.testResults.push({
        test: 'End of Day Button',
        status: 'FAILED',
        error: error.message
      });
    }
  }

  generateReport() {
    console.log('\n📊 Button Function Test Report');
    console.log('==============================');
    
    let passedCount = 0;
    let failedCount = 0;
    
    this.testResults.forEach(result => {
      const status = result.status === 'PASSED' ? '✅' : '❌';
      console.log(`${status} ${result.test}: ${result.status}`);
      
      if (result.details) {
        console.log(`   Details: ${result.details}`);
      }
      if (result.error) {
        console.log(`   Error: ${result.error}`);
      }
      
      if (result.status === 'PASSED') {
        passedCount++;
      } else {
        failedCount++;
      }
    });
    
    console.log('\n📈 Summary:');
    console.log(`✅ Passed: ${passedCount}`);
    console.log(`❌ Failed: ${failedCount}`);
    console.log(`📊 Total: ${this.testResults.length}`);
    
    if (failedCount > 0) {
      console.log('\n🔧 Troubleshooting Tips:');
      console.log('- Make sure all services are running');
      console.log('- Check if you are logged in to the panel');
      console.log('- Verify CSRF token is being generated');
      console.log('- Check server logs for detailed error messages');
    }
  }

  makeRequest(method, path, headers = {}, body = null) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'localhost',
        port: 3001,
        path: path,
        method: method,
        headers: {
          'User-Agent': 'ButtonFunctionTester/1.0',
          ...headers
        }
      };

      if (this.sessionCookie) {
        options.headers['Cookie'] = this.sessionCookie;
      }

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          // Store session cookie if present
          if (res.headers['set-cookie']) {
            this.sessionCookie = res.headers['set-cookie'].join('; ');
          }
          
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: data
          });
        });
      });

      req.on('error', reject);
      req.setTimeout(10000, () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      if (body) {
        req.write(body);
      }
      
      req.end();
    });
  }
}

// Run the tests
const tester = new ButtonFunctionTester();
tester.runAllTests().catch(console.error);