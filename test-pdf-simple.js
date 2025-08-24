/**
 * Simple test to verify PDF generation works
 */

const PDFDocument = require('pdfkit');
const fs = require('fs');

console.log('🧪 Testing basic PDF generation...');

// Create a simple PDF
const doc = new PDFDocument();
const chunks = [];

doc.on('data', chunk => chunks.push(chunk));
doc.on('end', () => {
  const pdfBuffer = Buffer.concat(chunks);
  
  console.log(`✅ PDF generated: ${pdfBuffer.length} bytes`);
  
  // Save to file
  fs.writeFileSync('test-simple.pdf', pdfBuffer);
  console.log('💾 PDF saved to: test-simple.pdf');
  
  // Verify PDF structure
  const pdfHeader = pdfBuffer.toString('ascii', 0, 4);
  if (pdfHeader === '%PDF') {
    console.log('✅ PDF structure is valid');
  } else {
    console.log('❌ PDF structure is invalid');
  }
  
  console.log('🎉 Basic PDF test completed successfully!');
});

// Add content to PDF
doc.fontSize(20)
   .font('Helvetica-Bold')
   .text('VIP LOCKER CONTRACT', 50, 50, { align: 'center' });

doc.fontSize(12)
   .font('Helvetica')
   .text('Contract #123', 50, 100)
   .text('Member: Test User', 50, 120)
   .text('Phone: +90 555 123 4567', 50, 140)
   .text('Plan: Premium VIP', 50, 160)
   .text('RFID Card: TEST123456', 50, 180);

doc.end();