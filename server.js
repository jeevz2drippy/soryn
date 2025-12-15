/**
 * Soryn License Panel - Backend Server
 * Deploy on Render.com
 */

const express = require('express');
const cors = require('cors');
const https = require('https');
const crypto = require('crypto');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ============================================
// CONFIGURATION
// ============================================
const CONFIG = {
    backendUrl: 'https://backend-server-trhh.onrender.com',
    appName: 'Soryn',
    version: '1.0',
    secretSalt: 'ToolRebrand2024SecureAuth',
    buildDate: '2024-01-15'
};

const KEYAUTH_API = 'https://keyauth.win/api/seller/';

// Store seller key in memory (fetched on startup)
let SELLER_KEY = null;

// ============================================
// UTILITY FUNCTIONS
// ============================================

function generateAppSignature() {
    const signatureData = `${CONFIG.appName}-${CONFIG.version}-${CONFIG.secretSalt}-${CONFIG.buildDate}`;
    return crypto.createHash('sha256').update(signatureData).digest('hex').substring(0, 16).toUpperCase();
}

function makeKeyAuthRequest(params) {
    return new Promise((resolve, reject) => {
        const url = `${KEYAUTH_API}?${params.toString()}`;
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch (e) { reject(new Error(`Invalid response: ${data.substring(0, 200)}`)); }
            });
        }).on('error', reject);
    });
}

async function fetchSellerKey() {
    return new Promise((resolve, reject) => {
        const signature = generateAppSignature();
        const url = `${CONFIG.backendUrl}/api/config/${encodeURIComponent(CONFIG.appName)}`;
        
        https.get(url, {
            headers: {
                'X-App-Signature': signature,
                'X-App-Name': CONFIG.appName,
                'X-App-Version': CONFIG.version
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json.success && json.config && json.config.seller_key) {
                        resolve(json.config.seller_key);
                    } else {
                        reject(new Error('Could not fetch seller key'));
                    }
                } catch (e) { reject(new Error(`Backend error`)); }
            });
        }).on('error', reject);
    });
}

function parseDurationFromKeyName(keyName) {
    const lower = keyName.toLowerCase();
    if (lower.includes('lifetime')) return 999999999;
    if (lower.includes('1month') || lower.includes('-1m')) return 2592000;
    if (lower.includes('1week') || lower.includes('-1w')) return 604800;
    if (lower.includes('1day') || lower.includes('-1d')) return 86400;
    if (lower.includes('1year') || lower.includes('-1y')) return 31536000;
    return 999999999;
}

function parseBackupText(content) {
    const lines = content.split('\n');
    const licenses = [];
    
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('─') || trimmed.startsWith('┌') || 
            trimmed.startsWith('│') || trimmed.startsWith('└') || trimmed.startsWith('├') ||
            trimmed.startsWith('Key') || trimmed.includes('license(s):') || 
            trimmed.includes('MAIN MENU') || trimmed.includes('Select option')) {
            continue;
        }
        
        const parts = trimmed.split(/\s{2,}/);
        if (parts.length >= 1) {
            const key = parts[0].trim();
            if (key.toLowerCase().startsWith('soryn')) {
                let status = parts.length >= 2 ? parts[1].trim() : 'Not Used';
                let level = parts.length >= 3 && /^\d+$/.test(parts[2].trim()) ? parts[2].trim() : '1';
                const duration = parseDurationFromKeyName(key);
                licenses.push({ key, status, level, duration });
            }
        }
    }
    return licenses;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================
// API ROUTES
// ============================================

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', connected: !!SELLER_KEY });
});

