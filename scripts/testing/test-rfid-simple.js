#!/usr/bin/env node

/**
 * Simple RFID Reader Test Script
 * Tests RFID functionality with proper configuration
 */

import { RfidHandler } from '../app/kiosk/src/hardware/rfid-handler.ts';

async function testRfidReader() {
  console.log('🔍 RFID Okuyucu Test Başlatılıyor...');
  
  // Try HID mode first
  const hidConfig = {
    reader_type: 'hid',
    debounce_ms: 1000,
    // Auto-detect common RFID readers
  };
  
  const rfidHandler = new RfidHandler(hidConfig);
  
  // Set up event listeners
  rfidHandler.on('connected', () => {
    console.log('✅ RFID okuyucu bağlandı (HID modu)');
    console.log('📱 Şimdi bir RFID kart okutun...');
  });
  
  rfidHandler.on('card_scanned', (scanEvent) => {
    console.log('✅ Kart tespit edildi!');
    console.log('   Kart ID:', scanEvent.card_id);
    console.log('   Okuma zamanı:', scanEvent.scan_time);
    console.log('   Okuyucu ID:', scanEvent.reader_id);
    
    // Exit after successful scan
    setTimeout(() => {
      console.log('✅ RFID test başarılı!');
      process.exit(0);
    }, 1000);
  });
  
  rfidHandler.on('error', (error) => {
    console.log('❌ RFID Hatası (HID modu):', error.message);
    console.log('🔄 Klavye modunu deniyorum...');
    
    // Try keyboard mode as fallback
    testKeyboardMode();
  });
  
  rfidHandler.on('disconnected', () => {
    console.log('🔌 RFID okuyucu bağlantısı kesildi');
  });
  
  // Initialize the reader
  try {
    await rfidHandler.initialize();
  } catch (error) {
    console.log('❌ HID modu başlatılamadı:', error.message);
    console.log('🔄 Klavye modunu deniyorum...');
    testKeyboardMode();
  }
  
  // Set timeout for test
  setTimeout(() => {
    console.log('⏰ Test zaman aşımı (30 saniye)');
    console.log('💡 Eğer kart okuttuysanız ama tespit edilmediyse:');
    console.log('   1. RFID okuyucunun USB bağlantısını kontrol edin');
    console.log('   2. lsusb komutu ile cihazın tanındığını doğrulayın');
    console.log('   3. Farklı bir RFID kart deneyin');
    process.exit(1);
  }, 30000);
}

async function testKeyboardMode() {
  console.log('⌨️  Klavye modu test ediliyor...');
  
  const keyboardConfig = {
    reader_type: 'keyboard',
    debounce_ms: 1000
  };
  
  const rfidHandler = new RfidHandler(keyboardConfig);
  
  rfidHandler.on('connected', () => {
    console.log('✅ RFID okuyucu bağlandı (Klavye modu)');
    console.log('📱 Şimdi bir RFID kart okutun (klavye girişi olarak)...');
  });
  
  rfidHandler.on('card_scanned', (scanEvent) => {
    console.log('✅ Kart tespit edildi (Klavye modu)!');
    console.log('   Kart ID:', scanEvent.card_id);
    console.log('   Okuma zamanı:', scanEvent.scan_time);
    console.log('   Okuyucu ID:', scanEvent.reader_id);
    
    setTimeout(() => {
      console.log('✅ RFID test başarılı!');
      process.exit(0);
    }, 1000);
  });
  
  rfidHandler.on('error', (error) => {
    console.log('❌ RFID Hatası (Klavye modu):', error.message);
  });
  
  try {
    await rfidHandler.initialize();
  } catch (error) {
    console.log('❌ Klavye modu da başlatılamadı:', error.message);
    console.log('🔧 RFID okuyucu donanım sorunu olabilir');
    process.exit(1);
  }
}

// Handle process termination
process.on('SIGINT', () => {
  console.log('\n🛑 Test durduruldu');
  process.exit(0);
});

// Start the test
testRfidReader().catch(console.error);