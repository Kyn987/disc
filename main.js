const { fork } = require('child_process');
const express = require('express'); // <-- Add express
const app = express();
const PORT = process.env.PORT || 3000;

// Start a small web server for uptime monitoring
app.get('/', (req, res) => {
  res.send('Bots are alive! 🚀');
});

app.listen(PORT, () => {
  console.log(`Uptime server running on port ${PORT}`);
});

console.log("Starting both bots...");

// Start bots with environment variables
const nuker = fork('nuker.js', {
  env: { ...process.env, PORT: 3000 }
});

const spammer = fork('spammer.js', {
  env: { ...process.env, PORT: 3001 }  // Different port for spammer
});

// Handle output
nuker.on('message', msg => console.log('[NUKER]', msg));
spammer.on('message', msg => console.log('[SPAMMER]', msg));

// Handle exits
nuker.on('exit', code => console.log(`Nuker exited with code ${code}`));
spammer.on('exit', code => console.log(`Spammer exited with code ${code}`));

process.on('exit', () => {
  nuker.kill();
  spammer.kill();
});
