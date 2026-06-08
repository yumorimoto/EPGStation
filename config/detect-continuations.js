const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Configuration
const dbPath = path.join(__dirname, '..', 'data', 'database.db');
const logPath = path.join(__dirname, '..', 'logs', 'epg-continuation.log');

// Setup Logger
function logToFile(data) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${JSON.stringify(data, null, 2)}\n`;
    fs.appendFileSync(logPath, logMessage);
    console.log(`[${timestamp}] Detected Continuation Group. Logged to ${logPath}`);
}

// Ensure logs directory exists
const logsDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

// Use sqlite3 CLI but implement batching to prevent ENOBUFS
function queryDB(query) {
    if (!fs.existsSync(dbPath)) {
        console.log('Database file not found yet. Skipping check.');
        return [];
    }

    try {
        // We write the query to a temporary file because large queries passed via argument can sometimes hit shell limits
        const queryFile = path.join(__dirname, '..', 'logs', `temp_query_${Date.now()}_${Math.random().toString(36).substring(7)}.sql`);
        fs.writeFileSync(queryFile, `.mode json\n${query}`);

        // Execute the CLI passing the query file instead, avoiding argument length limits.
        // Also increase maxBuffer drastically for execSync to 50MB (default is 1MB).
        const result = execSync(`sqlite3 -readonly "${dbPath}" ".read ${queryFile}"`, { encoding: 'utf-8', maxBuffer: 1024 * 1024 * 50 });

        fs.unlinkSync(queryFile);

        if (!result.trim()) return [];
        return JSON.parse(result);
    } catch (err) {
        if (err.message.includes('No such file or directory') || err.message.includes('not found')) {
             console.log('sqlite3 cli not found or database missing. ensure sqlite3 is installed via apt.');
             process.exit(0);
        }
        if (err.message.includes('no such table')) {
             console.log('Tables not initialized yet. Skipping check.');
             process.exit(0);
        }
        console.error('Database query failed:', err.message);
        return null;
    }
}

/**
 * TEXT SIMILARITY FUNCTIONS
 */

// A) Substring Match / Token Overlap
function calculateSubstringMatch(str1, str2) {
    if (!str1 || !str2) return 0;
    const tokens1 = str1.split(/[\s　、。]+/).filter(t => t.length > 0);
    const tokens2 = str2.split(/[\s　、。]+/).filter(t => t.length > 0);

    if (tokens1.length === 0 || tokens2.length === 0) return 0;

    let matchCount = 0;
    for (const t1 of tokens1) {
        if (tokens2.includes(t1)) matchCount++;
    }

    return (matchCount / tokens1.length) * 100;
}

// B) Levenshtein Distance
function calculateLevenshteinDistance(str1, str2) {
    if (!str1 || !str2) return 0;
    const matrix = [];
    for (let i = 0; i <= str1.length; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= str2.length; j++) {
        matrix[0][j] = j;
    }
    for (let i = 1; i <= str1.length; i++) {
        for (let j = 1; j <= str2.length; j++) {
            if (str1.charAt(i - 1) == str2.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }
    const distance = matrix[str1.length][str2.length];
    const maxLength = Math.max(str1.length, str2.length);
    if (maxLength === 0) return 100;

    return ((maxLength - distance) / maxLength) * 100;
}

// C) Longest Common Substring
function findLongestCommonSubstringLength(str1, str2) {
    if (!str1 || !str2) return 0;
    let max = 0;
    let matrix = Array(str1.length).fill(0).map(() => Array(str2.length).fill(0));

    for (let i = 0; i < str1.length; i++) {
        for (let j = 0; j < str2.length; j++) {
            if (str1[i] === str2[j]) {
                if (i === 0 || j === 0) {
                    matrix[i][j] = 1;
                } else {
                    matrix[i][j] = matrix[i - 1][j - 1] + 1;
                }
                if (matrix[i][j] > max) {
                    max = matrix[i][j];
                }
            }
        }
    }
    return max;
}

/**
 * DATABASE QUERIES
 */
// Use ROW_NUMBER() to deduplicate programs that exist in both program and recorded tables simultaneously
// ORDER BY startAt ASC to ensure the array processes chronologically
const COMBINED_QUERY = `
    WITH CombinedData AS (
        SELECT
            p.id, p.channelId, p.startAt, p.endAt, p.name, p.halfWidthName,
            p.description, p.extended, p.videoResolution,
            c.networkId, 'Program' as sourceTable
        FROM program p
        LEFT JOIN channel c ON p.channelId = c.id

        UNION ALL

        SELECT
            r.id, r.channelId, r.startAt, r.endAt, r.name, r.halfWidthName,
            r.description, r.extended, r.videoResolution,
            c.networkId, 'Recorded' as sourceTable
        FROM recorded r
        LEFT JOIN channel c ON r.channelId = c.id
    ),
    DeduplicatedData AS (
        SELECT *, ROW_NUMBER() OVER(PARTITION BY channelId, startAt ORDER BY sourceTable DESC) as rn
        FROM CombinedData
    )
    SELECT * FROM DeduplicatedData WHERE rn = 1 ORDER BY startAt ASC;
