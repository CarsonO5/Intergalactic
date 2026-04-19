import express from 'express';
import { createServer } from 'http';
import { scramjetPath } from '@mercuryworkshop/scramjet';
import { epoxyPath } from '@mercuryworkshop/epoxy-transport';
import { baremuxPath } from '@mercuryworkshop/bare-mux/node';
import { join } from 'path';
import { fileURLToPath } from 'url';
import wisp from 'wisp-server-node';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 3000;

// Serve INTERGALACTIC frontend
app.use(express.static(join(__dirname, 'public')));

// Serve Scramjet static files
app.use('/scramjet/', express.static(scramjetPath));

// Serve transport layers
app.use('/epoxy/', express.static(epoxyPath));
app.use('/baremux/', express.static(baremuxPath));

// Handle WebSocket upgrades for Wisp
server.on('upgrade', (req, socket, head) => {
  if (req.url.endsWith('/wisp/')) {
    wisp.routeRequest(req, socket, head);
  } else {
    socket.end();
  }
});

server.listen(PORT, () => {
  console.log(`INTERGALACTIC running on http://localhost:${PORT}`);
});
