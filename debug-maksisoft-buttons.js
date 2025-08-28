// Debug script to check Maksisoft button visibility
// Run this in the browser console on the lockers page

console.log('🔍 Debugging Maksisoft buttons...');

// Check if buttons exist in DOM
const maksiButtons = document.querySelectorAll('.btn-maksi');
console.log(`📊 Found ${maksiButtons.length} Maksisoft buttons in DOM`);

if (maksiButtons.length > 0) {
    console.log('✅ Buttons exist in DOM');
    
    // Check visibility
    maksiButtons.forEach((btn, index) => {
        const style = window.getComputedStyle(btn);
        const display = style.display;
        const visibility = style.visibility;
        const opacity = style.opacity;
        
        console.log(`Button ${index + 1}:`, {
            display: display,
            visibility: visibility,
            opacity: opacity,
            text: btn.textContent,
            visible: display !== 'none' && visibility !== 'hidden' && opacity !== '0'
        });
    });
    
    // Try to show them manually
    console.log('🔧 Attempting to show buttons manually...');
    maksiButtons.forEach(btn => {
        btn.style.display = 'inline-block';
        btn.style.visibility = 'visible';
        btn.style.opacity = '1';
    });
    
    console.log('✅ Buttons should now be visible');
} else {
    console.log('❌ No Maksisoft buttons found in DOM');
    console.log('🔍 Checking if locker cards exist...');
    
    const lockerCards = document.querySelectorAll('.locker-card');
    console.log(`📊 Found ${lockerCards.length} locker cards`);
    
    if (lockerCards.length === 0) {
        console.log('⚠️ No locker cards found - make sure to select a kiosk first');
    } else {
        console.log('🔍 Checking first locker card HTML...');
        console.log(lockerCards[0].innerHTML);
    }
}

// Check if checkMaksiStatus function exists
if (typeof checkMaksiStatus === 'function') {
    console.log('✅ checkMaksiStatus function exists');
    console.log('🔧 Running checkMaksiStatus manually...');
    checkMaksiStatus();
} else {
    console.log('❌ checkMaksiStatus function not found');
}

console.log('🎯 Debug complete. Check the results above.');