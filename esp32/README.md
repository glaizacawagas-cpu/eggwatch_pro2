# EggWatch Pro - ESP32 Setup Guide

## Hardware Requirements

### Components Needed:
1. **ESP32 DevKit V1** (or similar ESP32 board)
2. **DHT22 Sensor** - Temperature & Humidity
3. **Servo Motor** - SG90 or similar (for egg turning)
4. **2x Relay Module** - 5V/10A (for fan and motor control)
5. **LED** - Status indicator (optional, built-in LED can be used)
6. **Jumper Wires**
7. **Power Supply** - 5V/2A for ESP32

### Pin Connections:

| Component | GPIO Pin | Notes |
|-----------|----------|-------|
| DHT22 Data | GPIO 4 | Temperature & Humidity |
| Servo Signal | GPIO 13 | Egg Turner |
| Fan Relay | GPIO 26 | Fan control |
| Motor Relay | GPIO 27 | Motor control |
| Status LED | GPIO 2 | Built-in LED |

## Software Setup

### 1. Install Arduino IDE
Download from: https://www.arduino.cc/en/software

### 2. Add ESP32 Board Support
1. Open Arduino IDE
2. Go to File > Preferences
3. Add this URL to "Additional Board Manager URLs":
   ```
   https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
   ```
4. Go to Tools > Board > Board Manager
5. Search for "ESP32" and install

### 3. Install Required Libraries
Go to Sketch > Include Library > Manage Libraries:

Search and install:
- **DHT sensor library** by Adafruit
- **ArduinoJson** by Benoit Blanchon

### 4. Configure the Code

Open one of the ESP32 sketches and edit the WiFi credentials:

```cpp
const char* ssid = "YOUR_WIFI_SSID";        // Change this
const char* password = "YOUR_WIFI_PASSWORD";  // Change this
```

### 5. Upload the Code

1. Connect ESP32 to computer via USB
2. Select your board: Tools > Board > ESP32 Dev Module
3. Select correct port: Tools > Port > COMx
4. Upload: Sketch > Upload

## Circuit Diagram

```
ESP32 DevKit
┌─────────────────────────────────────────────┐
│                                             │
│  GPIO4 ──────── DHT22 Data                 │
│  GPIO13 ──────── Servo Signal               │
│  GPIO26 ──────── Relay (Fan) ──── Fan      │
│  GPIO27 ──────── Relay (Motor) ── Motor    │
│  GPIO2 ──────── LED (Built-in)             │
│                                             │
│  5V ─────────── Servo VCC                   │
│  5V ─────────── Relay VCC                   │
│  GND ─────────── All GND                    │
└─────────────────────────────────────────────┘
```

## Web Server Endpoints

The ESP32 runs a web server with these endpoints:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Status page |
| `/api/status` | GET | JSON status data |
| `/api/ping` | GET | Connection test |
| `/api/turn` | POST | Trigger egg turn |
| `/api/fan` | POST | Set fan state `{"state": true/false}` |
| `/api/schedule` | POST | Set schedule `{"turnsPerDay": 8, "intervalHours": 3}` |
| `/api/thresholds` | POST | Set thresholds |

## Troubleshooting

### ESP32 Not Connecting to WiFi
- Check SSID and password are correct
- Make sure you're using 2.4GHz WiFi (not 5GHz)
- Check serial monitor for error messages

### Sensors Not Reading
- Check DHT22 wiring
- Make sure library is properly installed
- Try different GPIO pin

### Web Interface Not Working
- Check IP address matches in web app settings
- Make sure ESP32 and computer are on same network

## Two ESP32 Versions Provided

1. **eggwatch_esp32.ino** - Sends data to PHP/MySQL database
2. **eggwatch_esp32_webserver.ino** - Built-in web server (recommended)

For the web app to work with ESP32, use the **webserver version** and set:
- ESP32 IP: 192.168.1.100
- Update web app `js/api.js` to connect to ESP32 directly (set `demoMode: false`)
