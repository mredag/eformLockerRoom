#!/usr/bin/env node

const { spawn } = require('child_process');

async function runPowerShellCommand(command) {
  return new Promise((resolve, reject) => {
    const proc = spawn('powershell', ['-Command', command], { 
      stdio: 'pipe',
      shell: true
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
      resolve({ stdout, stderr, code });
    });
  });
}

async function testSessionImmediately() {
  console.log('🔐 Testing Session Immediately After Login');
  console.log('==========================================');
  
  try {
    // Step 1: Login and extract session
    console.log('📝 Step 1: Login and extract session...');
    const loginCommand = `
      $body = '{\\"username\\":\\"admin\\",\\"password\\":\\"admin123\\"}';
      $response = Invoke-WebRequest -Uri "http://localhost:3002/auth/login" -Method POST -Body $body -ContentType "application/json" -UseBasicParsing;
      $cookieHeader = $response.Headers.'Set-Cookie';
      if ($cookieHeader -match 'session=([^;]+)') {
        $sessionToken = $matches[1];
        Write-Output "SESSION_TOKEN:$sessionToken";
        
        # Immediately test the session
        $sessionCookie = "session=$sessionToken";
        try {
          $meResponse = Invoke-WebRequest -Uri "http://localhost:3002/auth/me" -Headers @{Cookie=$sessionCookie} -UseBasicParsing;
          Write-Output "ME_STATUS:$($meResponse.StatusCode)";
          Write-Output "ME_CONTENT:$($meResponse.Content)";
        } catch {
          Write-Output "ME_STATUS:$($_.Exception.Response.StatusCode.value__)";
          Write-Output "ME_ERROR:$($_.Exception.Message)";
        }
      } else {
        Write-Output "NO_SESSION_COOKIE";
      }
    `;
    
    const result = await runPowerShellCommand(loginCommand);
    console.log('Result:', result.stdout);
    
    if (result.stdout.includes('SESSION_TOKEN:')) {
      const sessionMatch = result.stdout.match(/SESSION_TOKEN:([^\r\n]+)/);
      if (sessionMatch) {
        const sessionToken = sessionMatch[1];
        console.log('✅ Session token extracted:', sessionToken.substring(0, 16) + '...');
        
        if (result.stdout.includes('ME_STATUS:200')) {
          console.log('✅ Session validation successful immediately after login');
          console.log('🎉 Authentication fix is working!');
        } else if (result.stdout.includes('ME_STATUS:401')) {
          console.log('❌ Session validation failed immediately after login');
          console.log('This suggests an issue with session storage or validation logic');
        } else {
          console.log('❓ Unexpected session validation result');
        }
      }
    } else {
      console.log('❌ No session token found in login response');
    }
    
  } catch (error) {
    console.log('❌ Test failed:', error.message);
  }
}

testSessionImmediately();