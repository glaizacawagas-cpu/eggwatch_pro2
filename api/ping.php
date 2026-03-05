<?php
/**
 * GET /api/ping
 * Test connection to device
 */

header('Content-Type: application/json');
require_once 'db.php';

// Update last connected time
$stmt = $pdo->query("UPDATE device_config SET last_connected = NOW() WHERE is_active = TRUE LIMIT 1");

echo json_encode([
    'success' => true,
    'firmware' => 'v2.1.4',
    'message' => 'Connected to EggWatch Pro'
]);
