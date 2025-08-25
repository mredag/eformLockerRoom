#!/usr/bin/env node

// Script to fix the block API issue by adding better logging and validation
const fs = require('fs');

console.log('🔧 Fixing block API issue in lockers.html...');

try {
    let content = fs.readFileSync('app/panel/src/views/lockers.html', 'utf8');
    
    // Find the performIndividualActions function and add logging
    const oldPattern = `const body = action === 'block' ? { reason: reason || 'Manual block' } : {};
                    
                    const response = await fetch(\`/api/lockers/\${kioskId}/\${lockerId}/\${endpoint}\`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-CSRF-Token': csrfToken
                        },
                        body: JSON.stringify(body)
                    });`;

    const newPattern = `const body = action === 'block' ? { reason: reason || 'Manual block' } : {};
                    
                    // Enhanced logging for debugging
                    console.log('🔧 API Call Debug Info:', {
                        action: action,
                        endpoint: endpoint,
                        kioskId: kioskId,
                        lockerId: lockerId,
                        reason: reason,
                        body: body,
                        bodyString: JSON.stringify(body),
                        csrfToken: csrfToken ? 'present' : 'missing'
                    });
                    
                    const response = await fetch(\`/api/lockers/\${kioskId}/\${lockerId}/\${endpoint}\`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-CSRF-Token': csrfToken
                        },
                        body: JSON.stringify(body)
                    });
                    
                    console.log('📡 API Response:', {
                        status: response.status,
                        statusText: response.statusText,
                        ok: response.ok,
                        url: response.url
                    });`;

    if (content.includes("const body = action === 'block' ? { reason: reason || 'Manual block' } : {};")) {
        content = content.replace(oldPattern, newPattern);
        
        fs.writeFileSync('app/panel/src/views/lockers.html', content, 'utf8');
        console.log('✅ Enhanced logging added to block API calls!');
        console.log('🧪 Now you can see detailed request/response info in console');
    } else {
        console.log('⚠️ Pattern not found - the code might have changed');
        console.log('🔍 Looking for alternative patterns...');
        
        // Try to find the function and add logging differently
        if (content.includes('performIndividualActions')) {
            console.log('✅ Found performIndividualActions function');
            console.log('📝 Manual fix needed - check the function manually');
        }
    }
    
} catch (error) {
    console.error('❌ Error fixing block API issue:', error.message);
    process.exit(1);
}