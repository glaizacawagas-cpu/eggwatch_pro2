<?php
/**
 * POST /api/schedule
 * Save egg turning schedule
 */

header('Content-Type: application/json');
require_once 'db.php';

$data = json_decode(file_get_contents('php://input'), true);

$turnsPerDay = isset($data['turnsPerDay']) ? intval($data['turnsPerDay']) : 8;
$intervalHours = isset($data['intervalHours']) ? floatval($data['intervalHours']) : 3;

// Calculate schedule times
$times = [];
$start = new DateTime('00:00:00');
for ($i = 0; $i < $turnsPerDay; $i++) {
    $times[] = $start->format('H:i');
    $start->modify("+{$intervalHours} hours");
}

// Deactivate old schedules
$stmt = $pdo->prepare("UPDATE schedules SET is_active = FALSE");
$stmt->execute();

// Insert new schedule
$stmt = $pdo->prepare("
    INSERT INTO schedules (turns_per_day, interval_hours, schedule_times, is_active) 
    VALUES (?, ?, ?, TRUE)
");
$stmt->execute([$turnsPerDay, $intervalHours, json_encode($times)]);

echo json_encode([
    'success' => true,
    'schedule' => $times
]);
