// EggWatch Pro - Vercel Serverless API (Node.js)
// Handles all API endpoints for ESP32 communication

const fs = require('fs');
const path = require('path');

const dbFile = path.join(__dirname, '..', 'data', 'db.json');

// Ensure data directory exists
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// Initialize database file if not exists
if (!fs.existsSync(dbFile)) {
    const initialData = {
        sensor_readings: [],
        schedules: [{ turns_per_day: 8, interval_hours: 3, is_active: true }],
        thresholds: [{ temp_min: 36.0, temp_max: 38.5, hum_min: 50.0, hum_max: 65.0 }],
        device_config: [{ device_name: 'EggWatch', ip: '192.168.1.100' }]
    };
    fs.writeFileSync(dbFile, JSON.stringify(initialData));
}

// Helper functions
function readDb() {
    return JSON.parse(fs.readFileSync(dbFile, 'utf8'));
}

function saveDb(data) {
    fs.writeFileSync(dbFile, JSON.stringify(data, null, 2));
}

module.exports = (req, res) => {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // Parse URL to get endpoint
    const path = req.url.replace('/api/', '').split('?')[0];

    // Set JSON content type
    res.setHeader('Content-Type', 'application/json');

    const db = readDb();

    switch (path) {
        case 'status':
            const readings = db.sensor_readings || [];
            if (readings.length === 0) {
                res.json({
                    temperature: 0,
                    humidity: 0,
                    motorRunning: false,
                    fanRunning: false,
                    heaterRunning: false,
                    turnsToday: 0,
                    uptime: 0,
                    firmware: 'v2.0',
                    timestamp: new Date().toISOString(),
                    connected: false
                });
            } else {
                const latest = readings[readings.length - 1];
                latest.connected = true;
                res.json(latest);
            }
            break;
            
        case 'ping':
            res.json({
                success: true,
                firmware: 'v2.0',
                timestamp: new Date().toISOString()
            });
            break;
            
        case 'data':
            if (req.method === 'POST') {
                const input = req.body || {};
                
                if (input.temperature !== undefined) {
                    const reading = {
                        temperature: parseFloat(input.temperature) || 0,
                        humidity: parseFloat(input.humidity) || 0,
                        motorRunning: Boolean(input.motorRunning),
                        fanRunning: Boolean(input.fanRunning),
                        heaterRunning: Boolean(input.heaterRunning),
                        turnsToday: parseInt(input.turnsToday) || 0,
                        uptime: parseInt(input.uptime) || 0,
                        firmware: input.firmware || 'v2.0',
                        device: input.device || 'ESP32',
                        timestamp: new Date().toISOString()
                    };
                    
                    db.sensor_readings = db.sensor_readings || [];
                    db.sensor_readings.push(reading);
                    
                    // Keep only last 1000 readings
                    if (db.sensor_readings.length > 1000) {
                        db.sensor_readings = db.sensor_readings.slice(-1000);
                    }
                    
                    saveDb(db);
                    
                    res.json({
                        success: true,
                        message: 'Data received'
                    });
                } else {
                    res.json({ error: 'No data received' });
                }
            }
            break;
            
        case 'logs':
            const limit = parseInt(req.query.limit) || 20;
            const logReadings = (db.sensor_readings || []).slice(-limit);
            res.json(logReadings.reverse());
            break;
            
        case 'history':
            res.json((db.sensor_readings || []).reverse());
            break;
            
        case 'chart':
            const chartReadings = (db.sensor_readings || []).slice(-100);
            res.json(chartReadings.reverse());
            break;
            
        case 'fan':
            if (req.method === 'POST') {
                const state = Boolean(req.body?.state);
                const readings = db.sensor_readings || [];
                
                if (readings.length > 0) {
                    readings[readings.length - 1].fanRunning = state;
                    readings[readings.length - 1].timestamp = new Date().toISOString();
                } else {
                    readings.push({
                        temperature: 0,
                        humidity: 0,
                        motorRunning: false,
                        fanRunning: state,
                        heaterRunning: false,
                        turnsToday: 0,
                        uptime: 0,
                        firmware: 'v2.0',
                        timestamp: new Date().toISOString()
                    });
                }
                
                saveDb(db);
                
                res.json({
                    success: true,
                    fanRunning: state,
                    message: state ? 'Fan turned ON' : 'Fan turned OFF'
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
                
                res.json({
                    success: true,
                    message: 'Manual turn triggered'
                });
            }
            break;
            
        default:
            res.json({
                error: 'Not found',
                endpoints: {
                    'GET /api/status': 'Get current readings',
                    'GET /api/ping': 'Test connection',
                    'POST /api/data': 'Send sensor data',
                    'POST /api/fan': 'Control fan',
                    'POST /api/turn': 'Trigger turn'
                }
            });
    }
};
