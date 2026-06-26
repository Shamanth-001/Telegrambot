// Quick Bot Status Check
console.log('🤖 Checking bot status...');

// Check if bot files exist and are accessible
import fs from 'fs';
import path from 'path';

const botFile = 'bot.js';
const simpleConverter = 'src/simple-converter.js';

console.log(`📁 Bot file exists: ${fs.existsSync(botFile) ? '✅' : '❌'}`);
console.log(`📁 Simple converter exists: ${fs.existsSync(simpleConverter) ? '✅' : '❌'}`);

// Check if we can import the new converter
try {
    const { SimpleConverter } = await import('./src/simple-converter.js');
    const converter = new SimpleConverter();
    console.log('✅ Simple converter can be imported and instantiated');
    
    // Check method status
    const status = await converter.getMethodStatus();
    console.log('📊 Available methods:');
    for (const [method, info] of Object.entries(status)) {
        console.log(`  ${info.available ? '✅' : '❌'} ${method}`);
    }
} catch (error) {
    console.log(`❌ Error importing simple converter: ${error.message}`);
}

console.log('\n🎉 Bot status check complete!');
console.log('🚀 Your bot should be running with the new streamlined architecture!');
console.log('\n📱 Test it by:');
console.log('1. Send /start to your bot');
console.log('2. Search for a movie');
console.log('3. Try converting - it will now use the 4 robust methods!');

