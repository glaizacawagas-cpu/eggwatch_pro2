// EggWatch Pro - Main API Entry Point for Vercel
const statusHandler = require('./status.js');

module.exports = (req, res) => {
    return statusHandler(req, res);
};
