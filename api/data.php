<?php
/**
 * POST /api/data
 * Insert sensor reading (called by ESP32 or simulation)
 */

header('Content-Type: application/json');
require_once 'db.php';

$data = json_decode(file_get_contents('php://input'), true);

$temperature = isset($data['temperature']) ? floatval($data['temperature']) : 37.5;
$humidity = isset($data['humidity']) ? floatval($data['humidity']) : 57.0;
$motorRunning = isset($data['motorRunning']) ? (bool)$data['motorRunning'] : false;
$fanRunning = isset($data['fanRunning']) ? (bool)$data['fanRunning'] : false;
$turnsToday = isset($data['turnsToday']) ? intval($data['turnsToday']) : 0;
$uptime = isset($data['uptime']) ? intval($data['uptime']) : 0;
$firmware = isset($data['firmware']) ? $data['firmware'] : 'v2.1.4';

// Calculate next turn time (3 hours from now)
$nextTurn = date('Y-m-d H:i:s', strtotime('+3 hours'));

$stmt = $pdo->prepare("
    INSERT INTO sensor_readings 
    (temperature, humidity, motor_running, fan_running, turns_today, next_turn, uptime_seconds, firmware)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
");

$stmt->execute([
    $temperature,
    $humidity,
    $motorRunning,
    $fanRunning,
    $turnsToday,
    $nextTurn,
    $uptime,
    $firmware
]);

echo json_encode([
    'success' => true,
    'id' => $pdo->lastInsertId()
]);
