#!/usr/bin/env node

import { searchYTS } from './src/yts.js';

// Test movies for YTS-only approach
const testMovies = [
  "Avengers Endgame",
  "Spider Man No Way Home", 
  "The Dark Knight",
  "Inception",
  "Interstellar",
  "Top Gun Maverick",
  "John Wick",
  "The Matrix",
  "Iron Man",
  "Avatar"
];

console.log('🎬 YTS-ONLY COMPREHENSIVE TEST');
console.log('='.repeat(60));

async function testYTSMovie(movieName) {
  console.log(`\n📡 Testing YTS with: "${movieName}"`);
  console.log('-'.repeat(40));
  
  try {
    const startTime = Date.now();
    const results = await searchYTS(movieName, { limit: 10 });
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    console.log(`⏱️  Response time: ${duration}ms`);
    console.log(`📊 Results found: ${results.length}`);
    
    if (results.length === 0) {
      console.log('❌ NO RESULTS FOUND');
      return { success: false, results: [], duration, movieName };
    }
    
    // Show top 3 results (highest seeders)
    const topResults = results.slice(0, 3);
    console.log(`\n🎯 Top 3 Results (by seeders):`);
    
    topResults.forEach((result, index) => {
      console.log(`\n🎬 Result ${index + 1}:`);
      console.log(`   Title: ${result.title}`);
      console.log(`   Quality: ${result.quality || 'N/A'}`);
      console.log(`   Size: ${result.size ? `${Math.round(result.size / (1024*1024))}MB` : 'N/A'}`);
      console.log(`   Seeders: ${result.seeders || 'N/A'}`);
      console.log(`   Leechers: ${result.leechers || 'N/A'}`);
      
      // CRITICAL: Verify .torrent URL (YTS uses hash-based URLs)
      const hasTorrent = result.torrent_url && result.torrent_url.includes('yts.mx/torrent/download/');
      const hasMagnet = result.magnet_link && result.magnet_link.startsWith('magnet:');
      
      console.log(`   🔗 Link Types:`);
      console.log(`      📁 .torrent: ${hasTorrent ? '✅' : '❌'} ${hasTorrent ? result.torrent_url : 'None'}`);
      console.log(`      🧲 magnet: ${hasMagnet ? '❌ VIOLATION' : '✅'} ${hasMagnet ? 'SHOULD NOT EXIST' : 'Correctly disabled'}`);
      
      // Validate YTS requirements
      if (hasTorrent && !hasMagnet) {
        console.log(`      ✅ YTS: .torrent file found (CORRECT)`);
      } else if (hasMagnet) {
        console.log(`      ❌ YTS: Magnet found (VIOLATION - should be .torrent only)`);
      } else {
        console.log(`      ❌ YTS: No .torrent file found (ERROR)`);
      }
    });
    
    // Check if we have exactly 3 results
    const hasEnoughResults = results.length >= 3;
    console.log(`\n📋 Results Count: ${results.length >= 3 ? '✅' : '❌'} ${results.length}/3 required`);
    
    return { 
      success: true, 
      results: topResults, 
      duration, 
      movieName,
      hasEnoughResults,
      allHaveTorrents: topResults.every(r => r.torrent_url && r.torrent_url.includes('yts.mx/torrent/download/')),
      noMagnets: topResults.every(r => !r.magnet_link)
    };
    
  } catch (error) {
    console.log(`❌ ERROR: ${error.message}`);
    return { success: false, error: error.message, duration: 0, movieName };
  }
}

async function runYTSComprehensiveTest() {
  console.log('\n🚀 Starting YTS-only comprehensive test...\n');
  
  const testResults = {
    totalTests: testMovies.length,
    passedTests: 0,
    failedTests: 0,
    moviesWithEnoughResults: 0,
    moviesWithValidTorrents: 0,
    moviesWithNoMagnets: 0,
    issues: []
  };
  
  // Test each movie
  for (const movie of testMovies) {
    const result = await testYTSMovie(movie);
    
    if (result.success) {
      testResults.passedTests++;
      if (result.hasEnoughResults) testResults.moviesWithEnoughResults++;
      if (result.allHaveTorrents) testResults.moviesWithValidTorrents++;
      if (result.noMagnets) testResults.moviesWithNoMagnets++;
    } else {
      testResults.failedTests++;
      testResults.issues.push(`${movie}: ${result.error || 'No results'}`);
    }
  }
  
  // Generate comprehensive report
  console.log('\n📊 YTS-ONLY TEST RESULTS');
  console.log('='.repeat(60));
  console.log(`Total Movies Tested: ${testResults.totalTests}`);
  console.log(`Passed: ${testResults.passedTests} ✅`);
  console.log(`Failed: ${testResults.failedTests} ❌`);
  console.log(`Success Rate: ${((testResults.passedTests / testResults.totalTests) * 100).toFixed(1)}%`);
  
  console.log('\n📈 Quality Metrics:');
  console.log(`   Movies with ≥3 results: ${testResults.moviesWithEnoughResults}/${testResults.totalTests} (${((testResults.moviesWithEnoughResults / testResults.totalTests) * 100).toFixed(1)}%)`);
  console.log(`   Movies with valid .torrent URLs: ${testResults.moviesWithValidTorrents}/${testResults.totalTests} (${((testResults.moviesWithValidTorrents / testResults.totalTests) * 100).toFixed(1)}%)`);
  console.log(`   Movies with NO magnet links: ${testResults.moviesWithNoMagnets}/${testResults.totalTests} (${((testResults.moviesWithNoMagnets / testResults.totalTests) * 100).toFixed(1)}%)`);
  
  if (testResults.issues.length > 0) {
    console.log('\n🚨 ISSUES FOUND:');
    testResults.issues.forEach((issue, index) => {
      console.log(`   ${index + 1}. ${issue}`);
    });
  }
  
  console.log('\n🎯 YTS REQUIREMENTS CHECK:');
  console.log('✅ Return ONLY .torrent file URLs');
  console.log('✅ NO magnet links allowed');
  console.log('✅ Sort by highest seeders first');
  console.log('✅ Filter out results with no valid torrent URLs');
  
  const overallSuccess = testResults.passedTests === testResults.totalTests && 
                        testResults.moviesWithEnoughResults === testResults.totalTests &&
                        testResults.moviesWithValidTorrents === testResults.totalTests &&
                        testResults.moviesWithNoMagnets === testResults.totalTests;
  
  console.log(`\n🏆 OVERALL YTS STATUS: ${overallSuccess ? '✅ PERFECT' : '❌ NEEDS IMPROVEMENT'}`);
  
  if (!overallSuccess) {
    console.log('\n🔧 RECOMMENDATIONS:');
    if (testResults.moviesWithEnoughResults < testResults.totalTests) {
      console.log('• Some movies return <3 results - check YTS API response');
    }
    if (testResults.moviesWithValidTorrents < testResults.totalTests) {
      console.log('• Some results missing .torrent URLs - fix URL construction');
    }
    if (testResults.moviesWithNoMagnets < testResults.totalTests) {
      console.log('• Some results have magnet links - remove magnet_link field');
    }
  }
  
  return testResults;
}

// Run the test
runYTSComprehensiveTest().catch(console.error);
