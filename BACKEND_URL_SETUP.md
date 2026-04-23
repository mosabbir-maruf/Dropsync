# Backend URL Configuration for Frontend

**Developed by Mosabbir Maruf**

## After Deploying Backend to Render

Once your backend is deployed to Render, you need to update the frontend configuration with the correct backend URL.

**New Backend URL:**
- `https://dropsync-backend-server.onrender.com`
- WebSocket: `wss://dropsync-backend-server.onrender.com`
- HTTP: `https://dropsync-backend-server.onrender.com`

**New Frontend URL:**
- `https://dropsyncgo.vercel.app`

### Step 1: Get Your Render Backend URL

Your backend is deployed at:
- `https://dropsync-backend-server.onrender.com`

### Step 2: Update Frontend Configuration

You have two options to configure the backend URL:

#### Option A: Environment Variables (Recommended)

1. Create a `.env.local` file in the Frontend directory:
```bash
# Backend WebSocket URL
NEXT_PUBLIC_BACKEND_URL=wss://dropsync-backend-server.onrender.com

# Backend HTTP URL (if needed)
NEXT_PUBLIC_BACKEND_HTTP_URL=https://dropsync-backend-server.onrender.com
```

2. The URLs are already configured in the code.

#### Option B: Update Config File Directly

The backend URL is already configured in `Frontend/lib/config.ts`:

```typescript
// Production: Use Render URL
return "wss://dropsync-backend-server.onrender.com";
```

### Step 3: Test the Connection

1. Start your frontend development server:
```bash
cd Frontend
npm run dev
```

2. Open the browser and check the console for WebSocket connection status.

### Step 4: Deploy Frontend

Once the backend URL is configured, you can deploy your frontend to any platform (Vercel, Netlify, etc.).

### Backend URLs

Your backend URLs are:
- WebSocket: `wss://dropsync-backend-server.onrender.com`
- HTTP: `https://dropsync-backend-server.onrender.com`
- Health Check: `https://dropsync-backend-server.onrender.com/health`
- Ping: `https://dropsync-backend-server.onrender.com/ping`

### Troubleshooting

1. **Connection Failed**: Check that your backend URL is correct and the backend is running
2. **CORS Issues**: The backend is configured to handle CORS properly
3. **WebSocket Issues**: Ensure you're using `wss://` for HTTPS and `ws://` for HTTP

### Author
**Mosabbir Maruf**

This configuration guide is part of the DropSyncX project documentation. 