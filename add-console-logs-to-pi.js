#!/usr/bin/env node

// Script to add console logs to lockers.html for Pi debugging
const fs = require('fs');
const path = require('path');

const filePath = 'app/panel/src/views/lockers.html';

console.log('🔧 Adding console logs to lockers.html for Pi debugging...');

try {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Check if logs already exist
    if (content.includes('🔓 openSelectedLockers called')) {
        console.log('✅ Console logs already exist in the file!');
        process.exit(0);
    }
    
    // Find the closing </script> tag before </body>
    const scriptEndPattern = '</script>\n</body>';
    const scriptEndIndex = content.lastIndexOf(scriptEndPattern);
    
    if (scriptEndIndex === -1) {
        console.error('❌ Could not find script end tag to insert console logs');
        process.exit(1);
    }
    
    // Console logging code to insert
    const consoleLogsCode = `
    // Enhanced button logging for debugging
    console.log('🚀 Setting up enhanced button logging...');
    
    // Override button functions with logging
    const originalOpenSelectedLockers = window.openSelectedLockers;
    if (originalOpenSelectedLockers) {
        window.openSelectedLockers = function() {
            console.log('🔓 openSelectedLockers called');
            console.log('📊 Selected lockers count:', selectedLockers.size);
            console.log('📊 Selected lockers:', Array.from(selectedLockers));
            console.log('📊 CSRF token:', csrfToken ? 'present' : 'missing');
            console.log('📊 Current user:', currentUser);
            
            if (selectedLockers.size === 0) {
                console.log('⚠️ No lockers selected - function will return early');
                return;
            }
            
            try {
                const result = originalOpenSelectedLockers.call(this);
                console.log('✅ openSelectedLockers completed');
                return result;
            } catch (error) {
                console.error('❌ openSelectedLockers failed:', error);
                throw error;
            }
        };
    }
    
    const originalBlockSelectedLockers = window.blockSelectedLockers;
    if (originalBlockSelectedLockers) {
        window.blockSelectedLockers = function() {
            console.log('🚫 blockSelectedLockers called');
            console.log('📊 Selected lockers count:', selectedLockers.size);
            console.log('📊 Selected lockers:', Array.from(selectedLockers));
            console.log('📊 CSRF token:', csrfToken ? 'present' : 'missing');
            
            if (selectedLockers.size === 0) {
                console.log('⚠️ No lockers selected - function will return early');
                return;
            }
            
            try {
                const result = originalBlockSelectedLockers.call(this);
                console.log('✅ blockSelectedLockers completed');
                return result;
            } catch (error) {
                console.error('❌ blockSelectedLockers failed:', error);
                throw error;
            }
        };
    }
    
    const originalUnblockSelectedLockers = window.unblockSelectedLockers;
    if (originalUnblockSelectedLockers) {
        window.unblockSelectedLockers = function() {
            console.log('✅ unblockSelectedLockers called');
            console.log('📊 Selected lockers count:', selectedLockers.size);
            console.log('📊 Selected lockers:', Array.from(selectedLockers));
            console.log('📊 CSRF token:', csrfToken ? 'present' : 'missing');
            
            if (selectedLockers.size === 0) {
                console.log('⚠️ No lockers selected - function will return early');
                return;
            }
            
            try {
                const result = originalUnblockSelectedLockers.call(this);
                console.log('✅ unblockSelectedLockers completed');
                return result;
            } catch (error) {
                console.error('❌ unblockSelectedLockers failed:', error);
                throw error;
            }
        };
    }
    
    const originalToggleLocker = window.toggleLocker;
    if (originalToggleLocker) {
        window.toggleLocker = function(kioskId, lockerId) {
            console.log('🎯 toggleLocker called');
            console.log('📊 Kiosk ID:', kioskId);
            console.log('📊 Locker ID:', lockerId);
            console.log('📊 Current selection count:', selectedLockers.size);
            
            try {
                const result = originalToggleLocker.call(this, kioskId, lockerId);
                console.log('📊 New selection count:', selectedLockers.size);
                console.log('✅ toggleLocker completed');
                return result;
            } catch (error) {
                console.error('❌ toggleLocker failed:', error);
                throw error;
            }
        };
    }
    
    const originalLoadData = window.loadData;
    if (originalLoadData) {
        window.loadData = function() {
            console.log('🔄 loadData called (Refresh button)');
            console.log('📊 Current user:', currentUser);
            console.log('📊 CSRF token:', csrfToken ? 'present' : 'missing');
            
            try {
                const result = originalLoadData.call(this);
                console.log('✅ loadData completed');
                return result;
            } catch (error) {
                console.error('❌ loadData failed:', error);
                throw error;
            }
        };
    }
    
    const originalShowActionModal = window.showActionModal;
    if (originalShowActionModal) {
        window.showActionModal = function(title, action) {
            console.log('📋 showActionModal called');
            console.log('📊 Title:', title);
            console.log('📊 Action:', action);
            
            try {
                const result = originalShowActionModal.call(this, title, action);
                console.log('✅ showActionModal completed');
                return result;
            } catch (error) {
                console.error('❌ showActionModal failed:', error);
                throw error;
            }
        };
    }
    
    const originalPerformAction = window.performAction;
    if (originalPerformAction) {
        window.performAction = function(action) {
            console.log('⚡ performAction called');
            console.log('📊 Action:', action);
            console.log('📊 Reason field value:', document.getElementById('reason')?.value);
            
            try {
                const result = originalPerformAction.call(this, action);
                console.log('✅ performAction completed');
                return result;
            } catch (error) {
                console.error('❌ performAction failed:', error);
                throw error;
            }
        };
    }
    
    const originalUpdateSelectedCount = window.updateSelectedCount;
    if (originalUpdateSelectedCount) {
        window.updateSelectedCount = function() {
            console.log('📊 updateSelectedCount called');
            console.log('📊 Selected count:', selectedLockers.size);
            
            try {
                const result = originalUpdateSelectedCount.call(this);
                
                const openBtn = document.getElementById('open-btn');
                const blockBtn = document.getElementById('block-btn');
                const unblockBtn = document.getElementById('unblock-btn');
                
                console.log('📊 Button states after update:', {
                    openBtn: openBtn ? { disabled: openBtn.disabled, text: openBtn.textContent } : 'not found',
                    blockBtn: blockBtn ? { disabled: blockBtn.disabled, text: blockBtn.textContent } : 'not found',
                    unblockBtn: unblockBtn ? { disabled: unblockBtn.disabled, text: unblockBtn.textContent } : 'not found'
                });
                
                console.log('✅ updateSelectedCount completed');
                return result;
            } catch (error) {
                console.error('❌ updateSelectedCount failed:', error);
                throw error;
            }
        };
    }
    
    console.log('✅ Enhanced button logging setup complete');
`;
    
    // Insert the console logs before the closing script tag
    const beforeScript = content.substring(0, scriptEndIndex);
    const afterScript = content.substring(scriptEndIndex);
    
    const newContent = beforeScript + consoleLogsCode + '\n' + afterScript;
    
    // Write the updated content
    fs.writeFileSync(filePath, newContent, 'utf8');
    
    console.log('✅ Console logs added successfully!');
    console.log('🧪 Run "node test-console-logs.js" to verify');
    
} catch (error) {
    console.error('❌ Error adding console logs:', error.message);
    process.exit(1);
}