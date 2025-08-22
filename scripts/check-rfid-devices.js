#!/usr/bin/env node

/**
 * RFID Device Detection Script
 * Checks for available RFID readers and HID devices
 */

import HID from 'node-hid';

console.log('🔍 RFID Cihaz Tarama Başlatılıyor...\n');

try {
  // Get all HID devices
  const devices = HID.devices();
  
  console.log('📱 Bulunan HID Cihazları:');
  console.log('========================');
  
  if (devices.length === 0) {
    console.log('❌ Hiç HID cihazı bulunamadı');
  } else {
    devices.forEach((device, index) => {
      console.log(`${index + 1}. Cihaz:`);
      console.log(`   Vendor ID: 0x${device.vendorId?.toString(16).padStart(4, '0') || 'N/A'}`);
      console.log(`   Product ID: 0x${device.productId?.toString(16).padStart(4, '0') || 'N/A'}`);
      console.log(`   Manufacturer: ${device.manufacturer || 'N/A'}`);
      console.log(`   Product: ${device.product || 'N/A'}`);
      console.log(`   Path: ${device.path || 'N/A'}`);
      console.log(`   Serial: ${device.serialNumber || 'N/A'}`);
      console.log('');
    });
  }
  
  // Look for potential RFID readers
  console.log('🎯 Potansiyel RFID Okuyucular:');
  console.log('==============================');
  
  const rfidDevices = devices.filter(device => {
    const product = (device.product || '').toLowerCase();
    const manufacturer = (device.manufacturer || '').toLowerCase();
    
    return product.includes('rfid') || 
           product.includes('card') || 
           product.includes('reader') ||
           manufacturer.includes('rfid') ||
           device.vendorId === 0x08ff || // AuthenTec/Upek
           device.vendorId === 0x0483 || // STMicroelectronics
           device.vendorId === 0x1a86 || // QinHeng Electronics (CH340)
           device.vendorId === 0x0403;   // FTDI
  });
  
  if (rfidDevices.length === 0) {
    console.log('❌ Potansiyel RFID okuyucu bulunamadı');
    console.log('💡 Öneriler:');
    console.log('   1. RFID okuyucunun USB bağlantısını kontrol edin');
    console.log('   2. Cihazın güç aldığından emin olun');
    console.log('   3. Farklı USB port deneyin');
    console.log('   4. lsusb komutu ile sistem seviyesinde kontrol edin');
  } else {
    rfidDevices.forEach((device, index) => {
      console.log(`✅ ${index + 1}. RFID Okuyucu Adayı:`);
      console.log(`   Vendor ID: 0x${device.vendorId?.toString(16).padStart(4, '0')}`);
      console.log(`   Product ID: 0x${device.productId?.toString(16).padStart(4, '0')}`);
      console.log(`   Product: ${device.product || 'N/A'}`);
      console.log(`   Path: ${device.path}`);
      console.log('');
    });
  }
  
  // Check input devices (for keyboard-mode RFID readers)
  console.log('⌨️  Input Cihazları Kontrolü:');
  console.log('=============================');
  
  try {
    const fs = await import('fs');
    const inputDevices = fs.readdirSync('/dev/input').filter(file => file.startsWith('event'));
    
    if (inputDevices.length > 0) {
      console.log('✅ Input event cihazları bulundu:');
      inputDevices.forEach(device => {
        console.log(`   /dev/input/${device}`);
      });
      console.log('\n💡 Klavye modundaki RFID okuyucular bu cihazlar üzerinden çalışabilir');
    } else {
      console.log('❌ Input event cihazı bulunamadı');
    }
  } catch (error) {
    console.log('⚠️  Input cihazları kontrol edilemedi:', error.message);
  }
  
} catch (error) {
  console.error('❌ Cihaz tarama hatası:', error.message);
  console.log('\n🔧 Sorun giderme önerileri:');
  console.log('   1. node-hid paketinin doğru kurulduğunu kontrol edin');
  console.log('   2. Kullanıcının HID cihazlarına erişim iznini kontrol edin');
  console.log('   3. sudo ile çalıştırmayı deneyin (geçici test için)');
}

console.log('\n✅ Cihaz tarama tamamlandı');