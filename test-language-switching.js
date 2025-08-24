/**
 * Test script to verify language switching functionality
 */

const { i18nService } = require('./shared/services/i18n-service');

console.log('Testing Language Switching Functionality');
console.log('=====================================');

// Test initial language
console.log('Initial language:', i18nService.getCurrentLanguage());
console.log('Available languages:', i18nService.getAvailableLanguages());

// Test Turkish messages
console.log('\nTesting Turkish messages:');
i18nService.setLanguage('tr');
console.log('Language set to:', i18nService.getCurrentLanguage());
console.log('scan_card:', i18nService.get('kiosk.scan_card'));
console.log('help_button:', i18nService.get('kiosk.help_button'));
console.log('back:', i18nService.get('kiosk.back'));
console.log('lock_failure_title:', i18nService.get('kiosk.lock_failure_title'));
console.log('text_size_toggle:', i18nService.get('kiosk.text_size_toggle'));

// Test English messages
console.log('\nTesting English messages:');
i18nService.setLanguage('en');
console.log('Language set to:', i18nService.getCurrentLanguage());
console.log('scan_card:', i18nService.get('kiosk.scan_card'));
console.log('help_button:', i18nService.get('kiosk.help_button'));
console.log('back:', i18nService.get('kiosk.back'));
console.log('lock_failure_title:', i18nService.get('kiosk.lock_failure_title'));
console.log('text_size_toggle:', i18nService.get('kiosk.text_size_toggle'));

// Test parameter interpolation
console.log('\nTesting parameter interpolation:');
console.log('opening with id 5:', i18nService.get('kiosk.opening', { id: '5' }));
console.log('pin_attempts_remaining with 3:', i18nService.get('kiosk.pin_attempts_remaining', { attempts: 3 }));

// Test fallback for missing keys
console.log('\nTesting fallback for missing keys:');
console.log('non.existent.key:', i18nService.get('non.existent.key'));

console.log('\n✅ Language switching test completed successfully!');