`;

/**
 * MAIN EXECUTION
 */

const rows = queryDB(COMBINED_QUERY);

if (!rows || rows.length === 0) {
    console.log('No programs found.');
    process.exit(0);
}

const groupedContinuations = [];
const processedKeys = new Set();

// Create an index of programs mapped by their startAt time for fast lookup
const startAtMap = new Map();
for (const prog of rows) {
    if (!startAtMap.has(prog.startAt)) {
        startAtMap.set(prog.startAt, []);
    }
    startAtMap.get(prog.startAt).push(prog);
}

// Helper to check network/base channel similarity
function isRelatedChannel(progA, progB) {
    const isSameNetwork = (progA.networkId !== null && progA.networkId === progB.networkId);

    // channelId often looks like 400101 -> 400102. Dividing by 100 gets base channel (e.g. 4001).
    const baseChannelA = Math.floor(progA.channelId / 100);
    const baseChannelB = Math.floor(progB.channelId / 100);
    const isSameBaseChannel = (baseChannelA === baseChannelB);

    return isSameNetwork || isSameBaseChannel;
}

// Find continuations by matching endAt to startAt iteratively
for (const initialProg of rows) {
    const key = `${initialProg.channelId}-${initialProg.startAt}`;
    if (processedKeys.has(key)) continue;

    let currentProg = initialProg;
    const currentGroup = [currentProg];
    processedKeys.add(key);

    let nextFound = true;
    while (nextFound) {
        nextFound = false;
        const potentialNextProgs = startAtMap.get(currentProg.endAt);

        if (potentialNextProgs) {
            for (const potentialNext of potentialNextProgs) {
                const nextKey = `${potentialNext.channelId}-${potentialNext.startAt}`;
                if (!processedKeys.has(nextKey) && isRelatedChannel(currentProg, potentialNext)) {
                     currentGroup.push(potentialNext);
                     processedKeys.add(nextKey);
                     currentProg = potentialNext; // Move the pointer forward
                     nextFound = true;
                     break; // Found the immediate continuation, move to looking for the next one
                }
            }
        }
    }

    if (currentGroup.length > 1) {
        groupedContinuations.push(currentGroup);
    }
}


// Process and log groups
if (groupedContinuations.length > 0) {
    groupedContinuations.forEach((group) => {
        const outputLog = {
            groupSize: group.length,
            parts: [],
            similarityAnalytics: []
        };

        for (let i = 0; i < group.length; i++) {
            // Add Part Metadata
            outputLog.parts.push({
                partNumber: i + 1,
                id: group[i].id,
                source: group[i].sourceTable,
                channelId: group[i].channelId,
                networkId: group[i].networkId,
                startAt: group[i].startAt,
                endAt: group[i].endAt,
                videoResolution: group[i].videoResolution,
                name: group[i].name,
                halfWidthName: group[i].halfWidthName
            });

            // Calculate similarity against the NEXT part (if exists)
            if (i < group.length - 1) {
                const currentName = group[i].halfWidthName || group[i].name || "";
                const nextName = group[i+1].halfWidthName || group[i+1].name || "";

                outputLog.similarityAnalytics.push({
                    comparison: `Part ${i+1} -> Part ${i+2}`,
                    tokenOverlapPercentage: calculateSubstringMatch(currentName, nextName).toFixed(2) + '%',
                    levenshteinSimilarity: calculateLevenshteinDistance(currentName, nextName).toFixed(2) + '%',
                    longestCommonSubstringLength: findLongestCommonSubstringLength(currentName, nextName)
                });
            }
        }
        logToFile(outputLog);
    });
    console.log(`Successfully processed and logged ${groupedContinuations.length} continuation groups.`);
} else {
    console.log("No continuations found in the current database snapshot.");
}
