# EggWatch Pro - Database Setup Instructions

## Prerequisites
- XAMPP installed (Apache + MySQL)
- Web browser

## Step 1: Create the Database

1. Open **XAMPP Control Panel**
2. Click **Start** next to **Apache** and **MySQL**
3. Open phpMyAdmin: http://localhost/phpmyadmin/
4. Click **Import** tab
5. Click **Choose File** and select: `database/eggwatch_db.sql`
6. Scroll down and click **Import**

## Step 2: Copy Files to XAMPP

Copy the entire `eggwatch_pro` folder to XAMPP's htdocs:

```cmd
xcopy /E /I "C:\Users\glaiza cawagas\Documents\AAAGLAI BACK UP\1. GLAIZA CAWAGAS BSCPE\eggwatch_pro" "C:\xampp\htdocs\eggwatch_pro"
```

## Step 3: Configure Database Connection

Edit `api/db.php` if needed (default XAMPP settings):
```php
$db_host = 'localhost';
$db_name = 'eggwatch_db';
$db_user = 'root';
$db_pass = '';  // Default empty password
```

## Step 4: Run the Application

1. Ensure Apache and MySQL are running in XAMPP
2. Open browser: http://localhost/eggwatch_pro/

## Step 5: Use Database Mode (Optional)

To switch from demo mode to database mode:
1. Open browser DevTools (F12)
2. Run in console: `localStorage.setItem('demo_mode', 'false')`
3. Refresh the page

Or edit `js/api.js` line 13:
```javascript
demoMode: false,  // Change to false to use database
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/status` | GET | Get current sensor readings |
| `/api/logs` | GET | Get recent log entries |
| `/api/history` | GET | Get filtered history |
| `/api/chart` | GET | Get chart data |
| `/api/ping` | GET | Test connection |
| `/api/schedule` | POST | Save schedule |
| `/api/turn` | POST | Trigger manual turn |
| `/api/fan` | POST | Toggle fan |
| `/api/thresholds` | POST | Save thresholds |
| `/api/data` | POST | Insert sensor data |

## Database Tables

- **sensor_readings** - Temperature, humidity, motor, fan data
- **schedules** - Egg turning schedules
- **thresholds** - Alert thresholds
- **device_config** - ESP32 device configuration
- **alert_logs** - Alert history
