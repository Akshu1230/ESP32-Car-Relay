const WebSocket = require('ws');
const http = require('http');

// Render provides PORT via environment variable
const PORT = process.env.PORT || 8080;

// CHANGE THIS to a strong secret — must match ESP32 and controller
const SECRET_TOKEN = "bsueiduakx29173jagd45";

let carConnection = null;
let controllerConnection = null;

// HTTP server (Render needs this to verify the service is alive)
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ESP32-CAM Relay Server Running');
});

// WebSocket server
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws, req) => {
    console.log('New client connected from:', req.socket.remoteAddress);

    let clientType = null;
    let authenticated = false;

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            // --- AUTHENTICATION ---
            if (data.type === 'auth') {
                if (data.token === SECRET_TOKEN) {
                    authenticated = true;
                    clientType = data.clientType;

                    if (clientType === 'car') {
                        if (carConnection) carConnection.close();
                        carConnection = ws;
                        console.log('✅ Car (ESP32-CAM) connected');
                        ws.send(JSON.stringify({ type: 'auth_response', status: 'ok', role: 'car' }));
                    } else if (clientType === 'controller') {
                        if (controllerConnection) controllerConnection.close();
                        controllerConnection = ws;
                        console.log('✅ Controller connected');
                        ws.send(JSON.stringify({ type: 'auth_response', status: 'ok', role: 'controller' }));
                    }
                } else {
                    ws.send(JSON.stringify({ type: 'auth_response', status: 'error', message: 'Invalid token' }));
                    ws.close();
                }
                return;
            }

            // --- RELAY: Car -> Controller (video) ---
            if (clientType === 'car' && authenticated) {
                if (controllerConnection && controllerConnection.readyState === WebSocket.OPEN) {
                    controllerConnection.send(message);
                }
            }

            // --- RELAY: Controller -> Car (commands) ---
            if (clientType === 'controller' && authenticated) {
                if (carConnection && carConnection.readyState === WebSocket.OPEN) {
                    carConnection.send(message);
                }
            }

        } catch (e) {
            // Binary data (video frames) — forward raw
            if (clientType === 'car' && authenticated && controllerConnection) {
                if (controllerConnection.readyState === WebSocket.OPEN) {
                    controllerConnection.send(message);
                }
            }
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected');
        if (carConnection === ws) {
            carConnection = null;
            console.log('⚠️ Car disconnected — failsafe should stop motors');
        }
        if (controllerConnection === ws) {
            controllerConnection = null;
            console.log('⚠️ Controller disconnected');
        }
    });

    ws.on('error', (err) => {
        console.error('WebSocket error:', err.message);
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Relay server running on port ${PORT}`);
});
