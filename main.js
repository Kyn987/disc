const express = require('express');
const { fork } = require('child_process');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files (like images)
app.use(express.static('public'));

// Route for uptime monitoring (Render uptime pings)
app.get('/', (req, res) => {
  res.send('Bots are alive! 🚀');
});

// Route for sexy status page
app.get('/status', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'status.html'));
});

// Start the Express web server
app.listen(PORT, () => {
  console.log(`Uptime server and status page running on port ${PORT}`);
});

console.log("Starting both bots...");

// Start bots with environment variables
const nuker = fork('nuker.js', {
  env: { ...process.env, PORT: 3000 }
});

const spammer = fork('spammer.js', {
  env: { ...process.env, PORT: 3001 } // Different port for spammer
});

// Handle bot output
nuker.on('message', msg => console.log('[NUKER]', msg));
spammer.on('message', msg => console.log('[SPAMMER]', msg));

// Handle bot exits
nuker.on('exit', code => console.log(`Nuker exited with code ${code}`));
spammer.on('exit', code => console.log(`Spammer exited with code ${code}`));

// Graceful shutdown
process.on('exit', () => {
  nuker.kill();
  spammer.kill();
});
