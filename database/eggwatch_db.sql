-- EggWatch Pro Database Schema
-- Run this in phpMyAdmin or MySQL to create the database

-- Create database
CREATE DATABASE IF NOT EXISTS eggwatch_db;
USE eggwatch_db;

-- Table: sensor_readings (stores temperature, humidity, motor, fan data)
CREATE TABLE IF NOT EXISTS sensor_readings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    temperature DECIMAL(4,2) NOT NULL,
    humidity DECIMAL(5,2) NOT NULL,
    motor_running BOOLEAN DEFAULT FALSE,
    fan_running BOOLEAN DEFAULT FALSE,
    heater_running BOOLEAN DEFAULT TRUE,
    turns_today INT DEFAULT 0,
    next_turn DATETIME,
    uptime_seconds BIGINT DEFAULT 0,
    firmware VARCHAR(50),
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_recorded_at (recorded_at)
);

-- Table: schedules (egg turning schedules)
CREATE TABLE IF NOT EXISTS schedules (
    id INT AUTO_INCREMENT PRIMARY KEY,
    turns_per_day INT NOT NULL,
    interval_hours DECIMAL(4,2) NOT NULL,
    schedule_times JSON,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Table: thresholds (alert thresholds)
CREATE TABLE IF NOT EXISTS thresholds (
    id INT AUTO_INCREMENT PRIMARY KEY,
    temp_min DECIMAL(4,2) DEFAULT 36.00,
    temp_max DECIMAL(4,2) DEFAULT 38.50,
    hum_min DECIMAL(5,2) DEFAULT 50.00,
    hum_max DECIMAL(5,2) DEFAULT 65.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Table: device_config (ESP32 device configuration)
CREATE TABLE IF NOT EXISTS device_config (
    id INT AUTO_INCREMENT PRIMARY KEY,
    device_name VARCHAR(100) DEFAULT 'EggWatch Incubator',
    ip_address VARCHAR(45) DEFAULT '192.168.1.100',
    port INT DEFAULT 80,
    poll_interval INT DEFAULT 5,
    is_active BOOLEAN DEFAULT TRUE,
    last_connected TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Table: alert_logs (history of alerts)
CREATE TABLE IF NOT EXISTS alert_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    alert_type VARCHAR(50) NOT NULL,
    alert_message VARCHAR(255) NOT NULL,
    temperature DECIMAL(4,2),
    humidity DECIMAL(5,2),
    is_resolved BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP NULL,
    INDEX idx_alert_type (alert_type),
    INDEX idx_created_at (created_at)
);

-- Insert default data
INSERT INTO thresholds (temp_min, temp_max, hum_min, hum_max) 
VALUES (36.00, 38.50, 50.00, 65.00);

INSERT INTO device_config (device_name, ip_address, port, poll_interval) 
VALUES ('EggWatch Incubator', '192.168.1.100', 80, 5);

INSERT INTO schedules (turns_per_day, interval_hours, schedule_times, is_active) 
VALUES (8, 3, '["00:00", "03:00", "06:00", "09:00", "12:00", "15:00", "18:00", "21:00"]', TRUE);
