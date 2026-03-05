<?php
/**
 * POST /api/thresholds
 * Save alert thresholds
 */

header('Content-Type: application/json');
require_once 'db.php';

$data = json_decode(file_get_contents('php://input'), true);

$tempMin = isset($data['tempMin']) ? floatval($data['tempMin']) : 36.0;
$tempMax = isset($data['tempMax']) ? floatval($data['tempMax']) : 38.5;
$humMin = isset($data['humMin']) ? floatval($data['humMin']) : 50.0;
$humMax = isset($data['humMax']) ? floatval($data['humMax']) : 65.0;

$stmt = $pdo->prepare("
    INSERT INTO thresholds (temp_min, temp_max, hum_min, hum_max) 
    VALUES (?, ?, ?, ?)
");
$stmt->execute([$tempMin, $tempMax, $humMin, $humMax]);

echo json_encode(['success' => true]);
