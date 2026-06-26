// Easy mode switching script
import fs from 'fs';
import path from 'path';

const SOURCE_CONFIG_FILE = './src/config/sources.js';

const modes = {
    '1': 'EINTHUSAN_ONLY',
    '2': 'ALL_SOURCES', 
    '3': 'WORKING_SOURCES'
};

const modeDescriptions = {
    'EINTHUSAN_ONLY': 'Einthusan only - for bypass testing',
    'ALL_SOURCES': 'All sources enabled - production mode',
    'WORKING_SOURCES': 'Working sources only - Einthusan blocked'
};

function switchMode(newMode) {
    try {
        // Read current file
        const fileContent = fs.readFileSync(SOURCE_CONFIG_FILE, 'utf8');
        
        // Replace the CURRENT_MODE line
        const updatedContent = fileContent.replace(
            /export const CURRENT_MODE = '[^']*';/,
            `export const CURRENT_MODE = '${newMode}';`
        );
        
        // Write back to file
        fs.writeFileSync(SOURCE_CONFIG_FILE, updatedContent);
        
        console.log(`✅ Mode switched to: ${newMode}`);
        console.log(`📋 Description: ${modeDescriptions[newMode]}`);
        
        return true;
    } catch (error) {
        console.log(`❌ Error switching mode: ${error.message}`);
        return false;
    }
}

function showCurrentMode() {
    try {
        const fileContent = fs.readFileSync(SOURCE_CONFIG_FILE, 'utf8');
        const match = fileContent.match(/export const CURRENT_MODE = '([^']*)';/);
        
        if (match) {
            const currentMode = match[1];
            console.log(`📋 Current mode: ${currentMode}`);
            console.log(`📋 Description: ${modeDescriptions[currentMode]}`);
        } else {
            console.log('❌ Could not determine current mode');
        }
    } catch (error) {
        console.log(`❌ Error reading current mode: ${error.message}`);
    }
}

function showMenu() {
    console.log('\n🎯 SOURCE MODE SWITCHER');
    console.log('========================');
    console.log('1. EINTHUSAN_ONLY - Einthusan only (for bypass testing)');
    console.log('2. ALL_SOURCES - All sources enabled (production mode)');
    console.log('3. WORKING_SOURCES - Working sources only (Einthusan blocked)');
    console.log('4. Show current mode');
    console.log('5. Exit');
    console.log('========================');
}

// Main execution
const args = process.argv.slice(2);

if (args.length === 0) {
    // Interactive mode
    showMenu();
    showCurrentMode();
    console.log('\n💡 Usage: node switch-mode.js [1|2|3|4]');
    console.log('💡 Or run without arguments to see this menu');
} else {
    const choice = args[0];
    
    if (choice === '4') {
        showCurrentMode();
    } else if (modes[choice]) {
        const newMode = modes[choice];
        showCurrentMode();
        console.log(`\n🔄 Switching to: ${newMode}`);
        if (switchMode(newMode)) {
            console.log('\n✅ Mode switch completed!');
            console.log('💡 Restart the bot to apply changes');
        }
    } else {
        console.log('❌ Invalid choice. Use 1, 2, 3, or 4');
        showMenu();
    }
}
