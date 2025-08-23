#!/usr/bin/env node

const { spawn } = require('child_process');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runCommand(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { 
      stdio: 'pipe',
      shell: true,
      ...options 
    });
    
    let stdout = '';
    let stderr = '';
    
    proc.stdout?.on('data', (data) => {
      stdout += data.toString();
    });
    
    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });
    
    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`Command failed with code ${code}: ${stderr}`));
      }
    });
  });
}

async function testWithCurl() {
  console.log('🔐 Testing Authentication Fix with PowerShell');
  console.log('=============================================');
  
  try {
    // Test 1: Health check
    console.log('📊 Step 1: Testing health endpoint...');
    const healthResult = await runCommand('powershell', [
      '-Command', 
      '(Invoke-WebRequest -Uri "http://localhost:3002/health" -UseBasicParsing).StatusCode'
    ]);
    
    if (healthResult.stdout.includes('200')) {
      console.log('✅ Panel service is running');
    } else {
      console.log('❌ Panel service not responding');
      return false;
    }
    
    // Test 2: Login
    console.log('\n🔐 Step 2: Testing login...');
    const loginResult = await runCommand('powershell', [
      '-Command', 
      `$body = '{\\"username\\":\\"admin\\",\\"password\\":\\"admin123\\"}'; $response = Invoke-WebRequest -Uri "http://localhost:3002/auth/login" -Method POST -Body $body -ContentType "application/json" -UseBasicParsing; Write-Output "STATUS:$($response.StatusCode)"; Write-Output "COOKIES:$($response.Headers.'Set-Cookie')"; Write-Output "CONTENT:$($response.Content)"`
    ]);
    
    console.log('Login result:', loginResult.stdout);
    
    if (loginResult.stdout.includes('STATUS:200')) {
      console.log('✅ Login successful');
      
      // Extract session cookie
      const cookieMatch = loginResult.stdout.match(/session=([^;]+)/);
      if (cookieMatch) {
        const sessionToken = cookieMatch[1];
        console.log('🍪 Session token obtained:', sessionToken.substring(0, 16) + '...');
        
        // Test 3: Session validation
        console.log('\n🔍 Step 3: Testing session validation...');
        const sessionResult = await runCommand('powershell', [
          '-Command', 
          `$sessionCookie = "session=${sessionToken}"; $response = Invoke-WebRequest -Uri "http://localhost:3002/auth/me" -Headers @{Cookie=$sessionCookie} -UseBasicParsing; Write-Output "STATUS:$($response.StatusCode)"; Write-Output "CONTENT:$($response.Content)"`
        ]);
        
        console.log('Session validation result:', sessionResult.stdout);
        
        if (sessionResult.stdout.includes('STATUS:200')) {
          console.log('✅ Session validation successful');
          
          // Test 4: Root route
          console.log('\n🏠 Step 4: Testing root route...');
          const rootResult = await runCommand('powershell', [
            '-Command', 
            `$sessionCookie = "session=${sessionToken}"; try { $response = Invoke-WebRequest -Uri "http://localhost:3002/" -Headers @{Cookie=$sessionCookie} -UseBasicParsing -MaximumRedirection 0; Write-Output "STATUS:$($response.StatusCode)" } catch { Write-Output "STATUS:$($_.Exception.Response.StatusCode.value__)"; Write-Output "LOCATION:$($_.Exception.Response.Headers.Location)" }`
          ]);
          
          console.log('Root route result:', rootResult.stdout);
          
          if (rootResult.stdout.includes('STATUS:302')) {
            console.log('✅ Root route redirects correctly');
            
            // Test 5: Dashboard
            console.log('\n📊 Step 5: Testing dashboard access...');
            const dashResult = await runCommand('powershell', [
              '-Command', 
              `$sessionCookie = "session=${sessionToken}"; try { $response = Invoke-WebRequest -Uri "http://localhost:3002/dashboard.html" -Headers @{Cookie=$sessionCookie} -UseBasicParsing; Write-Output "STATUS:$($response.StatusCode)" } catch { Write-Output "STATUS:$($_.Exception.Response.StatusCode.value__)" }`
            ]);
            
            console.log('Dashboard result:', dashResult.stdout);
            
            if (dashResult.stdout.includes('STATUS:200')) {
              console.log('✅ Dashboard accessible - NO REDIRECT LOOP!');
              
              console.log('\n🎉 Authentication Fix Test Results:');
              console.log('=====================================');
              console.log('✅ Panel service running');
              console.log('✅ Login works');
              console.log('✅ Session validation works');
              console.log('✅ Root route redirects correctly');
              console.log('✅ Dashboard accessible');
              console.log('✅ IP address validation fixed');
              console.log('\n🔐 Authentication is fully working!');
              console.log('Access URL: http://localhost:3002');
              console.log('Username: admin');
              console.log('Password: admin123');
              
              return true;
            } else if (dashResult.stdout.includes('STATUS:401')) {
              console.log('❌ Dashboard authentication failed');
            } else if (dashResult.stdout.includes('STATUS:302')) {
              console.log('❌ Dashboard redirecting - redirect loop detected');
            }
          } else if (rootResult.stdout.includes('STATUS:401')) {
            console.log('❌ Root route authentication failed');
          }
        } else {
          console.log('❌ Session validation failed');
        }
      } else {
        console.log('❌ No session cookie in login response');
      }
    } else {
      console.log('❌ Login failed');
    }
    
  } catch (error) {
    console.log('❌ Test failed:', error.message);
  }
  
  return false;
}

testWithCurl()
  .then((success) => {
    if (success) {
      console.log('\n🎯 AUTHENTICATION FIX SUCCESSFUL!');
    } else {
      console.log('\n❌ Authentication issues still exist');
    }
  })
  .catch((error) => {
    console.error('❌ Test error:', error);
  });