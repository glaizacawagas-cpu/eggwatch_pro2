# 🥚 EggWatch Pro

A smart egg incubator monitoring and control system with a beautiful web dashboard, ESP32 firmware, and cloud-ready API.

![EggWatch Pro Dashboard](https://via.placeholder.com/800x400?text=EggWatch+Pro+Dashboard)

## Features

- 📊 **Real-time Monitoring** - Temperature and humidity tracking
- 🌡️ **Heater Control** - Automatic temperature regulation
- 🌀 **Fan Control** - Manual and automatic cooling
- 🥚 **Egg Turner** - Scheduled egg rotation
- 📈 **Charts & Logs** - Historical data visualization
- 🔔 **Alert System** - Configurable threshold alerts
- 📱 **Responsive Dashboard** - Works on desktop and mobile

## Architecture

```
┌─────────────┐      WiFi       ┌─────────────┐      HTTP       ┌─────────────┐
│   ESP32     │ ◄──────────────► │   Web App   │ ◄──────────────► │  Database   │
│ (Hardware)   │                  │ (Frontend)  │                  │ (Vercel/JSON)│
└─────────────┘                  └─────────────┘                  └─────────────┘
```

## Quick Start

### Option 1: Vercel Deployment (Recommended)

1. **Fork this repository**
2. **Deploy to Vercel:**
   - Go to [Vercel.com](https://vercel.com)
   - Import your GitHub repository
   - Deploy!

3. **Open the deployed URL**

### Option 2: Local Development (XAMPP)

1. **Copy to XAMPP htdocs:**
   ```cmd
   xcopy /E /I eggwatch_pro C:\xampp\htdocs\eggwatch_pro
   ```

2. **Start Apache in XAMPP**

3. **Visit:** http://localhost/eggwatch_pro/

## ESP32 Hardware Setup

### Components

| Component | GPIO | Notes |
|-----------|------|-------|
| AHT30 Sensor | 21 (SDA), 22 (SCL) | I2C Temperature & Humidity |
| Heater Relay | 18 | ACTIVE-LOW |
| Egg Turner Relay | 5 | ACTIVE-LOW |
| Fan Relay | 17 | ACTIVE-LOW |

### Upload Firmware

1. Open `esp32/eggwatch_final/eggwatch_final.ino` in Arduino IDE
2. Install libraries:
   - **ArduinoJson** by Benoit Blanchon
3. Edit WiFi credentials (lines 17-18)
4. Upload to ESP32

### Wiring Diagram

```
ESP32 DevKit
┌─────────────────────────────────────┐
│  GPIO 21 ──────── AHT30 SDA        │
│  GPIO 22 ──────── AHT30 SCL        │
│  GPIO 18 ──────── Heater Relay     │
│  GPIO  5 ──────── Turner Relay     │
│  GPIO 17 ──────── Fan Relay        │
└─────────────────────────────────────┘
```

## Web Dashboard

### Demo Mode

The app runs in demo mode by default, showing simulated data. To connect to real ESP32:

1. Set `demoMode: false` in `js/api.js`
2. Ensure ESP32 IP matches (default: 192.168.1.100)

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/status` | GET | Current sensor readings |
| `/api/logs` | GET | Recent log entries |
| `/api/history` | GET | Historical data |
| `/api/chart` | GET | Chart data |
| `/api/ping` | GET | Connection test |
| `/api/fan` | POST | Toggle fan |
| `/api/turn` | POST | Trigger egg turn |
| `/api/schedule` | POST | Set schedule |
| `/api/thresholds` | POST | Set thresholds |

## Project Structure

```
eggwatch_pro/
├── index.html          # Main HTML
├── css/
│   └── styles.css      # Styling
├── js/
│   ├── api.js          # API integration
│   ├── app.js          # Main application
│   ├── alerts.js       # Alert system
│   ├── charts.js       # Chart rendering
│   └── logs.js         # Log display
├── api/                # PHP/API endpoints
├── esp32/              # ESP32 firmware
│   └── eggwatch_final/
│       └── eggwatch_final.ino
├── database/           # MySQL schema
└── SETUP.md           # Setup guide
```

## Configuration

### Temperature Thresholds

- Heater ON: ≤ 36.5°C
- Heater OFF: ≥ 37.0°C
- Fan ON: ≥ 37.5°C
- Fan OFF: ≤ 37.0°C

### Egg Turner Schedule

- Default: 8 turns per day (every 3 hours)
- Configurable via web dashboard

## Tech Stack

- **Frontend:** HTML5, CSS3, Vanilla JavaScript
- **Charts:** Chart.js
- **Icons:** Font Awesome
- **Backend:** PHP (XAMPP) or Serverless (Vercel)
- **Database:** MySQL or JSON file
- **Hardware:** ESP32, AHT30, Relays

## License

MIT License - Feel free to use and modify!

## Author

Created with ❤️ for egg incubation monitoring

---

⭐ Star this repository if you found it helpful!
