<?php
/**
 * GET /api/chart
 * Returns chart data for a given time range
 */

header('Content-Type: application/json');
require_once 'db.php';

$range = isset($_GET['range']) ? $_GET['range'] : '6h';

$hours = match($range) {
    '1h' => 1,
    '6h' => 6,
    '24h' => 24,
    '7d' => 168,
    default => 6
};

$stmt = $pdo->prepare("
    SELECT 
        temperature, 
        humidity, 
        motor_running as eggTurn,
        fan_running as fanRunning,
        recorded_at as timestamp
    FROM sensor_readings 
    WHERE recorded_at >= DATE_SUB(NOW(), INTERVAL ? HOUR)
    ORDER BY recorded_at ASC
");

$stmt->execute([$hours]);
$logs = $stmt->fetchAll();

// Convert timestamps
foreach ($logs as &$log) {
    if (isset($log['timestamp'])) {
        $log['timestamp'] = date('c', strtotime($log['timestamp']));
    }
    $log['eggTurn'] = (bool)$log['eggTurn'];
    $log['fanRunning'] = (bool)$log['fanRunning'];
}

echo json_encode($logs);