// Get all licenses
app.get('/api/licenses', async (req, res) => {
    try {
        if (!SELLER_KEY) throw new Error('Not connected');
        const params = new URLSearchParams({ sellerkey: SELLER_KEY, type: 'fetchallkeys' });
        const response = await makeKeyAuthRequest(params);
        res.json({ success: true, licenses: response.keys || [] });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// Get all users
app.get('/api/users', async (req, res) => {
    try {
        if (!SELLER_KEY) throw new Error('Not connected');
        const params = new URLSearchParams({ sellerkey: SELLER_KEY, type: 'fetchallusers' });
        const response = await makeKeyAuthRequest(params);
        res.json({ success: true, users: response.users || [] });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// Generate licenses
app.post('/api/generate', async (req, res) => {
    try {
        if (!SELLER_KEY) throw new Error('Not connected');
        const { amount, duration, level, mask } = req.body;
        
        const params = new URLSearchParams({
            sellerkey: SELLER_KEY,
            type: 'add',
            expiry: duration.toString(),
            mask: mask || 'Soryn-XXXXX-XXXXX',
            level: level || '1',
            amount: amount || '1',
            owner: CONFIG.appName
        });
        
        const response = await makeKeyAuthRequest(params);
        if (response.success) {
            const keys = response.keys || (response.key ? [response.key] : []);
            res.json({ success: true, keys });
        } else {
            res.json({ success: false, error: response.message });
        }
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// Delete all licenses
app.post('/api/wipe/licenses', async (req, res) => {
    try {
        if (!SELLER_KEY) throw new Error('Not connected');
        const params = new URLSearchParams({ sellerkey: SELLER_KEY, type: 'delallkeys' });
        const response = await makeKeyAuthRequest(params);
        res.json({ success: response.success, message: response.message });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// Delete unused licenses
app.post('/api/wipe/unused', async (req, res) => {
    try {
        if (!SELLER_KEY) throw new Error('Not connected');
        const params = new URLSearchParams({ sellerkey: SELLER_KEY, type: 'delunusedkeys' });
        const response = await makeKeyAuthRequest(params);
        res.json({ success: response.success, message: response.message });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// Delete used licenses
app.post('/api/wipe/used', async (req, res) => {
    try {
        if (!SELLER_KEY) throw new Error('Not connected');
        const params = new URLSearchParams({ sellerkey: SELLER_KEY, type: 'delusedkeys' });
        const response = await makeKeyAuthRequest(params);
        res.json({ success: response.success, message: response.message });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// Delete all users
app.post('/api/wipe/users', async (req, res) => {
    try {
        if (!SELLER_KEY) throw new Error('Not connected');
        const params = new URLSearchParams({ sellerkey: SELLER_KEY, type: 'delallusers' });
        const response = await makeKeyAuthRequest(params);
        res.json({ success: response.success, message: response.message });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// Full wipe
app.post('/api/wipe/full', async (req, res) => {
    try {
        if (!SELLER_KEY) throw new Error('Not connected');
        
        const keysParams = new URLSearchParams({ sellerkey: SELLER_KEY, type: 'delallkeys' });
        await makeKeyAuthRequest(keysParams);
        
        const usersParams = new URLSearchParams({ sellerkey: SELLER_KEY, type: 'delallusers' });
        await makeKeyAuthRequest(usersParams);
        
        res.json({ success: true, message: 'Full wipe complete' });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// Ban license
app.post('/api/license/ban', async (req, res) => {
    try {
        if (!SELLER_KEY) throw new Error('Not connected');
        const { key, reason } = req.body;
        
        const params = new URLSearchParams({ 
            sellerkey: SELLER_KEY, 
            type: 'ban', 
            key: key,
            reason: reason || ''
        });
        const response = await makeKeyAuthRequest(params);
        
        // Also ban user
        const userParams = new URLSearchParams({ 
            sellerkey: SELLER_KEY, 
            type: 'banuser', 
            user: key,
            reason: reason || ''
        });
        await makeKeyAuthRequest(userParams);
        
        res.json({ success: response.success, message: response.message });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// Unban license
app.post('/api/license/unban', async (req, res) => {
    try {
        if (!SELLER_KEY) throw new Error('Not connected');
        const { key } = req.body;
        
        const params = new URLSearchParams({ sellerkey: SELLER_KEY, type: 'unban', key });
        const response = await makeKeyAuthRequest(params);
        
        // Also unban user
        const userParams = new URLSearchParams({ sellerkey: SELLER_KEY, type: 'unbanuser', user: key });
        await makeKeyAuthRequest(userParams);
        
        res.json({ success: response.success, message: response.message });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// Delete specific license
app.post('/api/license/delete', async (req, res) => {
    try {
        if (!SELLER_KEY) throw new Error('Not connected');
        const { key } = req.body;
        
        const params = new URLSearchParams({ sellerkey: SELLER_KEY, type: 'del', key });
        const response = await makeKeyAuthRequest(params);
        res.json({ success: response.success, message: response.message });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// Reset HWID
app.post('/api/user/reset-hwid', async (req, res) => {
    try {
        if (!SELLER_KEY) throw new Error('Not connected');
        const { username } = req.body;
        
        const params = new URLSearchParams({ sellerkey: SELLER_KEY, type: 'resethwid', user: username });
        const response = await makeKeyAuthRequest(params);
        res.json({ success: response.success, message: response.message });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// Delete user
app.post('/api/user/delete', async (req, res) => {
    try {
        if (!SELLER_KEY) throw new Error('Not connected');
        const { username } = req.body;
        
        const params = new URLSearchParams({ sellerkey: SELLER_KEY, type: 'deluser', user: username });
        const response = await makeKeyAuthRequest(params);
        res.json({ success: response.success, message: response.message });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// Export/Backup
app.get('/api/backup', async (req, res) => {
    try {
        if (!SELLER_KEY) throw new Error('Not connected');
        
        const keysParams = new URLSearchParams({ sellerkey: SELLER_KEY, type: 'fetchallkeys' });
        const usersParams = new URLSearchParams({ sellerkey: SELLER_KEY, type: 'fetchallusers' });
        
        const [keysResponse, usersResponse] = await Promise.all([
            makeKeyAuthRequest(keysParams),
            makeKeyAuthRequest(usersParams)
        ]);
        
        const backup = {
            exportDate: new Date().toISOString(),
            appName: CONFIG.appName,
            licenses: keysResponse.keys || [],
            users: usersResponse.users || []
        };
        
        res.json({ success: true, backup });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// Restore status tracking
let restoreStatus = {
    running: false,
    total: 0,
    processed: 0,
    success: 0,
    skipped: 0,
    failed: 0,
    currentKey: '',
    error: null
};

// Get restore status
app.get('/api/restore/status', (req, res) => {
    res.json(restoreStatus);
});

// Stop restore
app.post('/api/restore/stop', (req, res) => {
    restoreStatus.running = false;
    res.json({ success: true });
});

// Restore from backup - with proper rate limiting
app.post('/api/restore', async (req, res) => {
    try {
        if (!SELLER_KEY) throw new Error('Not connected');
        if (restoreStatus.running) throw new Error('Restore already in progress');
        
        const { licenses, wipeFirst } = req.body;
        
        if (!licenses || !Array.isArray(licenses)) {
            throw new Error('Invalid licenses data');
        }
        
        // Reset status
        restoreStatus = {
            running: true,
            total: licenses.length,
            processed: 0,
            success: 0,
            skipped: 0,
            failed: 0,
            currentKey: '',
            error: null
        };
        
        // Send immediate response
        res.json({ success: true, message: 'Restore started', total: licenses.length });
        
        // Wipe if requested
        if (wipeFirst) {
            restoreStatus.currentKey = 'Wiping database...';
            const wipeKeys = new URLSearchParams({ sellerkey: SELLER_KEY, type: 'delallkeys' });
            const wipeUsers = new URLSearchParams({ sellerkey: SELLER_KEY, type: 'delallusers' });
            await makeKeyAuthRequest(wipeKeys);
            await sleep(2000); // Wait after wipe
            await makeKeyAuthRequest(wipeUsers);
            await sleep(3000); // Wait before starting adds
        }
        
        // Process licenses with SLOW rate limiting
        for (let i = 0; i < licenses.length; i++) {
            if (!restoreStatus.running) {
                restoreStatus.error = 'Stopped by user';
                break;
            }
            
            const license = licenses[i];
            const key = license.key;
            const duration = license.duration || parseDurationFromKeyName(key);
            const level = license.level || '1';
            
            restoreStatus.currentKey = key;
            restoreStatus.processed = i + 1;
            
            const params = new URLSearchParams({
                sellerkey: SELLER_KEY,
                type: 'add',
                key: key,
                expiry: duration.toString(),
                level: level
            });
            
            let retries = 3;
            let added = false;
            
            while (retries > 0 && !added) {
                try {
                    const result = await makeKeyAuthRequest(params);
                    
                    if (result.success) {
                        restoreStatus.success++;
                        added = true;
                    } else if (result.message) {
                        const msg = result.message.toLowerCase();
                        if (msg.includes('already') || msg.includes('exists') || msg.includes('duplicate')) {
                            restoreStatus.skipped++;
                            added = true; // Don't retry
                        } else if (msg.includes('rate') || msg.includes('limit') || msg.includes('slow')) {
                            // Rate limited - wait longer and retry
                            console.log(`Rate limited on ${key}, waiting 10s...`);
                            await sleep(10000);
                            retries--;
                        } else {
                            restoreStatus.failed++;
                            added = true; // Don't retry other errors
                        }
                    } else {
                        restoreStatus.failed++;
                        added = true;
                    }
                } catch (e) {
                    console.log(`Error on ${key}: ${e.message}, retrying...`);
                    await sleep(5000);
                    retries--;
                    if (retries === 0) {
                        restoreStatus.failed++;
                    }
                }
            }
            
            // SLOW DOWN - 1.5 seconds between each key
            await sleep(1500);
            
            // Extra pause every 20 keys
            if ((i + 1) % 20 === 0) {
                console.log(`Processed ${i + 1}/${licenses.length}, pausing 5s...`);
                await sleep(5000);
            }
        }
        
        restoreStatus.running = false;
        restoreStatus.currentKey = 'Complete';
        console.log(`Restore complete: ${restoreStatus.success} added, ${restoreStatus.skipped} skipped, ${restoreStatus.failed} failed`);
        
    } catch (error) {
        restoreStatus.running = false;
        restoreStatus.error = error.message;
        if (!res.headersSent) {
            res.json({ success: false, error: error.message });
        }
    }
});

// Parse backup file text
app.post('/api/parse-backup', (req, res) => {
    try {
        const { content } = req.body;
        
        // Try JSON first
        try {
            const json = JSON.parse(content);
            const licenses = json.licenses || json.keys || (Array.isArray(json) ? json : []);
            return res.json({ success: true, licenses, format: 'json' });
        } catch (e) {
            // Not JSON, try text format
        }
        
        const licenses = parseBackupText(content);
        res.json({ success: true, licenses, format: 'text' });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// ============================================
// STARTUP
// ============================================

const PORT = process.env.PORT || 3000;

async function startup() {
    console.log('🚀 Starting Soryn License Panel...');
    
    try {
        SELLER_KEY = await fetchSellerKey();
        console.log('✅ Connected to KeyAuth');
    } catch (error) {
        console.log('⚠️  Could not auto-connect:', error.message);
        console.log('   You can set seller key manually via API');
    }
    
    app.listen(PORT, () => {
        console.log(`\n✅ Panel running on port ${PORT}`);
        console.log(`   Open http://localhost:${PORT} in browser`);
    });
}

startup();
