// Configuration for DropSyncX Frontend
// Developed by Mosabbir Maruf

export const config = {
  // Backend WebSocket URL
  getBackendUrl: () => {
    // Check for environment variable first (for production)
    if (typeof window !== "undefined") {
      // Production: Use environment variable or default Render URL
      if (process.env.NEXT_PUBLIC_BACKEND_URL) {
        return process.env.NEXT_PUBLIC_BACKEND_URL;
      }
      
      // Development: Use localhost
      if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
        return "ws://localhost:8788";
      }
      
      // Production: Use Render URL (updated to new backend server)
      return "wss://dropsync-backend-server.onrender.com";
    }
    
    // SSR fallback
    return "";
  },
  
  // HTTP Backend URL (for API calls if needed)
  getHttpBackendUrl: () => {
    if (typeof window !== "undefined") {
      if (process.env.NEXT_PUBLIC_BACKEND_HTTP_URL) {
        return process.env.NEXT_PUBLIC_BACKEND_HTTP_URL;
      }
      
      if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
        return "http://localhost:8788";
      }
      
      return "https://dropsync-backend-server.onrender.com";
    }
    
    return "";
  }
};

// Frontend deployed at: https://dropsyncgo.vercel.app/

// Helper function to get WebSocket URL
export function getSignalingUrl(): string {
  return config.getBackendUrl();
} 