#!/usr/bin/env node

// Setup script for Two-Bot Movie Cache System
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

console.log('🎬 Two-Bot Movie Cache System Setup\n');

async function checkDependencies() {
  console.log('📦 Checking dependencies...');
  
  try {
    // Check if better-sqlite3 is installed
    await execAsync('npm list better-sqlite3');
    console.log('✅ better-sqlite3 is installed');
  } catch (error) {
    console.log('❌ better-sqlite3 not found');
    console.log('📥 Installing better-sqlite3...');
    
    try {
      await execAsync('npm install better-sqlite3');
      console.log('✅ better-sqlite3 installed successfully');
    } catch (installError) {
      console.error('❌ Failed to install better-sqlite3:', installError.message);
      process.exit(1);
    }
  }
}

async function checkEnvironmentFile() {
  console.log('\n🔧 Checking environment configuration...');
  
  const envPath = '.env';
  const envExamplePath = '.env.example';
  
  if (!fs.existsSync(envPath)) {
    console.log('❌ .env file not found');
    
    if (fs.existsSync(envExamplePath)) {
      console.log('📋 Creating .env from .env.example...');
      fs.copyFileSync(envExamplePath, envPath);
      console.log('✅ .env file created');
    } else {
      console.log('📝 Creating .env file...');
      const envContent = `# Two-Bot Movie Cache System Configuration

# Bot Tokens (Get from @BotFather)
DOWNLOADER_BOT_TOKEN=your_downloader_bot_token_here
API_BOT_TOKEN=your_api_bot_token_here

# Channel Configuration
CACHE_CHANNEL_ID=-1001234567890
DOWNLOADER_BOT_CHAT_ID=your_chat_id_here

# Cache Settings
CACHE_TTL_HOURS=24
MAX_CACHE_SIZE=100
MAX_CONCURRENT_DOWNLOADS=3

# Admin Settings
ADMIN_USER_ID=931635587

# Database
DATABASE_PATH=./movie_cache.db

# Logging
LOG_LEVEL=info
`;
      fs.writeFileSync(envPath, envContent);
      console.log('✅ .env file created with default values');
    }
    
    console.log('\n⚠️  Please edit .env file with your actual bot tokens and channel ID');
  } else {
    console.log('✅ .env file exists');
  }
}

async function createDirectories() {
  console.log('\n📁 Creating necessary directories...');
  
  const dirs = ['downloads', 'logs'];
  
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`✅ Created directory: ${dir}`);
    } else {
      console.log(`✅ Directory exists: ${dir}`);
    }
  }
}

async function validateConfiguration() {
  console.log('\n🔍 Validating configuration...');
  
  try {
    const { botConfig, validateBotConfig } = await import('./src/botConfig.js');
    
    try {
      validateBotConfig();
      console.log('✅ Configuration is valid');
    } catch (error) {
      console.log('❌ Configuration validation failed:');
      console.log(`   ${error.message}`);
      console.log('\n📝 Please check your .env file and ensure all required values are set');
      return false;
    }
    
    return true;
  } catch (error) {
    console.log('❌ Failed to load configuration:', error.message);
    return false;
  }
}

async function testDatabase() {
  console.log('\n💾 Testing database connection...');
  
  try {
    const { movieCache } = await import('./src/movieCache.js');
    
    // Test database operations
    const stats = movieCache.getStats();
    console.log('✅ Database connection successful');
    console.log(`   Cache stats: ${stats.total} total, ${stats.active} active, ${stats.expired} expired`);
    
    movieCache.close();
    return true;
  } catch (error) {
    console.log('❌ Database test failed:', error.message);
    return false;
  }
}

async function displaySetupInstructions() {
  console.log('\n📖 ===== SETUP INSTRUCTIONS =====');
  console.log('1. Create two Telegram bots via @BotFather:');
  console.log('   - Downloader Bot (Bot A): For downloading movies');
  console.log('   - API Bot (Bot B): For user interactions');
  console.log('');
  console.log('2. Create a private Telegram channel:');
  console.log('   - Name: "Movie Cache Storage"');
  console.log('   - Add both bots as admins');
  console.log('   - Set "Only admins can post" = true');
  console.log('');
  console.log('3. Get channel ID:');
  console.log('   - Forward any message from channel to @userinfobot');
  console.log('   - Copy the channel ID (starts with -100)');
  console.log('');
  console.log('4. Update .env file with your tokens and IDs');
  console.log('');
  console.log('5. Start the system:');
  console.log('   node src/startMovieCacheSystem.js');
  console.log('');
  console.log('6. Test with: /search <movie name>');
  console.log('================================\n');
}

async function main() {
  try {
    await checkDependencies();
    await checkEnvironmentFile();
    await createDirectories();
    
    const configValid = await validateConfiguration();
    if (configValid) {
      await testDatabase();
      console.log('\n🎉 Setup completed successfully!');
      console.log('🚀 You can now start the system with:');
      console.log('   node src/startMovieCacheSystem.js');
    } else {
      console.log('\n⚠️  Setup completed with configuration issues');
      console.log('📝 Please fix the configuration and run setup again');
    }
    
    await displaySetupInstructions();
    
  } catch (error) {
    console.error('❌ Setup failed:', error.message);
    process.exit(1);
  }
}

main();

