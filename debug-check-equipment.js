
const fs = require('fs');
const path = require('path');

const CHAR_DIR = 'app/data/characters';
const SPEC_DIR = 'app/chara_infomation'; // yes, typo in directory name
const LC_LIST_PATH = 'app/data/light-cones/light-cones-list.txt';

// 1. Build Light Cone Map: ID (normalized) -> Japanese Name
const lcMap = new Map();

const lcListContent = fs.readFileSync(LC_LIST_PATH, 'utf-8');
const lcLines = lcListContent.split('\n');

for (const line of lcLines) {
    if (!line.trim()) continue;
    // Format: "    English Name - Japanese Name"
    const parts = line.split(' - ');
    if (parts.length >= 2) {
        const engName = parts[0].trim();
        const jpName = parts[1].trim();

        // ID generation hypothesis: lowercase, replace spaces with hyphens, remove special chars
        const id = engName.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, '-');

        // Also map the exact ID if we can guess it better, but for now let's map the English Name normalized
        // Actually, let's map English Name -> Japanese Name
        // And we will convert the ID from TS file to English Name key.
        lcMap.set(engName.toLowerCase(), jpName);

        // Also try to handle "The" etc?
        // Let's just store the normalized key
        lcMap.set(id, jpName);
    }
}

// Manual overrides or fixes for IDs that might not match simple conversion
lcMap.set('baptism-of-pure-thought', '純粋なる思惟の洗礼');
// Add more if needed based on failures

function getIdFromTs(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const match = content.match(/lightConeId:\s*'([^']+)'/);
    return match ? match[1] : null;
}

function getLcNameFromSpec(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    // Pattern: "光円錐 [Name]"
    const match = content.match(/光円錐\s+(.+)/);
    if (match) return match[1].trim();

    // Sometimes it might be separated by space or tab
    return null;
}

// 2. Iterate Characters
const charFiles = fs.readdirSync(CHAR_DIR).filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts') && f !== 'index.ts');

console.log('--- Verification Report ---');
console.log('Character | Implemented ID | Mapped JP Name | Spec JP Name | Status');
console.log('--- | --- | --- | --- | ---');

let failureCount = 0;

for (const charFile of charFiles) {
    const charName = charFile.replace('.ts', '');

    // Find matching spec file
    // Try exact match, then replace - with _
    let specFile = `${charName}.txt`;
    if (!fs.existsSync(path.join(SPEC_DIR, specFile))) {
        specFile = `${charName.replace(/-/g, '_')}.txt`;
    }

    // Special cases
    if (charName === 'dan-heng-permansor-terrae') specFile = 'dan-heng-imbibitor-lunae.txt'; // Assumption
    if (charName === 'trailblazer-harmony') specFile = 'trailblazer-harmony.txt'; // Check if exists? Maybe 'harmony_tb.txt'? logic later
    if (charName === 'trailblazer-remembrance') specFile = 'trailblazer-remembrance.txt';
    if (charName === 'tribbie') specFile = 'tribbie.txt'; // Assuming


    const specPath = path.join(SPEC_DIR, specFile);

    if (!fs.existsSync(specPath)) {
        console.log(`${charName} | ? | ? | ? | ⚠️ Spec not found (${specFile})`);
        continue;
    }

    const impId = getIdFromTs(path.join(CHAR_DIR, charFile));
    const specLcName = getLcNameFromSpec(specPath);

    if (!impId) {
        console.log(`${charName} | (missing) | ? | ${specLcName || '?'} | 🔴 No default config`);
        continue;
    }

    // Map impId to JP Name
    let mappedJp = lcMap.get(impId);

    // If not found, try to convert id back to english title to search?
    // But I put IDs in the map for keys like 'patience-is-all-you-need'

    if (!mappedJp) {
        // Try fallback search?
        // maybe the ID in map has different punctuation?
        mappedJp = '(Unknown ID mapping)';
    }

    if (!specLcName) {
        console.log(`${charName} | ${impId} | ${mappedJp} | (missing) | ⚠️ Spec missing LC`);
        continue;
    }

    // Compare
    // Sometimes Spec has multiple "Universe Market" etc, split by space? 
    // "光円錐 待つのみ" -> "待つのみ"
    // "光円錐 暖かい夜は長くない" -> "暖かい夜は長くない"

    const isMatch = specLcName.includes(mappedJp);

    const status = isMatch ? '✅ OK' : '❌ MISMATCH';
    if (!isMatch) failureCount++;

    console.log(`${charName} | ${impId} | ${mappedJp} | ${specLcName} | ${status}`);
}

console.log(`\nTotal Failures: ${failureCount}`);
