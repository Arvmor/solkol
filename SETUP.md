# Token Buyer Tracker Setup Guide

This application consists of a frontend React app and a backend API server. The backend handles all blockchain communication to avoid CORS issues.

## Prerequisites

- Node.js 18+
- npm or pnpm

## Installation

1. Install dependencies:

```bash
npm install
```

## Running the Application

### Step 1: Start the Backend API Server

The backend server handles all Solana blockchain communication and provides REST API endpoints.

```bash
# Development mode (with auto-restart)
npm run api:dev

# Production mode
npm run api:start
```

The backend server will start on `http://localhost:3001`

**Available API Endpoints:**

- `POST /api/track` - Start token tracking
- `GET /api/track/:sessionId` - Get tracking progress
- `DELETE /api/track/:sessionId` - Stop tracking
- `GET /api/sessions` - List active sessions
- `GET /api/health` - Health check

### Step 2: Start the Frontend Development Server

In a new terminal window, start the React frontend:

```bash
# Development mode
npm run dev
```

The frontend will start on `http://localhost:80` (or the next available port)

### Step 3: Use the Application

1. Open your browser and navigate to the frontend URL
2. The UI will automatically check if the backend is connected
3. If the backend is not running, you'll see a warning message
4. Once connected, you can:
   - Enter a token address (e.g., USDC: `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`)
   - Enter a starting block number
   - Click "Start Tracking" to begin monitoring

## Architecture

### Frontend (React + TypeScript)

- **Location**: `src/App.tsx`
- **API Service**: `src/services/apiService.js`
- **Purpose**: User interface and API communication

### Backend (Node.js + Express)

- **Location**: `src/backend/server.js`
- **Token Service**: `src/services/tokenTrackingService.js`
- **Purpose**: Blockchain communication and data processing

### Key Features

1. **CORS-Free**: All blockchain calls happen server-side
2. **Real-Time Updates**: Frontend polls backend every 2 seconds
3. **Session Management**: Multiple tracking sessions supported
4. **Error Handling**: Graceful error handling and recovery
5. **Progress Tracking**: Real-time progress updates
6. **Duplicate Detection**: Identifies duplicate buyer addresses

## Environment Variables

Create a `.env` file in the root directory:

```env
# Solana RPC Configuration
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
SLOT_POLL_INTERVAL=5000
MAX_REQUESTS_PER_SECOND=3
REQUEST_DELAY=500

# Logging
LOG_LEVEL=info
ENABLE_PERFORMANCE_LOGS=true
```

## Troubleshooting

### Backend Not Connecting

- Ensure the backend server is running on port 3001
- Check if the port is available
- Verify the API endpoints are accessible

### CORS Errors

- The backend includes CORS middleware
- Frontend is configured to connect to `localhost:3001`
- If using a different port, update `API_BASE_URL` in `src/services/apiService.js`

### Blockchain Connection Issues

- Check your internet connection
- Verify the Solana RPC endpoint is accessible
- The backend will automatically retry with different RPC endpoints

### Performance Issues

- The backend uses conservative rate limiting to avoid RPC limits
- Adjust `SLOT_POLL_INTERVAL` and `MAX_REQUESTS_PER_SECOND` in `.env`
- Monitor the backend logs for rate limiting warnings

## Development

### Adding New Features

1. Backend changes: Modify `src/backend/server.js` and related services
2. Frontend changes: Modify `src/App.tsx` and related components
3. API changes: Update both frontend `apiService.js` and backend endpoints

### Testing

- Backend: Test API endpoints with tools like Postman or curl
- Frontend: Use browser dev tools to monitor API calls
- Integration: Test the full flow from frontend to backend to blockchain

## Production Deployment

1. Build the frontend: `npm run build`
2. Start the backend: `npm run api:start`
3. Serve the frontend build files with a web server
4. Configure environment variables for production
5. Set up proper logging and monitoring

## Support

For issues or questions:

1. Check the browser console for frontend errors
2. Check the backend terminal for server logs
3. Verify both services are running and connected
4. Test the health endpoint: `http://localhost:3001/api/health`
