// EggWatch Pro - Local Server
// Run with: node server.js

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;

// File MIME types
const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

// Database file
const dbFile = path.join(__dirname, 'data', 'db.json');

// Initialize database
if (!fs.existsSync(path.join(__dirname, 'data'))) {
    fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
}

if (!fs.existsSync(dbFile)) {
    const initialData = {
        sensor_readings: [],
        schedules: [{ turns_per_day: 8, interval_hours: 3, is_active: true }],
        thresholds: [{ temp_min: 36.0, temp_max: 38.5, hum_min: 50.0, hum_max: 65.0 }]
    };
    fs.writeFileSync(dbFile, JSON.stringify(initialData));
}

function readDb() {
    return JSON.parse(fs.readFileSync(dbFile, 'utf8'));
}

function saveDb(data) {
    fs.writeFileSync(dbFile, JSON.stringify(data, null, 2));
}

// Handle API requests
function handleApi(req, res, pathname) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    const path = pathname.replace('/api/', '').split('?')[0];
    const db = readDb();

    switch (path) {
        case 'status':
            const readings = db.sensor_readings || [];
            if (readings.length === 0) {
                res.json({
                    temperature: 0, humidity: 0, motorRunning: false,
                    fanRunning: false, heaterRunning: false, turnsToday: 0,
                    uptime: 0, firmware: 'v2.0', timestamp: new Date().toISOString(), connected: false
                });
            } else {
                const latest = readings[readings.length - 1];
                latest.connected = true;
                res.json(latest);
            }
            break;

        case 'ping':
            res.json({ success: true, firmware: 'v2.0', timestamp: new Date().toISOString() });
            break;

        case 'data':
            if (req.method === 'POST') {
                let body = '';
                req.on('data', chunk => body += chunk);
                req.on('end', () => {
                    const input = JSON.parse(body);
                    const reading = {
                        temperature: parseFloat(input.temperature) || 0,
                        humidity: parseFloat(input.humidity) || 0,
                        motorRunning: Boolean(input.motorRunning),
                        fanRunning: Boolean(input.fanRunning),
                        heaterRunning: Boolean(input.heaterRunning),
                        turnsToday: parseInt(input.turnsToday) || 0,
                        uptime: parseInt(input.uptime) || 0,
                        firmware: input.firmware || 'v2.0',
                        timestamp: new Date().toISOString()
                    };
                    db.sensor_readings = db.sensor_readings || [];
                    db.sensor_readings.push(reading);
                    if (db.sensor_readings.length > 1000) {
                        db.sensor_readings = db.sensor_readings.slice(-1000);
                    }
                    saveDb(db);
                    res.json({ success: true, message: 'Data received' });
                });
            }
            break;

        case 'logs':
            const limit = parseInt(new URL(req.url, 'http://localhost').searchParams.get('limit')) || 20;
            const logReadings = (db.sensor_readings || []).slice(-limit);
            res.json(logReadings.reverse());
            break;

        case 'history':
            res.json((db.sensor_readings || []).reverse());
            break;

        case 'chart':
            res.json((db.sensor_readings || []).slice(-100).reverse());
            break;

        case 'fan':
            if (req.method === 'POST') {
                let body = '';
                req.on('data', chunk => body += chunk);
                req.on('end', () => {
                    const input = JSON.parse(body);
                    const state = Boolean(input.state);
                    const readings = db.sensor_readings || [];
                    if (readings.length > 0) {
                        readings[readings.length - 1].fanRunning = state;
                        readings[readings.length - 1].timestamp = new Date().toISOString();
                    }
                    saveDb(db);
                    res.json({ success: true, fanRunning: state, message: state ? 'Fan ON' : 'Fan OFF' });
                });
            }
            break;

        case 'turn':
            if (req.method === 'POST') {
                const readings = db.sensor_readings || [];
                if (readings.length > 0) {
                    readings[readings.length - 1].motorRunning = true;
                    readings[readings.length - 1].turnsToday = (readings[readings.length - 1].turnsToday || 0) + 1;
                    readings[readings.length - 1].timestamp = new Date().toISOString();
                    saveDb(db);
                }
                res.json({ success: true, message: 'Manual turn triggered' });
            }
            break;

        default:
            res.status(404).json({ error: 'Not found' });
    }
}

// Create server
const server = http.createServer((req, res) => {
    console.log(`${req.method} ${req.url}`);

    // Parse URL
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const pathname = url.pathname;

    // API routes
    if (pathname.startsWith('/api/')) {
        handleApi(req, res, pathname);
        return;
    }

    // Serve static files
    let filePath = pathname === '/' ? '/index.html' : pathname;
    filePath = path.join(__dirname, filePath);

    const ext = path.extname(filePath);
    const contentType = mimeTypes[ext] || 'text/plain';

    fs.readFile(filePath, (err, content) => {
        if (err) {
            if (err.code === 'ENOENT') {
                // Serve index.html for SPA
                fs.readFile(path.join(__dirname, 'index.html'), (err, content) => {
                    res.writeHead(200, { 'Content-Type': 'text/html' });
                    res.end(content, 'utf-8');
                });
            } else {
                res.writeHead(500);
                res.end('Server Error');
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

server.listen(PORT, () => {
    console.log(`\n🥚 EggWatch Pro Server running at:`);
    console.log(`   Local:   http://localhost:${PORT}`);
    console.log(`   Network: http://192.168.1.49:${PORT}`);
    console.log(`\nMake sure your ESP32 points to: http://192.168.1.49:${PORT}/api`);
    console.log(`\nPress Ctrl+C to stop\n`);
});
