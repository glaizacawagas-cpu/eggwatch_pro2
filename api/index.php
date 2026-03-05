<?php
/**
 * EggWatch Pro - Vercel Serverless Function
 * Handles all API routes
 */

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Get the endpoint from the URI
$uri = $_SERVER['REQUEST_URI'];
$path = parse_url($uri, PHP_URL_PATH);
$path = str_replace('/api/', '', $path);

// Simple database (using JSON file for Vercel compatibility)
// In production, use a proper database service
$dbFile = __DIR__ . '/../data/db.json';

// Ensure data directory exists
if (!is_dir(__DIR__ . '/../data')) {
    mkdir(__DIR__ . '/../data', 0755, true);
}

// Initialize database file if not exists
if (!file_exists($dbFile)) {
    $initialData = [
        'sensor_readings' => [],
        'schedules' => [['turns_per_day' => 8, 'interval_hours' => 3, 'is_active' => true]],
        'thresholds' => [['temp_min' => 36.0, 'temp_max' => 38.5, 'hum_min' => 50.0, 'hum_max' => 65.0]],
        'device_config' => [['device_name' => 'EggWatch', 'ip' => '192.168.1.100']]
    ];
    file_put_contents($dbFile, json_encode($initialData));
}

// Read database
$db = json_decode(file_get_contents($dbFile), true);

// Helper functions
function saveDb($data) {
    global $dbFile;
    file_put_contents($dbFile, json_encode($data, JSON_PRETTY_PRINT));
}

function getJsonInput() {
    return json_decode(file_get_contents('php://input'), true);
}

// Route handling
switch ($path) {
    case 'status':
        header('Content-Type: application/json');
        $readings = $db['sensor_readings'] ?? [];
        if (empty($readings)) {
            echo json_encode([
                'temperature' => 37.5,
                'humidity' => 57.0,
                'motorRunning' => false,
                'fanRunning' => false,
                'heaterRunning' => true,
                'turnsToday' => 0,
                'uptime' => 0,
                'firmware' => 'v2.1.4',
                'timestamp' => date('c')
            ]);
        } else {
            $latest = end($readings);
            echo json_encode($latest);
        }
        break;
        
    case 'logs':
        header('Content-Type: application/json');
        $limit = $_GET['limit'] ?? 20;
        $readings = array_slice($db['sensor_readings'] ?? [], -$limit);
        echo json_encode(array_reverse($readings));
        break;
        
    case 'history':
        header('Content-Type: application/json');
        $readings = $db['sensor_readings'] ?? [];
        echo json_encode(array_reverse($readings));
        break;
        
    case 'chart':
        header('Content-Type: application/json');
        $readings = $db['sensor_readings'] ?? [];
        echo json_encode(array_slice(array_reverse($readings), -100));
        break;
        
    case 'ping':
        header('Content-Type: application/json');
        echo json_encode(['success' => true, 'firmware' => 'v2.1.4']);
        break;
        
    case 'data':
        if ($_SERVER['REQUEST_METHOD'] === 'POST') {
            $input = getJsonInput();
            $reading = [
                'temperature' => $input['temperature'] ?? 37.5,
                'humidity' => $input['humidity'] ?? 57.0,
                'motorRunning' => $input['motorRunning'] ?? false,
                'fanRunning' => $input['fanRunning'] ?? false,
                'heaterRunning' => $input['heaterRunning'] ?? true,
                'turnsToday' => $input['turnsToday'] ?? 0,
                'uptime' => $input['uptime'] ?? 0,
                'firmware' => $input['firmware'] ?? 'v2.1.4',
                'timestamp' => date('c')
            ];
            $db['sensor_readings'][] = $reading;
            // Keep only last 1000 readings
            if (count($db['sensor_readings']) > 1000) {
                $db['sensor_readings'] = array_slice($db['sensor_readings'], -1000);
            }
            saveDb($db);
            header('Content-Type: application/json');
            echo json_encode(['success' => true]);
        }
        break;
        
    case 'fan':
        if ($_SERVER['REQUEST_METHOD'] === 'POST') {
            $input = getJsonInput();
            $state = $input['state'] ?? false;
            
            // Get latest reading and update fan state
            $readings = &$db['sensor_readings'];
            if (!empty($readings)) {
                $latest = &$readings[count($readings) - 1];
                $latest['fanRunning'] = $state;
                $latest['timestamp'] = date('c');
            } else {
                $readings[] = [
                    'temperature' => 37.5,
                    'humidity' => 57.0,
                    'motorRunning' => false,
                    'fanRunning' => $state,
                    'heaterRunning' => true,
                    'turnsToday' => 0,
                    'uptime' => 0,
                    'firmware' => 'v2.1.4',
                    'timestamp' => date('c')
                ];
            }
            saveDb($db);
            header('Content-Type: application/json');
            echo json_encode([
                'success' => true,
                'fanRunning' => $state,
                'message' => $state ? 'Fan turned ON' : 'Fan turned OFF'
            ]);
        }
        break;
        
    case 'turn':
        if ($_SERVER['REQUEST_METHOD'] === 'POST') {
            $readings = &$db['sensor_readings'];
            if (!empty($readings)) {
                $latest = &$readings[count($readings) - 1];
                $latest['motorRunning'] = true;
                $latest['turnsToday'] = ($latest['turnsToday'] ?? 0) + 1;
                $latest['timestamp'] = date('c');
                saveDb($db);
            }
            header('Content-Type: application/json');
            echo json_encode(['success' => true, 'message' => 'Manual turn triggered']);
        }
        break;
        
    case 'schedule':
        if ($_SERVER['REQUEST_METHOD'] === 'POST') {
            $input = getJsonInput();
            $turnsPerDay = $input['turnsPerDay'] ?? 8;
            $intervalHours = $input['intervalHours'] ?? 3;
            
            // Calculate schedule times
            $times = [];
            $start = new DateTime('00:00:00');
            for ($i = 0; $i < $turnsPerDay; $i++) {
                $times[] = $start->format('H:i');
                $start->modify("+{$intervalHours} hours");
            }
            
            // Deactivate old schedules
            foreach ($db['schedules'] as &$s) { $s['is_active'] = false; }
            
            // Add new schedule
            $db['schedules'][] = [
                'turns_per_day' => $turnsPerDay,
                'interval_hours' => $intervalHours,
                'schedule_times' => $times,
                'is_active' => true
            ];
            saveDb($db);
            
            header('Content-Type: application/json');
            echo json_encode(['success' => true, 'schedule' => $times]);
        }
        break;
        
    case 'thresholds':
        if ($_SERVER['REQUEST_METHOD'] === 'POST') {
            $input = getJsonInput();
            $db['thresholds'][] = [
                'temp_min' => $input['tempMin'] ?? 36.0,
                'temp_max' => $input['tempMax'] ?? 38.5,
                'hum_min' => $input['humMin'] ?? 50.0,
                'hum_max' => $input['humMax'] ?? 65.0
            ];
            saveDb($db);
            header('Content-Type: application/json');
            echo json_encode(['success' => true]);
        }
        break;
        
    default:
        http_response_code(404);
        header('Content-Type: application/json');
        echo json_encode(['error' => 'Not found']);
}
