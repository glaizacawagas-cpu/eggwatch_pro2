<?php
/**
 * GET /api/status
 * Returns current sensor readings
 */

header('Content-Type: application/json');
require_once 'db.php';

// Get the latest sensor reading from database
$stmt = $pdo->query("
    SELECT 
        temperature, 
        humidity, 
        motor_running as motorRunning, 
        fan_running as fanRunning,
        heater_running as heaterRunning,
        turns_today as turnsToday,
        next_turn as nextTurnMs,
        uptime_seconds as uptime,
        firmware,
        recorded_at as timestamp
    FROM sensor_readings 
    ORDER BY recorded_at DESC 
    LIMIT 1
");

$reading = $stmt->fetch();

// If no reading exists, return defaults
if (!$reading) {
    $reading = [
        'temperature' => 37.5,
        'humidity' => 57.0,
        'motorRunning' => false,
        'fanRunning' => false,
        'heaterRunning' => true,
        'turnsToday' => 0,
        'nextTurnMs' => null,
        'uptime' => 0,
        'firmware' => 'v2.1.4-esp32',
        'timestamp' => date('c')
    ];
} else {
    // Convert timestamp to ISO format
    if (isset($reading['timestamp'])) {
        $reading['timestamp'] = date('c', strtotime($reading['timestamp']));
    }
    // Convert nextTurnMs from datetime to milliseconds timestamp
    if (isset($reading['nextTurnMs']) && $reading['nextTurnMs']) {
        $reading['nextTurnMs'] = strtotime($reading['nextTurnMs']) * 1000;
    }
}

echo json_encode($reading);
