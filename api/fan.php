<?php
/**
 * POST /api/fan
 * Set fan state (on/off)
 */

header('Content-Type: application/json');
require_once 'db.php';

$data = json_decode(file_get_contents('php://input'), true);

$fanState = isset($data['state']) ? (bool)$data['state'] : false;

// Get current readings to update
$stmt = $pdo->query("
    SELECT id, temperature, humidity 
    FROM sensor_readings 
    ORDER BY recorded_at DESC 
    LIMIT 1
");
$current = $stmt->fetch();

// Simulate temperature/humidity change when fan is on
$temperature = $current['temperature'] ?? 37.5;
$humidity = $current['humidity'] ?? 57.0;

if ($fanState) {
    // Fan cooling effect
    $temperature = max(34.0, $temperature - 0.5);
    $humidity = max(40.0, $humidity - 2.0);
}

// Update or insert the latest reading with fan state
if ($current) {
    $stmt = $pdo->prepare("
        UPDATE sensor_readings 
        SET fan_running = ?, temperature = ?, humidity = ?
        WHERE id = ?
    ");
    $stmt->execute([$fanState, $temperature, $humidity, $current['id']]);
} else {
    $stmt = $pdo->prepare("
        INSERT INTO sensor_readings (temperature, humidity, fan_running, motor_running, turns_today, firmware)
        VALUES (?, ?, ?, FALSE, 0, 'v2.1.4')
    ");
    $stmt->execute([$temperature, $humidity, $fanState]);
}

echo json_encode([
    'success' => true,
    'fanRunning' => $fanState,
    'message' => $fanState ? 'Fan turned ON' : 'Fan turned OFF'
]);
