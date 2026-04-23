// Media configuration for different call types (audio + video)
export interface MediaConfig {
  // Audio constraints
  audio: {
    sampleRate: number;
    channelCount: number;
    echoCancellation: boolean;
    noiseSuppression: boolean;
    autoGainControl: boolean;
    maxBitrate: number;
    codec: string;
  };
  // Video constraints
  video: {
    width: number;
    height: number;
    frameRate: number;
    maxBitrate: number;
    codec: string;
    facingMode?: string;
  };
}

// Crystal clear quality for 1:1 direct calls
export const DIRECT_CALL_MEDIA_CONFIG: MediaConfig = {
  audio: {
    sampleRate: 48000,
    channelCount: 2,
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    maxBitrate: 128000, // 128 kbps
    codec: 'opus',
  },
  video: {
    width: 1280,
    height: 720,
    frameRate: 30,
    maxBitrate: 1500000, // 1.5 Mbps for HD video
    codec: 'VP8',
    facingMode: 'user', // Front camera by default
  },
};

// Messenger/WhatsApp quality for room calls
export const ROOM_CALL_MEDIA_CONFIG: MediaConfig = {
  audio: {
    sampleRate: 44100,
    channelCount: 1,
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    maxBitrate: 64000, // 64 kbps
    codec: 'opus',
  },
  video: {
    width: 640,
    height: 480,
    frameRate: 24,
    maxBitrate: 800000, // 800 kbps for group video
    codec: 'VP8',
    facingMode: 'user',
  },
};

// Legacy support for existing audio config
export const DIRECT_CALL_AUDIO_CONFIG = DIRECT_CALL_MEDIA_CONFIG.audio;
export const ROOM_CALL_AUDIO_CONFIG = ROOM_CALL_MEDIA_CONFIG.audio;

// Get audio constraints based on call type
export function getAudioConstraints(callType: 'direct' | 'room'): MediaStreamConstraints {
  const config = callType === 'direct' ? DIRECT_CALL_MEDIA_CONFIG : ROOM_CALL_MEDIA_CONFIG;
  
  return {
    audio: {
      sampleRate: config.audio.sampleRate,
      channelCount: config.audio.channelCount,
      echoCancellation: config.audio.echoCancellation,
      noiseSuppression: config.audio.noiseSuppression,
      autoGainControl: config.audio.autoGainControl,
    },
  };
}

// Get video constraints based on call type
export function getVideoConstraints(callType: 'direct' | 'room'): MediaStreamConstraints {
  const config = callType === 'direct' ? DIRECT_CALL_MEDIA_CONFIG : ROOM_CALL_MEDIA_CONFIG;
  
  return {
    audio: {
      sampleRate: config.audio.sampleRate,
      channelCount: config.audio.channelCount,
      echoCancellation: config.audio.echoCancellation,
      noiseSuppression: config.audio.noiseSuppression,
      autoGainControl: config.audio.autoGainControl,
    },
    video: {
      width: { ideal: config.video.width },
      height: { ideal: config.video.height },
      frameRate: { ideal: config.video.frameRate },
      facingMode: { ideal: config.video.facingMode },
    },
  };
}

// Get WebRTC configuration based on call type
export function getWebRTCConfig(callType: 'direct' | 'room') {
  const config = callType === 'direct' ? DIRECT_CALL_MEDIA_CONFIG : ROOM_CALL_MEDIA_CONFIG;
  
  return {
    iceServers: [
      // STUN servers (for NAT traversal)
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
      
      // TURN servers (for relay when STUN fails)
      // Option 1: Metered.ca free TURN servers
      { 
        urls: [
          'turn:openrelay.metered.ca:80',
          'turn:openrelay.metered.ca:443',
          'turn:openrelay.metered.ca:443?transport=tcp'
        ],
        username: 'openrelayproject',
        credential: 'openrelayproject'
      },
      
      // Option 2: Twilio TURN servers (requires free account)
      // Uncomment and add your Twilio credentials if you have them
      // {
      //   urls: [
      //     'turn:global.turn.twilio.com:3478?transport=udp',
      //     'turn:global.turn.twilio.com:3478?transport=tcp',
      //     'turn:global.turn.twilio.com:443?transport=tcp'
      //   ],
      //   username: 'your_twilio_username',
      //   credential: 'your_twilio_password'
      // },
    ],
    // Audio codec preferences
    codecs: [
      { mimeType: 'audio/opus', clockRate: config.audio.sampleRate },
      { mimeType: 'video/VP8', clockRate: 90000 },
    ],
    // Bandwidth constraints
    bandwidth: {
      audio: config.audio.maxBitrate,
      video: config.video.maxBitrate,
    },
  };
}

// Media quality presets
export const MEDIA_PRESETS = {
  direct: {
    name: 'Crystal Clear',
    description: 'High quality audio & video for 1:1 calls',
    config: DIRECT_CALL_MEDIA_CONFIG,
  },
  room: {
    name: 'Messenger Quality',
    description: 'Optimized for group calls',
    config: ROOM_CALL_MEDIA_CONFIG,
  },
} as const;

// Legacy support
export const AUDIO_PRESETS = MEDIA_PRESETS; 