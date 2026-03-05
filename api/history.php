<?php
/**
 * GET /api/history
 * Returns filtered historical data
 */

header('Content-Type: application/json');
require_once 'db.php';

$date = isset($_GET['date']) ? $_GET['date'] : null;
$tempMin = isset($_GET['tempMin']) ? floatval($_GET['tempMin']) : null;
$tempMax = isset($_GET['tempMax']) ? floatval($_GET['tempMax']) : null;
$humMin = isset($_GET['humMin']) ? floatval($_GET['humMin']) : null;
$humMax = isset($_GET['humMax']) ? floatval($_GET['humMax']) : null;

$sql = "SELECT 
    id,
    temperature, 
    humidity, 
    motor_running as eggTurn,
    fan_running as fanRunning,
    recorded_at as timestamp
FROM sensor_readings 
WHERE 1=1";

$params = [];

if ($date) {
    $sql .= " AND DATE(recorded_at) = ?";
    $params[] = $date;
}
if ($tempMin !== null) {
    $sql .= " AND temperature >= ?";
    $params[] = $tempMin;
}
if ($tempMax !== null) {
    $sql .= " AND temperature <= ?";
    $params[] = $tempMax;
}
if ($humMin !== null) {
    $sql .= " AND humidity >= ?";
    $params[] = $humMin;
}
if ($humMax !== null) {
    $sql .= " AND humidity <= ?";
    $params[] = $humMax;
}

$sql .= " ORDER BY recorded_at DESC LIMIT 500";

$stmt = $pdo->prepare($sql);
$stmt->execute($params);
$logs = $stmt->fetchAll();

// Reverse to show oldest first
$logs = array_reverse($logs);

// Convert timestamps
foreach ($logs as &$log) {
    if (isset($log['timestamp'])) {
        $log['timestamp'] = date('c', strtotime($log['timestamp']));
    }
    $log['eggTurn'] = (bool)$log['eggTurn'];
    $log['fanRunning'] = (bool)$log['fanRunning'];
}

echo json_encode($logs);
