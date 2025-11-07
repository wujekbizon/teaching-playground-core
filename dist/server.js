import { createServer } from 'http';
import { RealTimeCommunicationSystem } from './systems/comms/RealTimeCommunicationSystem';
// Environment variable validation
function validateEnvironment() {
    const warnings = [];
    const errors = [];
    // Check PORT
    if (process.env.PORT) {
        const port = parseInt(process.env.PORT);
        if (isNaN(port) || port < 1 || port > 65535) {
            errors.push(`Invalid PORT: ${process.env.PORT}. Must be a number between 1 and 65535.`);
        }
    }
    else {
        warnings.push('PORT not set. Using default: 3001');
    }
    // Check NEXT_PUBLIC_WS_URL (optional but recommended)
    if (process.env.NEXT_PUBLIC_WS_URL) {
        const wsUrl = process.env.NEXT_PUBLIC_WS_URL;
        if (!wsUrl.match(/^https?:\/\/.+/)) {
            errors.push(`Invalid NEXT_PUBLIC_WS_URL format: ${wsUrl}. Must start with http:// or https://`);
        }
    }
    else {
        warnings.push('NEXT_PUBLIC_WS_URL not set. Using default: http://localhost:3000');
    }
    // Check NODE_ENV
    if (!process.env.NODE_ENV) {
        warnings.push('NODE_ENV not set. Assuming development mode.');
    }
    // Check ALLOWED_ORIGINS
    if (!process.env.ALLOWED_ORIGINS) {
        warnings.push('ALLOWED_ORIGINS not set. Allowing all origins (not recommended for production).');
    }
    // Log warnings
    if (warnings.length > 0) {
        console.warn('⚠️  Environment warnings:');
        warnings.forEach(warning => console.warn(`  - ${warning}`));
        console.warn('  Consider creating a .env file. See .env.example for reference.');
    }
    // Log errors and exit if any
    if (errors.length > 0) {
        console.error('❌ Environment configuration errors:');
        errors.forEach(error => console.error(`  - ${error}`));
        console.error('\n  Please check your .env file or environment variables.');
        console.error('  See .env.example for reference.');
        process.exit(1);
    }
    if (warnings.length === 0 && errors.length === 0) {
        console.log('✅ Environment configuration validated successfully');
    }
}
// Validate environment variables on module load
validateEnvironment();
export async function startWebSocketServer(port = 3001) {
    try {
        console.log('Starting Teaching Playground WebSocket Server...');
        const server = createServer((req, res) => {
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end('Teaching Playground WebSocket Server');
        });
        const commsSystem = new RealTimeCommunicationSystem({
            allowedOrigins: process.env.NEXT_PUBLIC_WS_URL || "http://localhost:3000"
        });
        commsSystem.initialize(server);
        server.listen(port, () => {
            console.log(`WebSocket server is running on port ${port}`);
            console.log(`HTTP endpoint: http://localhost:${port}`);
            console.log(`WebSocket endpoint: ws://localhost:${port}`);
            console.log('Waiting for connections...');
        });
        // Handle graceful shutdown
        process.on('SIGTERM', () => {
            console.log('SIGTERM received. Shutting down gracefully...');
            server.close(() => {
                console.log('Server closed');
                process.exit(0);
            });
        });
        process.on('SIGINT', () => {
            console.log('SIGINT received. Shutting down gracefully...');
            server.close(() => {
                console.log('Server closed');
                process.exit(0);
            });
        });
        return server;
    }
    catch (err) {
        console.error('Error starting WebSocket server:', err);
        process.exit(1);
    }
}
// Allow running directly with node/tsx
(async () => {
    if (import.meta.url === new URL(import.meta.url).href) {
        const port = parseInt(process.env.PORT || '3001', 10);
        await startWebSocketServer(port);
    }
})();
