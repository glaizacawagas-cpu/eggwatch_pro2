<?php
/**
 * GET /api/logs
 * Returns recent sensor log entries
 */

header('Content-Type: application/json');
require_once 'db.php';

$limit = isset($_GET['limit']) ? intval($_GET['limit']) : 20;
$limit = min(max($limit, 1), 500); // Clamp between 1 and 500

$stmt = $pdo->prepare("
    SELECT 
        id,
        temperature, 
        humidity, 
        motor_running as eggTurn,
        recorded_at as timestamp
    FROM sensor_readings 
    ORDER BY recorded_at DESC 
    LIMIT ?
");

$stmt->execute([$limit]);
$logs = $stmt->fetchAll();

// Reverse to show oldest first
$logs = array_reverse($logs);

// Convert timestamps
foreach ($logs as &$log) {
    if (isset($log['timestamp'])) {
        $log['timestamp'] = date('c', strtotime($log['timestamp']));
    }
    $log['eggTurn'] = (bool)$log['eggTurn'];
}

echo json_encode($logs);
