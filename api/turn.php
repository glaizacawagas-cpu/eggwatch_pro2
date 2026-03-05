<?php
/**
 * POST /api/turn
 * Trigger manual egg turn
 */

header('Content-Type: application/json');
require_once 'db.php';

// Get current readings
$stmt = $pdo->query("
    SELECT id, turns_today 
    FROM sensor_readings 
    ORDER BY recorded_at DESC 
    LIMIT 1
");
$current = $stmt->fetch();

$turnsToday = ($current['turns_today'] ?? 0) + 1;

// Calculate next turn time (3 hours from now)
$nextTurn = date('Y-m-d H:i:s', strtotime('+3 hours'));

if ($current) {
    $stmt = $pdo->prepare("
        UPDATE sensor_readings 
        SET motor_running = TRUE, turns_today = ?, next_turn = ?
        WHERE id = ?
    ");
    $stmt->execute([$turnsToday, $nextTurn, $current['id']]);
    
    // Reset motor running after 5 seconds (simulated)
    $stmt = $pdo->prepare("
        UPDATE sensor_readings 
        SET motor_running = FALSE
        WHERE id = ?
    ");
    $stmt->execute([$current['id']]);
} else {
    $stmt = $pdo->prepare("
        INSERT INTO sensor_readings (temperature, humidity, motor_running, turns_today, next_turn, firmware)
        VALUES (37.5, 57.0, TRUE, 1, ?, 'v2.1.4')
    ");
    $stmt->execute([$nextTurn]);
}

echo json_encode([
    'success' => true,
    'message' => 'Manual turn triggered'
]);
