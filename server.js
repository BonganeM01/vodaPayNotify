// server.js
const express = require('express');
const notifyHandler = require('./api/notify');

const app = express();
const PORT = process.env.PORT || 3000;

// Important: disable body parser so getRawBody works
app.use(express.raw({ type: 'application/json' }));

// Mount the exact same handler at /api/notify
app.post('/api/notify', notifyHandler);

app.listen(PORT, () => {
  console.log(`Webhook server running on port ${PORT}`);
});