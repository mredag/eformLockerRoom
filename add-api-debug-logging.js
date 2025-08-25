#!/usr/bin/env node

// Script to add API debug logging to lockers.html
const fs = require('fs');

console.log('🔧 Adding API debug logging to lockers.html...');

try {
    let content = fs.readFileSync('app/panel/src/views/lockers.html', 'utf8');
    
    // Check if logging already exists
    if (content.includes('API Call Debug Info')) {
        console.log('✅ API debug logging already exists!');
        process.exit(0);
    }
    
    // Find the pattern and add logging
    const searchPattern = `const body = action === 'block' ? { reason: reason || 'Manual block' } : {};`;
    
    if (content.includes(searchPattern)) {
        const replacement = `const body = action === 'block' ? { reason: reason || 'Manual block' } : {};
                    
                    // Enhanced logging for debugging API calls
                    console.log('🔧 API Call Debug Info:', {
                        action: action,
                        endpoint: endpoint,
                        kioskId: kioskId,
                        lockerId: lockerId,
                        reason: reason,
                        body: body,
                        bodyString: JSON.stringify(body),
                        csrfToken: csrfToken ? 'present' : 'missing'
                    });`;
        
        content = content.replace(searchPattern, replacement);
        
        // Also add response logging
        const responsePattern = `const response = await fetch(\`/api/lockers/\${kioskId}/\${lockerId}/\${endpoint}\`, {`;
        const responseReplacement = `const response = await fetch(\`/api/lockers/\${kioskId}/\${lockerId}/\${endpoint}\`, {`;
        
        // Add response logging after the fetch call
        const afterFetchPattern = `});
                    
                    if (response.ok) {`;
        
        const afterFetchReplacement = `});
                    
                    console.log('📡 API Response:', {
                        status: response.status,
                        statusText: response.statusText,
                        ok: response.ok,
                        url: response.url
                    });
                    
                    if (response.ok) {`;
        
        if (content.includes(afterFetchPattern)) {
            content = content.replace(afterFetchPattern, afterFetchReplacement);
        }
        
        fs.writeFileSync('app/panel/src/views/lockers.html', content, 'utf8');
        console.log('✅ API debug logging added successfully!');
        console.log('🧪 Now you can see detailed request/response info in console');
    } else {
        console.log('❌ Could not find the target pattern in the file');
        console.log('🔍 Searching for alternative patterns...');
        
        // Show what patterns we can find
        if (content.includes('performIndividualActions')) {
            console.log('✅ Found performIndividualActions function');
        }
        if (content.includes('reason || \'Manual block\'')) {
            console.log('✅ Found reason assignment');
        }
    }
    
} catch (error) {
    console.error('❌ Error adding API debug logging:', error.message);
    process.exit(1);
}