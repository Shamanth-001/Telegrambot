import fs from 'fs';
import path from 'path';

function checkStreamFabInstallation() {
  console.log("🔍 CHECKING STREAMFAB INSTALLATION");
  console.log("=" .repeat(50));
  
  const possiblePaths = [
    'C:\\Program Files\\DVDFab\\StreamFab\\StreamFab64.exe',
    'C:\\Program Files\\StreamFab\\StreamFab.exe',
    'C:\\Program Files (x86)\\StreamFab\\StreamFab.exe',
    'C:\\Users\\' + process.env.USERNAME + '\\AppData\\Local\\StreamFab\\StreamFab.exe',
    'C:\\Users\\' + process.env.USERNAME + '\\AppData\\Roaming\\StreamFab\\StreamFab.exe',
    'C:\\StreamFab\\StreamFab.exe'
  ];
  
  let streamfabFound = false;
  let streamfabPath = null;
  
  console.log("📋 Checking common StreamFab installation paths...");
  
  for (const testPath of possiblePaths) {
    console.log(`🔍 Checking: ${testPath}`);
    
    if (fs.existsSync(testPath)) {
      console.log(`✅ StreamFab found at: ${testPath}`);
      streamfabFound = true;
      streamfabPath = testPath;
      break;
    } else {
      console.log(`❌ Not found at: ${testPath}`);
    }
  }
  
  console.log("\n📊 INSTALLATION STATUS:");
  console.log("=" .repeat(30));
  
  if (streamfabFound) {
    console.log(`✅ StreamFab is installed`);
    console.log(`📁 Path: ${streamfabPath}`);
    
    // Check file size
    try {
      const stats = fs.statSync(streamfabPath);
      const fileSize = (stats.size / 1024 / 1024).toFixed(2);
      console.log(`📊 Size: ${fileSize} MB`);
      console.log(`📅 Modified: ${stats.mtime.toLocaleDateString()}`);
    } catch (error) {
      console.log(`⚠️ Could not get file info: ${error.message}`);
    }
    
    console.log(`\n🎉 StreamFab is ready to use!`);
    console.log(`💡 You can now run: node scripts/test-streamfab-integration.js`);
    
  } else {
    console.log(`❌ StreamFab is not installed`);
    console.log(`\n📥 INSTALLATION STEPS:`);
    console.log(`1. Download StreamFab from: https://www.streamfab.com/`);
    console.log(`2. Install StreamFab to default location`);
    console.log(`3. Run this check again`);
    console.log(`\n💡 After installation, run: node scripts/test-streamfab-integration.js`);
  }
  
  console.log("\n🔧 ALTERNATIVE PATHS TO CHECK:");
  console.log("=" .repeat(30));
  console.log(`• Check if StreamFab is installed in a custom location`);
  console.log(`• Look for StreamFab.exe in your Downloads folder`);
  console.log(`• Search for "StreamFab" in your Start Menu`);
  console.log(`• Check if it's installed as a portable version`);
  
  console.log("\n📋 NEXT STEPS:");
  console.log("=" .repeat(30));
  if (streamfabFound) {
    console.log(`1. ✅ StreamFab is ready`);
    console.log(`2. 🧪 Test integration: node scripts/test-streamfab-integration.js`);
    console.log(`3. 🚀 Use in bot: The bot will automatically use StreamFab`);
  } else {
    console.log(`1. 📥 Install StreamFab first`);
    console.log(`2. 🔍 Run this check again`);
    console.log(`3. 🧪 Test integration after installation`);
  }
  
  console.log("=" .repeat(50));
  console.log("🎬 STREAMFAB INSTALLATION CHECK COMPLETED");
  
  return {
    found: streamfabFound,
    path: streamfabPath
  };
}

checkStreamFabInstallation();


