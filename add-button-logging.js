#!/usr/bin/env node

/**
 * Script to add enhanced logging to the locker page for button debugging
 */

const fs = require('fs');
const path = require('path');

const lockerHtmlPath = path.join(__dirname, 'app/panel/src/views/lockers.html');

// Enhanced logging code to inject
const enhancedLogging = `
    // Enhanced Button Function Logging
    console.log('🔧 Enhanced button logging initialized');
    
    // Override button functions with logging
    const originalOpenSelectedLockers = window.openSelectedLockers;
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
    
    const originalBlockSelectedLockers = window.blockSelectedLockers;
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
    
    const originalUnblockSelectedLockers = window.unblockSelectedLockers;
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
    
    const originalShowEndOfDayModal = window.showEndOfDayModal;
    window.showEndOfDayModal = function() {
        console.log('🌅 showEndOfDayModal called');
        console.log('📊 CSRF token:', csrfToken ? 'present' : 'missing');
        
        try {
            const result = originalShowEndOfDayModal.call(this);
            console.log('✅ showEndOfDayModal completed');
            return result;
        } catch (error) {
            console.error('❌ showEndOfDayModal failed:', error);
            throw error;
        }
    };
    
    const originalLoadData = window.loadData;
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
    
    const originalToggleLocker = window.toggleLocker;
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
    
    // Log button click events
    document.addEventListener('click', function(event) {
        const target = event.target;
        
        if (target.tagName === 'BUTTON') {
            console.log('🖱️ Button clicked:', {
                text: target.textContent.trim(),
                id: target.id,
                className: target.className,
                disabled: target.disabled,
                onclick: target.onclick ? target.onclick.toString() : 'none'
            });
            
            // Check if button is disabled
            if (target.disabled) {
                console.log('⚠️ Button is disabled - click will be ignored');
            }
        }
    });
    
    // Log modal events
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
    
    // Log state changes
    const originalUpdateSelectedCount = window.updateSelectedCount;
    if (originalUpdateSelectedCount) {
        window.updateSelectedCount = function() {
            console.log('📊 updateSelectedCount called');
            console.log('📊 Selected count:', selectedLockers.size);
            
            try {
                const result = originalUpdateSelectedCount.call(this);
                
                // Log button states after update
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

function addEnhancedLogging() {
    try {
        console.log('📝 Adding enhanced logging to locker page...');
        
        // Read the current HTML file
        const htmlContent = fs.readFileSync(lockerHtmlPath, 'utf8');
        
        // Check if logging is already added
        if (htmlContent.includes('Enhanced Button Function Logging')) {
            console.log('⚠️ Enhanced logging already present in the file');
            return;
        }
        
        // Find the location to insert the logging code (before the closing </script> tag of the main script)
        const insertPoint = htmlContent.lastIndexOf('// Close modals when clicking outside');
        
        if (insertPoint === -1) {
            console.log('❌ Could not find insertion point in HTML file');
            return;
        }
        
        // Insert the enhanced logging code
        const modifiedContent = htmlContent.slice(0, insertPoint) + 
                               enhancedLogging + '\n\n      ' + 
                               htmlContent.slice(insertPoint);
        
        // Write the modified content back
        fs.writeFileSync(lockerHtmlPath, modifiedContent, 'utf8');
        
        console.log('✅ Enhanced logging added successfully');
        console.log('📋 Added features:');
        console.log('  - Button click logging');
        console.log('  - Function call logging');
        console.log('  - State change logging');
        console.log('  - Error tracking');
        console.log('  - Modal event logging');
        
    } catch (error) {
        console.error('❌ Failed to add enhanced logging:', error.message);
    }
}

function removeEnhancedLogging() {
    try {
        console.log('🧹 Removing enhanced logging from locker page...');
        
        // Read the current HTML file
        let htmlContent = fs.readFileSync(lockerHtmlPath, 'utf8');
        
        // Remove the enhanced logging code
        const startMarker = '    // Enhanced Button Function Logging';
        const endMarker = '    console.log(\'✅ Enhanced button logging setup complete\');';
        
        const startIndex = htmlContent.indexOf(startMarker);
        const endIndex = htmlContent.indexOf(endMarker);
        
        if (startIndex !== -1 && endIndex !== -1) {
            const beforeLogging = htmlContent.slice(0, startIndex);
            const afterLogging = htmlContent.slice(endIndex + endMarker.length + 1); // +1 for newline
            
            htmlContent = beforeLogging + afterLogging;
            
            // Write the modified content back
            fs.writeFileSync(lockerHtmlPath, htmlContent, 'utf8');
            
            console.log('✅ Enhanced logging removed successfully');
        } else {
            console.log('⚠️ Enhanced logging not found in the file');
        }
        
    } catch (error) {
        console.error('❌ Failed to remove enhanced logging:', error.message);
    }
}

// Command line interface
const command = process.argv[2];

if (command === 'add') {
    addEnhancedLogging();
} else if (command === 'remove') {
    removeEnhancedLogging();
} else {
    console.log('Usage:');
    console.log('  node add-button-logging.js add    - Add enhanced logging');
    console.log('  node add-button-logging.js remove - Remove enhanced logging');
}