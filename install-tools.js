import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';

const execPromise = promisify(exec);

async function installMissingTools() {
    console.log('🔧 Installing missing tools...\n');
    
    const tools = [
        {
            name: 'yt-dlp',
            check: 'yt-dlp --version',
            install: 'pip install -U yt-dlp',
            fallback: 'python -m pip install -U yt-dlp'
        },
        {
            name: 'streamlink',
            check: 'streamlink --version',
            install: 'pip install streamlink',
            fallback: 'python -m pip install streamlink'
        },
        {
            name: 'ffmpeg',
            check: 'ffmpeg -version',
            install: 'winget install ffmpeg',
            fallback: 'choco install ffmpeg',
            manual: 'Download from https://ffmpeg.org/download.html'
        }
    ];
    
    for (const tool of tools) {
        try {
            await execPromise(tool.check);
            console.log(`✅ ${tool.name} is already installed`);
        } catch (error) {
            console.log(`❌ ${tool.name} not found, attempting to install...`);
            
            try {
                await execPromise(tool.install);
                console.log(`✅ ${tool.name} installed successfully`);
            } catch (installError) {
                if (tool.fallback) {
                    try {
                        await execPromise(tool.fallback);
                        console.log(`✅ ${tool.name} installed via fallback method`);
                    } catch (fallbackError) {
                        console.log(`❌ Failed to install ${tool.name}`);
                        if (tool.manual) {
                            console.log(`📋 Manual installation: ${tool.manual}`);
                        }
                    }
                } else {
                    console.log(`❌ Failed to install ${tool.name}`);
                    if (tool.manual) {
                        console.log(`📋 Manual installation: ${tool.manual}`);
                    }
                }
            }
        }
    }
    
    console.log('\n✅ Tool installation check complete!');
}

// Run installation
installMissingTools().catch(console.error);
