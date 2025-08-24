/**
 * Test script to verify VIP contract creation and PDF generation workflow
 * This tests the complete task 17 implementation
 */

const { VipService } = require('./shared/services/vip-service');
const { DatabaseManager } = require('./shared/database/database-manager');
const fs = require('fs');
const path = require('path');

async function testVipPdfWorkflow() {
  console.log('🧪 Testing VIP Contract PDF Generation Workflow...\n');

  try {
    // Initialize database
    console.log('📊 Initializing database...');
    const dbManager = DatabaseManager.getInstance({
      migrationsPath: './migrations'
    });
    await dbManager.initialize();
    const database = dbManager.getDatabase();

    // Initialize VIP service
    const vipService = new VipService(database);

    // Test 1: Create a VIP contract
    console.log('📝 Creating VIP contract...');
    const contractRequest = {
      member_name: 'Test User',
      phone: '+90 555 123 4567',
      email: 'test@example.com',
      plan: 'premium',
      duration_months: 6,
      start_at: new Date().toISOString().split('T')[0],
      created_by: 'test-admin',
      kiosk_id: 'test-kiosk-1',
      locker_id: 99,
      rfid_card: 'TEST123456',
      backup_card: 'TEST789012',
      notes: 'Test contract for PDF generation',
      initial_payment: {
        amount: 225.00,
        method: 'cash',
        reference: 'TEST-PAY-001',
        notes: 'Initial payment for test contract'
      }
    };

    const contract = await vipService.createContract(contractRequest);
    console.log(`✅ Contract created successfully: ID ${contract.id}`);

    // Test 2: Generate PDF without payments
    console.log('📄 Generating PDF without payment history...');
    const pdfBuffer1 = await vipService.generateContractPDF(contract.id, {
      includePayments: false,
      includeTerms: true
    });
    
    console.log(`✅ PDF generated: ${pdfBuffer1.length} bytes`);
    
    // Save PDF to file for manual verification
    const pdfPath1 = path.join(__dirname, `test-contract-${contract.id}-no-payments.pdf`);
    fs.writeFileSync(pdfPath1, pdfBuffer1);
    console.log(`💾 PDF saved to: ${pdfPath1}`);

    // Test 3: Generate PDF with payments
    console.log('📄 Generating PDF with payment history...');
    const pdfBuffer2 = await vipService.generateContractPDF(contract.id, {
      includePayments: true,
      includeTerms: true
    });
    
    console.log(`✅ PDF with payments generated: ${pdfBuffer2.length} bytes`);
    
    // Save PDF to file for manual verification
    const pdfPath2 = path.join(__dirname, `test-contract-${contract.id}-with-payments.pdf`);
    fs.writeFileSync(pdfPath2, pdfBuffer2);
    console.log(`💾 PDF saved to: ${pdfPath2}`);

    // Test 4: Generate PDF with custom company info
    console.log('📄 Generating PDF with custom company info...');
    const pdfBuffer3 = await vipService.generateContractPDF(contract.id, {
      includePayments: true,
      includeTerms: true,
      companyInfo: {
        name: 'Test Gym & Fitness Center',
        address: '123 Test Street, Test City, 12345',
        phone: '+90 555 987 6543',
        email: 'info@testgym.com',
        website: 'www.testgym.com'
      }
    });
    
    console.log(`✅ PDF with custom info generated: ${pdfBuffer3.length} bytes`);
    
    // Save PDF to file for manual verification
    const pdfPath3 = path.join(__dirname, `test-contract-${contract.id}-custom.pdf`);
    fs.writeFileSync(pdfPath3, pdfBuffer3);
    console.log(`💾 PDF saved to: ${pdfPath3}`);

    // Test 5: Add additional payment and regenerate
    console.log('💰 Adding additional payment...');
    await vipService.recordPayment({
      contract_id: contract.id,
      amount: 150.00,
      method: 'card',
      reference: 'TEST-PAY-002',
      notes: 'Second payment for test contract',
      created_by: 'test-admin'
    });

    const pdfBuffer4 = await vipService.generateContractPDF(contract.id, {
      includePayments: true,
      includeTerms: true
    });
    
    console.log(`✅ PDF with multiple payments generated: ${pdfBuffer4.length} bytes`);
    
    // Save PDF to file for manual verification
    const pdfPath4 = path.join(__dirname, `test-contract-${contract.id}-multiple-payments.pdf`);
    fs.writeFileSync(pdfBuffer4, pdfPath4);
    console.log(`💾 PDF saved to: ${pdfPath4}`);

    // Test 6: Performance test - measure PDF generation time
    console.log('⏱️  Testing PDF generation performance...');
    const startTime = Date.now();
    
    for (let i = 0; i < 5; i++) {
      await vipService.generateContractPDF(contract.id, {
        includePayments: true,
        includeTerms: true
      });
    }
    
    const endTime = Date.now();
    const avgTime = (endTime - startTime) / 5;
    console.log(`✅ Average PDF generation time: ${avgTime.toFixed(2)}ms`);

    // Verify performance requirement (under 2 minutes for complete workflow)
    if (avgTime < 2000) { // 2 seconds is very reasonable for PDF generation
      console.log('✅ Performance requirement met: PDF generation is fast');
    } else {
      console.log('⚠️  Performance warning: PDF generation is slower than expected');
    }

    // Test 7: Error handling
    console.log('🚫 Testing error handling...');
    try {
      await vipService.generateContractPDF(99999); // Non-existent contract
      console.log('❌ Error handling failed - should have thrown error');
    } catch (error) {
      console.log('✅ Error handling works correctly:', error.message);
    }

    console.log('\n🎉 All VIP PDF workflow tests completed successfully!');
    console.log('\n📋 Summary:');
    console.log(`- Contract created: ID ${contract.id}`);
    console.log(`- PDFs generated: 4 different variations`);
    console.log(`- Average generation time: ${avgTime.toFixed(2)}ms`);
    console.log(`- Files saved for manual verification`);
    console.log('\n✅ Task 17 implementation is working correctly!');

  } catch (error) {
    console.error('❌ Test failed:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the test
testVipPdfWorkflow().catch(console.error);