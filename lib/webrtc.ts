// WebRTC and signaling utility for DropSync
// Usage: createWebRTCConnection({ roomId, userId, onMessage, onFile, onCall, ... })

import { getAudioConstraints, getVideoConstraints, getWebRTCConfig } from './audio-config';

import { getSignalingUrl } from './config';

export type WebRTCEvents = {
  onMessage?: (msg: any) => void;
  onFile?: (file: { name: string; size: number; type: string; data: ArrayBuffer; from: string; ts: number; fileId?: string; messageId?: string }) => void;
  onCall?: (type: 'audio' | 'video', from: string) => void;
  onPeerJoin?: (peerId: string, displayName?: string) => void;
  onPeerLeave?: (peerId: string, displayName?: string) => void;
  onRoomUsers?: (users: string[]) => void;
  onSignal?: (data: any) => void;
  onTyping?: (peerId: string) => void;
  onDisconnect?: (peerId: string) => void;
  onVoice?: (voice: { duration: number; data: ArrayBuffer; from: string; ts: number }) => void;
  // New events for progress
  onFileUploadProgress?: (progress: { fileId: string; name: string; size: number; sent: number; total: number; percent: number; speed: number; eta: number }) => void;
  onFileDownloadProgress?: (progress: { fileId: string; name: string; size: number; received: number; total: number; percent: number; speed: number; eta: number; from: string }) => void;
  onReaction?: (reaction: { messageId: string; emoji: string; from: string; ts: number; action: 'add' | 'remove' }) => void;
  onAudioStream?: (peerId: string, stream: MediaStream) => void; // New: for remote audio
  onLocalAudioStream?: (stream: MediaStream | null) => void; // New: for local audio
  onMuteChange?: (muted: boolean) => void; // New: for mute/unmute
  onCallEnd?: () => void; // New: for call end sync
  onCallAccepted?: (from: string) => void; // New: for call accepted sync
  onCallMissed?: (from: string) => void; // New: for missed call sync
  onCallRejected?: (from: string) => void;
  // Video-specific events
  onVideoStream?: (peerId: string, stream: MediaStream) => void; // New: for remote video
  onLocalVideoStream?: (stream: MediaStream | null) => void; // New: for local video
  onVideoToggle?: (enabled: boolean) => void; // New: for video on/off
  // Room call events
  onRoomCall?: (type: 'audio' | 'video', from: string, participants: string[], rejectedUsers?: string[], leftUsers?: string[]) => void;
  onRoomCallAccepted?: (from: string, participants: string[], rejectedUsers?: string[], leftUsers?: string[]) => void;
  onRoomCallRejected?: (from: string, participants: string[], rejectedUsers?: string[], leftUsers?: string[]) => void;
  onRoomCallEnd?: (from: string, participants: string[], rejectedUsers?: string[], leftUsers?: string[]) => void;
  onRoomCallJoin?: (from: string, participants: string[], rejectedUsers?: string[], leftUsers?: string[]) => void;
  // Toast notification event
  onToast?: (title: string, description: string, variant?: 'default' | 'destructive') => void;
};

export function createWebRTCConnection({
  roomId,
  userId,
  displayName,
  password,
  events,
}: {
  roomId: string;
  userId: string;
  displayName?: string;
  password?: string;
  events: WebRTCEvents;
}) {
  // --- WebSocket signaling ---
  let ws: WebSocket | null = null;
  // --- Peer Connection Management ---
  const peers: Record<string, RTCPeerConnection> = {};
  // peerId -> RTCDataChannel
  const dataChannels: Record<string, RTCDataChannel> = {};
  // Track pending offers to prevent race conditions
  const pendingOffers: Set<string> = new Set();
  
  // Flag to prevent renegotiation during cleanup
  let isCleaningUp = false;
  
  // Track which users were part of the current call
  const currentCallParticipants: Set<string> = new Set();
  
  // Track connection generations to avoid processing stale signaling
  const peerGenerations: Record<string, number> = {};

  function connect() {
    ws = new window.WebSocket(getSignalingUrl());
    ws.onopen = () => {
      // Include password if provided
      const joinMsg: any = { type: 'join', roomId, userId, displayName };
      if (password) joinMsg.password = password;
      ws?.send(JSON.stringify(joinMsg));
    };
    ws.onmessage = async (event) => {
      const data = JSON.parse(event.data);
      if (data.signal && data.signal.candidate) {
      }
      switch (data.type) {
        case 'room-users':
          events.onRoomUsers?.(data.users);
          // Initiate connection to all users
          for (const peerId of data.users) {
            if (peerId !== userId && !peers[peerId]) {
              // Only the user with the smaller userId acts as initiator
              const isInitiator = userId < peerId;
              await createPeer(peerId, isInitiator, 'direct');
            }
          }
          break;
        case 'user-joined':
          events.onPeerJoin?.(data.userId, data.displayName);
          if (data.userId !== userId && !peers[data.userId]) {
            // Only the user with the smaller userId acts as initiator
            const isInitiator = userId < data.userId;
            await createPeer(data.userId, isInitiator, 'direct');
          }
          break;
        case 'user-left':
          events.onPeerLeave?.(data.userId, data.displayName);
          closePeer(data.userId);
          break;
        case 'signal':
          await handleSignal(data.from, data.signal, data.generation);
          break;
        case 'call':
          events.onCall?.(data.callType, data.from);
          break;
        case 'call-accepted':
          events.onCallAccepted?.(data.from);
          break;
        case 'call-missed':
          events.onCallMissed?.(data.from);
          break;
        case 'call-rejected':
          events.onCallRejected?.(data.from);
          break;
        case 'room-call':
          events.onRoomCall?.(data.callType, data.from, data.participants || [], data.rejectedUsers || [], data.leftUsers || []);
          break;
        case 'room-call-accepted':
          events.onRoomCallAccepted?.(data.from, data.participants || [], data.rejectedUsers || [], data.leftUsers || []);
          break;
        case 'room-call-rejected':
          events.onRoomCallRejected?.(data.from, data.participants || [], data.rejectedUsers || [], data.leftUsers || []);
          break;
        case 'room-call-end':
          events.onRoomCallEnd?.(data.from, data.participants || [], data.rejectedUsers || [], data.leftUsers || []);
          break;
        case 'room-call-join':
          events.onRoomCallJoin?.(data.from, data.participants || [], data.rejectedUsers || [], data.leftUsers || []);
          break;
        default:
          break;
      }
    };
    ws.onclose = () => {
      // Optionally: try to reconnect
    };
  }

  // --- Audio Call State ---
  let localAudioStream: MediaStream | null = null;
  let isMuted = false;
  const remoteAudioStreams: Record<string, MediaStream> = {};

  // --- Video Call State ---
  let localVideoStream: MediaStream | null = null;
  let isVideoEnabled = true;
  const remoteVideoStreams: Record<string, MediaStream> = {};

  // --- Audio Call Logic ---
  async function startAudioCall(callType: 'direct' | 'room' = 'direct') {
    if (!localAudioStream) {
      try {
        // Check if mediaDevices is available
        if (!navigator.mediaDevices) {
          events.onToast?.('Microphone Not Supported', 'Please use a modern browser with microphone support.', 'destructive');
          return;
        }

        const audioConstraints = getAudioConstraints(callType);
        localAudioStream = await navigator.mediaDevices.getUserMedia(audioConstraints);
        events.onLocalAudioStream?.(localAudioStream);
      } catch (err: any) {
        let errorTitle = 'Microphone Access Error';
        let errorDescription = 'Microphone access denied or not available.';
        
        if (err.name === 'NotAllowedError') {
          errorDescription = 'Please allow microphone access in your browser settings.';
        } else if (err.name === 'NotFoundError') {
          errorDescription = 'No microphone found. Please connect a microphone and try again.';
        } else if (err.name === 'NotSupportedError') {
          errorDescription = 'Microphone not supported in this browser. Please use a modern browser.';
        } else if (err.name === 'SecurityError') {
          errorDescription = 'Microphone access blocked due to security restrictions. Please use HTTPS.';
        }
        
        events.onToast?.(errorTitle, errorDescription, 'destructive');
        return;
      }
    }
    // Attach local audio to all peer connections
    for (const peerId of Object.keys(peers)) {
      const pc = peers[peerId];
      if (pc && localAudioStream) {
        // Track this user as part of the call
        currentCallParticipants.add(peerId);
        
        // Only add if not already added
        const senders = pc.getSenders();
        const hasAudio = senders.some(s => s.track && s.track.kind === 'audio');
        if (!hasAudio) {
          for (const track of localAudioStream.getAudioTracks()) {
            pc.addTrack(track, localAudioStream);
          }
        }
      }
    }
    // Only the initiator should renegotiate (createOffer)
    // Add small delay to ensure connection is stable
    setTimeout(() => {
    for (const peerId of Object.keys(peers)) {
      const isInitiator = userId < peerId;
      if (isInitiator) {
        renegotiate(peerId);
      }
    }
    }, 100);
  }

  // New function to start audio call only with specific participants
  async function startAudioCallWithParticipants(participants: string[], callType: 'direct' | 'room' = 'room') {
    if (!localAudioStream) {
      try {
        // Check if mediaDevices is available
        if (!navigator.mediaDevices) {
          events.onToast?.('Microphone Not Supported', 'Please use a modern browser with microphone support.', 'destructive');
          return;
        }

        const audioConstraints = getAudioConstraints(callType);
        localAudioStream = await navigator.mediaDevices.getUserMedia(audioConstraints);
        events.onLocalAudioStream?.(localAudioStream);
      } catch (err: any) {
        let errorTitle = 'Microphone Access Error';
        let errorDescription = 'Microphone access denied or not available.';
        
        if (err.name === 'NotAllowedError') {
          errorDescription = 'Please allow microphone access in your browser settings.';
        } else if (err.name === 'NotFoundError') {
          errorDescription = 'No microphone found. Please connect a microphone and try again.';
        } else if (err.name === 'NotSupportedError') {
          errorDescription = 'Microphone not supported in this browser. Please use a modern browser.';
        } else if (err.name === 'SecurityError') {
          errorDescription = 'Microphone access blocked due to security restrictions. Please use HTTPS.';
        }
        
        events.onToast?.(errorTitle, errorDescription, 'destructive');
        return;
      }
    }
    
    // Only attach audio to peer connections with accepted participants
    for (const peerId of Object.keys(peers)) {
      const pc = peers[peerId];
      if (pc && localAudioStream && participants.includes(peerId)) {
        // Only add if not already added
        const senders = pc.getSenders();
        const hasAudio = senders.some(s => s.track && s.track.kind === 'audio');
        if (!hasAudio) {
          for (const track of localAudioStream.getAudioTracks()) {
            pc.addTrack(track, localAudioStream);
          }
        }
      }
    }
    
    // Only the initiator should renegotiate (createOffer) for accepted participants
    // Add small delay to ensure connection is stable
    setTimeout(() => {
    for (const peerId of Object.keys(peers)) {
      const isInitiator = userId < peerId;
      if (isInitiator && participants.includes(peerId)) {
        renegotiate(peerId);
      }
    }
    }, 100);
  }

  // New function to filter audio streams based on accepted participants
  function filterAudioStreams(participants: string[]) {
    // Only trigger onAudioStream for accepted participants
    const acceptedPeers = new Set(participants);
    
    // Override the ontrack handler to only process audio from accepted participants
    for (const peerId of Object.keys(peers)) {
      const pc = peers[peerId];
      if (pc) {
        pc.ontrack = (event) => {
          if (event.track.kind === 'audio') {
            // Only process audio from accepted participants
            if (acceptedPeers.has(peerId)) {
              if (!remoteAudioStreams[peerId]) {
                remoteAudioStreams[peerId] = new MediaStream();
              }
              remoteAudioStreams[peerId].addTrack(event.track);
              events.onAudioStream?.(peerId, remoteAudioStreams[peerId]);
            }
          }
        };
      }
    }
  }

  function stopAudioCall() {
    isCleaningUp = true;
    
    if (localAudioStream) {
      for (const track of localAudioStream.getTracks()) {
        track.stop();
      }
      localAudioStream = null;
      events.onLocalAudioStream?.(null);
    }
    
    // Remove audio tracks from all peer connections (but keep connections alive)
    for (const peerId of Object.keys(peers)) {
      const pc = peers[peerId];
      if (pc) {
        pc.getSenders().forEach(sender => {
          if (sender.track && sender.track.kind === 'audio') {
            pc.removeTrack(sender);
          }
        });
      }
    }
    
    // Clean up remote audio streams
    for (const peerId in remoteAudioStreams) {
      const stream = remoteAudioStreams[peerId];
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      delete remoteAudioStreams[peerId];
    }
    
    // Close and recreate peer connections only for call participants
    const participantsToReset = Array.from(currentCallParticipants);
    currentCallParticipants.clear();
    
    for (const peerId of participantsToReset) {
      closePeer(peerId);
      
      // Recreate the peer connection after a short delay
      setTimeout(async () => {
        try {
          const isInitiator = userId < peerId;
          await createPeer(peerId, isInitiator, 'direct');
        } catch (error) {
          console.error(`[WebRTC] Failed to recreate peer connection for ${peerId}:`, error);
        }
      }, 500);
    }
    
    isCleaningUp = false;
  }

  function muteAudio() {
    // Disable audio tracks in both audio and video streams
    if (localAudioStream) {
      localAudioStream.getAudioTracks().forEach(track => (track.enabled = false));
    }
    if (localVideoStream) {
      localVideoStream.getAudioTracks().forEach(track => (track.enabled = false));
    }
    
      isMuted = true;
      events.onMuteChange?.(true);
      
    // Don't remove tracks, just disable them - removing breaks the connection
    // The tracks are already disabled above which stops transmission
  }
  
  function unmuteAudio() {
    // Enable audio tracks in both audio and video streams
    if (localAudioStream) {
      localAudioStream.getAudioTracks().forEach(track => (track.enabled = true));
    }
    if (localVideoStream) {
      localVideoStream.getAudioTracks().forEach(track => (track.enabled = true));
    }
    
    isMuted = false;
    events.onMuteChange?.(false);
    
    // No need to re-add tracks since we don't remove them anymore
    // Just enabling the tracks is sufficient
  }
  function toggleMute() {
    if (isMuted) {
      unmuteAudio();
    } else {
      muteAudio();
    }
  }

  // --- Video Call Logic ---
  async function startVideoCall(callType: 'direct' | 'room' = 'direct') {
    // If we already have a video stream, ensure it's enabled and trigger events
    if (localVideoStream) {
      // Ensure video tracks are enabled
      localVideoStream.getVideoTracks().forEach(track => (track.enabled = true));
      isVideoEnabled = true;
      events.onVideoToggle?.(true);
      events.onLocalVideoStream?.(localVideoStream);
    } else {
      try {
        // Check if mediaDevices is available
        if (!navigator.mediaDevices) {
          events.onToast?.('Camera Not Supported', 'Please use a modern browser with camera support.', 'destructive');
          return;
        }

        const videoConstraints = getVideoConstraints(callType);
        localVideoStream = await navigator.mediaDevices.getUserMedia(videoConstraints);
        
        // Set initial video state
        isVideoEnabled = true;
        events.onVideoToggle?.(true);
        events.onLocalVideoStream?.(localVideoStream);
      } catch (err: any) {
        let errorTitle = 'Camera Access Error';
        let errorDescription = 'Camera access denied or not available.';
        
        if (err.name === 'NotAllowedError') {
          errorDescription = 'Please allow camera access in your browser settings.';
        } else if (err.name === 'NotFoundError') {
          errorDescription = 'No camera found. Please connect a camera and try again.';
        } else if (err.name === 'NotSupportedError') {
          errorDescription = 'Camera not supported in this browser. Please use a modern browser.';
        } else if (err.name === 'SecurityError') {
          errorDescription = 'Camera access blocked due to security restrictions. Please use HTTPS.';
        }
        
        events.onToast?.(errorTitle, errorDescription, 'destructive');
        return;
      }
    }
    // Attach local video to all peer connections
    for (const peerId of Object.keys(peers)) {
      const pc = peers[peerId];
      if (pc && localVideoStream) {
        // Track this user as part of the call
        currentCallParticipants.add(peerId);
        
        // Only add if not already added
        const senders = pc.getSenders();
        
        // Add video tracks if not already present
        for (const track of localVideoStream.getVideoTracks()) {
          const existingSender = senders.find(sender => sender.track === track);
          if (!existingSender) {
            pc.addTrack(track, localVideoStream);
          }
        }
        
        // Add audio tracks if not already present  
        for (const track of localVideoStream.getAudioTracks()) {
          const existingSender = senders.find(sender => sender.track === track);
          if (!existingSender) {
            pc.addTrack(track, localVideoStream);
          }
        }
      }
    }
    // Only the initiator should renegotiate (createOffer)
    // Add small delay to ensure connection is stable
    setTimeout(() => {
      for (const peerId of Object.keys(peers)) {
        const isInitiator = userId < peerId;
        if (isInitiator) {
          renegotiate(peerId);
        }
      }
    }, 100);
  }

  // New function to start video call only with specific participants
  async function startVideoCallWithParticipants(participants: string[], callType: 'direct' | 'room' = 'room') {
    // If we already have a video stream, ensure it's enabled and trigger events
    if (localVideoStream) {
      // Ensure video tracks are enabled
      localVideoStream.getVideoTracks().forEach(track => (track.enabled = true));
      isVideoEnabled = true;
      events.onVideoToggle?.(true);
      events.onLocalVideoStream?.(localVideoStream);
    } else {
      try {
        // Check if mediaDevices is available
        if (!navigator.mediaDevices) {
          events.onToast?.('Camera Not Supported', 'Please use a modern browser with camera support.', 'destructive');
          return;
        }

        const videoConstraints = getVideoConstraints(callType);
        localVideoStream = await navigator.mediaDevices.getUserMedia(videoConstraints);
        
        // Set initial video state
        isVideoEnabled = true;
        events.onVideoToggle?.(true);
        events.onLocalVideoStream?.(localVideoStream);
      } catch (err: any) {
        let errorTitle = 'Camera Access Error';
        let errorDescription = 'Camera access denied or not available.';
        
        if (err.name === 'NotAllowedError') {
          errorDescription = 'Please allow camera access in your browser settings.';
        } else if (err.name === 'NotFoundError') {
          errorDescription = 'No camera found. Please connect a camera and try again.';
        } else if (err.name === 'NotSupportedError') {
          errorDescription = 'Camera not supported in this browser. Please use a modern browser.';
        } else if (err.name === 'SecurityError') {
          errorDescription = 'Camera access blocked due to security restrictions. Please use HTTPS.';
        }
        
        events.onToast?.(errorTitle, errorDescription, 'destructive');
        return;
      }
    }
    
    // Only attach video to peer connections with accepted participants
    for (const peerId of Object.keys(peers)) {
      const pc = peers[peerId];
      if (pc && localVideoStream && participants.includes(peerId)) {
        // Only add if not already added
        const senders = pc.getSenders();
        
        // Add video tracks if not already present
        for (const track of localVideoStream.getVideoTracks()) {
          const existingSender = senders.find(sender => sender.track === track);
          if (!existingSender) {
            pc.addTrack(track, localVideoStream);
          }
        }
        
        // Add audio tracks if not already present  
        for (const track of localVideoStream.getAudioTracks()) {
          const existingSender = senders.find(sender => sender.track === track);
          if (!existingSender) {
            pc.addTrack(track, localVideoStream);
          }
        }
      }
    }
    
    // Only the initiator should renegotiate (createOffer) for accepted participants
    // Add small delay to ensure connection is stable
    setTimeout(() => {
      for (const peerId of Object.keys(peers)) {
        const isInitiator = userId < peerId;
        if (isInitiator && participants.includes(peerId)) {
          renegotiate(peerId);
        }
      }
    }, 100);
  }

  // New function to filter video streams based on accepted participants
  function filterVideoStreams(participants: string[]) {
    // Only trigger onVideoStream for accepted participants
    const acceptedPeers = new Set(participants);
    
    // Override the ontrack handler to only process video from accepted participants
    for (const peerId of Object.keys(peers)) {
      const pc = peers[peerId];
      if (pc) {
        pc.ontrack = (event) => {
          if (event.track.kind === 'video') {
            // Only process video from accepted participants
            if (acceptedPeers.has(peerId)) {
              if (!remoteVideoStreams[peerId]) {
                remoteVideoStreams[peerId] = new MediaStream();
              }
              remoteVideoStreams[peerId].addTrack(event.track);
              events.onVideoStream?.(peerId, remoteVideoStreams[peerId]);
            }
          } else if (event.track.kind === 'audio') {
            // Also handle audio as before
            if (acceptedPeers.has(peerId)) {
              if (!remoteAudioStreams[peerId]) {
                remoteAudioStreams[peerId] = new MediaStream();
              }
              remoteAudioStreams[peerId].addTrack(event.track);
              events.onAudioStream?.(peerId, remoteAudioStreams[peerId]);
            }
          }
        };
      }
    }
  }

  // Stop video call and cleanup - FIXED to release camera properly
  function stopVideoCall() {
    isCleaningUp = true;
    
    if (localVideoStream) {
      // Stop all tracks to release camera and microphone
      for (const track of localVideoStream.getTracks()) {
        track.stop();
      }
      localVideoStream = null;
      isVideoEnabled = true; // Reset for next call
      events.onLocalVideoStream?.(null);
      events.onVideoToggle?.(true); // Reset UI state
    }
    
    // Remove video tracks from all peer connections (but keep connections alive)
    for (const peerId of Object.keys(peers)) {
      const pc = peers[peerId];
      if (pc) {
        pc.getSenders().forEach(sender => {
          if (sender.track && sender.track.kind === 'video') {
            pc.removeTrack(sender);
          }
        });
      }
    }
    
    // Clean up remote video streams
    for (const peerId in remoteVideoStreams) {
      const stream = remoteVideoStreams[peerId];
      if (stream) {
        // Stop all tracks in remote streams too
        stream.getTracks().forEach(track => track.stop());
      }
      delete remoteVideoStreams[peerId];
    }
    
    // Close and recreate peer connections only for call participants
    const participantsToReset = Array.from(currentCallParticipants);
    currentCallParticipants.clear();
    
    for (const peerId of participantsToReset) {
      closePeer(peerId);
      
      // Recreate the peer connection after a short delay
      setTimeout(async () => {
        try {
          const isInitiator = userId < peerId;
          await createPeer(peerId, isInitiator, 'direct');
        } catch (error) {
          console.error(`[WebRTC] Failed to recreate peer connection for ${peerId}:`, error);
        }
      }, 500);
    }
    
    isCleaningUp = false;
  }

  // Toggle video on/off - FIXED with proper state sync
  async function toggleVideo() {
    if (!localVideoStream) return;
    
    const videoTracks = localVideoStream.getVideoTracks();
    if (videoTracks.length === 0) return;
    
    if (isVideoEnabled) {
      // Turning video OFF
      videoTracks.forEach(track => (track.enabled = false));
      isVideoEnabled = false;
    } else {
      // Turning video ON
      const hasValidTracks = videoTracks[0].readyState === 'live';
      
      if (!hasValidTracks) {
        // Create new video stream if tracks are dead
        try {
          // Determine call type based on number of peers (rough heuristic)
          const callType = Object.keys(peers).length > 1 ? 'room' : 'direct';
          const videoConstraints = getVideoConstraints(callType);
          const newVideoStream = await navigator.mediaDevices.getUserMedia(videoConstraints);
          
          // Replace the old video track with new one in peer connections
      for (const peerId of Object.keys(peers)) {
        const pc = peers[peerId];
            if (pc) {
              const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
              if (sender && newVideoStream.getVideoTracks()[0]) {
                await sender.replaceTrack(newVideoStream.getVideoTracks()[0]);
              }
            }
          }
          
          // Update local stream
          videoTracks.forEach(track => track.stop());
          localVideoStream.removeTrack(videoTracks[0]);
          localVideoStream.addTrack(newVideoStream.getVideoTracks()[0]);
          
          isVideoEnabled = true;
        } catch (err) {
          console.error('[Video Toggle] Failed to create new video stream:', err);
          events.onToast?.('Camera Error', 'Unable to restart camera. Please try again.', 'destructive');
          return;
        }
      } else {
        // Just enable existing tracks
        videoTracks.forEach(track => (track.enabled = true));
        isVideoEnabled = true;
      }
    }
    
    events.onVideoToggle?.(isVideoEnabled);
    // Trigger a stream update to refresh video elements
    events.onLocalVideoStream?.(localVideoStream);
  }

  // Enable video (unmute video)
  async function enableVideo() {
    if (!localVideoStream || isVideoEnabled) return;
    
    const videoTracks = localVideoStream.getVideoTracks();
    if (videoTracks.length === 0) return;
    
    const hasValidTracks = videoTracks[0].readyState === 'live';
    
    if (!hasValidTracks) {
      // Create new video stream if tracks are dead
      try {
        // Determine call type based on number of peers (rough heuristic)
        const callType = Object.keys(peers).length > 1 ? 'room' : 'direct';
        const videoConstraints = getVideoConstraints(callType);
        const newVideoStream = await navigator.mediaDevices.getUserMedia(videoConstraints);
       
        // Replace the old video track with new one in peer connections
      for (const peerId of Object.keys(peers)) {
          const pc = peers[peerId];
          if (pc) {
            const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
            if (sender && newVideoStream.getVideoTracks()[0]) {
              await sender.replaceTrack(newVideoStream.getVideoTracks()[0]);
            }
          }
        }
        
        // Update local stream
        videoTracks.forEach(track => track.stop());
        localVideoStream.removeTrack(videoTracks[0]);
        localVideoStream.addTrack(newVideoStream.getVideoTracks()[0]);
      } catch (err) {
        console.error('[Enable Video] Failed to create new video stream:', err);
        return;
      }
    } else {
      videoTracks.forEach(track => (track.enabled = true));
    }
    
    isVideoEnabled = true;
    events.onVideoToggle?.(true);
    events.onLocalVideoStream?.(localVideoStream);
  }

  // Disable video (mute video)
  function disableVideo() {
    if (localVideoStream && isVideoEnabled) {
      localVideoStream.getVideoTracks().forEach(track => (track.enabled = false));
      isVideoEnabled = false;
      events.onVideoToggle?.(false);
    }
  }

  // Get video stream quality info
  function getVideoStreamInfo() {
    if (!localVideoStream) return null;
    
    const videoTrack = localVideoStream.getVideoTracks()[0];
    if (!videoTrack) return null;
    
    const settings = videoTrack.getSettings();
    return {
      width: settings.width,
      height: settings.height,
      frameRate: settings.frameRate,
      facingMode: settings.facingMode,
      deviceId: settings.deviceId,
    };
  }

  // Update video constraints (for quality adjustment)
  async function updateVideoConstraints(callType: 'direct' | 'room') {
    if (!localVideoStream) return;
    
    const videoTrack = localVideoStream.getVideoTracks()[0];
    if (!videoTrack) return;
    
    try {
      const newConstraints = getVideoConstraints(callType);
      await videoTrack.applyConstraints(newConstraints.video as MediaTrackConstraints);
    } catch (err: any) {
      events.onToast?.('Video Quality Error', 'Unable to update video quality.', 'destructive');
    }
  }

  // --- Peer Connection Enhancements ---
  async function createPeer(peerId: string, isInitiator: boolean, callType: 'direct' | 'room' = 'direct') {
    // Increment generation for this peer to avoid stale signaling
    peerGenerations[peerId] = (peerGenerations[peerId] || 0) + 1;
    const generation = peerGenerations[peerId];
    
    const webrtcConfig = getWebRTCConfig(callType);
    const pc = new RTCPeerConnection(webrtcConfig);
    peers[peerId] = pc;
    
    // Store generation on the peer connection for reference
    (pc as any).__generation = generation;
    

    // Attach local audio if in call
    if (localAudioStream) {
      for (const track of localAudioStream.getAudioTracks()) {
        pc.addTrack(track, localAudioStream);
      }
    }

    // Attach local video if in call
    if (localVideoStream) {
      for (const track of localVideoStream.getVideoTracks()) {
        console.log('[WebRTC] Adding local video track for peer:', peerId, track);
        pc.addTrack(track, localVideoStream);
      }
    }

    // Data channel for chat/files
    let dc: RTCDataChannel;
    if (isInitiator) {
      dc = pc.createDataChannel('chat');
      setupDataChannel(peerId, dc);
    } else {
      pc.ondatachannel = (event) => {
        setupDataChannel(peerId, event.channel);
      };
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        ws?.send(JSON.stringify({
          type: 'signal',
          roomId,
          userId,
          targetId: peerId,
          signal: { candidate: event.candidate },
        }));
      }
    };

    // Monitor connection state changes
    setupConnectionMonitoring(peerId, pc);

    // Monitor signaling state
    pc.ontrack = (event) => {
      console.log('[WebRTC] ontrack fired for peer:', peerId, 'track kind:', event.track.kind, event);
      if (event.track.kind === 'audio') {
        if (!remoteAudioStreams[peerId]) {
          remoteAudioStreams[peerId] = new MediaStream();
        }
        // Only add audio tracks to the audio stream
        if (event.track.kind === 'audio') {
          remoteAudioStreams[peerId].addTrack(event.track);
          events.onAudioStream?.(peerId, remoteAudioStreams[peerId]);
        }
      }
      if (event.track.kind === 'video') {
        if (!remoteVideoStreams[peerId]) {
          remoteVideoStreams[peerId] = new MediaStream();
        }
        // Only add video tracks to the video stream
        if (event.track.kind === 'video') {
          remoteVideoStreams[peerId].addTrack(event.track);
          events.onVideoStream?.(peerId, remoteVideoStreams[peerId]);
        }
      }
    };

    if (isInitiator) {
      try {
        // Track the initial offer
        pendingOffers.add(peerId);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        ws?.send(JSON.stringify({
          type: 'signal',
          roomId,
          userId,
          targetId: peerId,
          signal: { sdp: pc.localDescription },
          generation, // Include generation to prevent stale signaling
        }));
        // Remove from pending after a delay to allow for processing
        setTimeout(() => {
          pendingOffers.delete(peerId);
        }, 5000);
      } catch (error) {
        console.error(`[WebRTC] Error creating initial offer for peer ${peerId}:`, error);
        pendingOffers.delete(peerId);
        // Clean up the failed peer connection
        delete peers[peerId];
        if (dataChannels[peerId]) {
          delete dataChannels[peerId];
        }
      }
    }
    // else: wait for offer
  }

  async function handleSignal(peerId: string, signal: any, messageGeneration?: number) {
    let pc = peers[peerId];
    // If the peer connection has been closed (user left), ignore any further signals
    if (!pc) {
      // Do not recreate peer if user has left
      return;
    }
    
    // Check if this is a stale message from an old connection
    const currentGeneration = (pc as any).__generation || 0;
    if (messageGeneration && messageGeneration < currentGeneration) {
      return;
    }
    
    if (signal.sdp) {
      try {
        
        if (signal.sdp.type === 'offer') {
          // Handle offer - we need to be in 'stable' state to accept an offer
          if (pc.signalingState === 'stable') {
            await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            ws?.send(JSON.stringify({
              type: 'signal',
              roomId,
              userId,
              targetId: peerId,
              signal: { sdp: pc.localDescription },
              generation: currentGeneration,
            }));
          } else if (pc.signalingState === 'have-local-offer') {
            // We have a local offer pending, need to rollback first
            try {
              await pc.setLocalDescription({ type: 'rollback' });
              await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              ws?.send(JSON.stringify({
                type: 'signal',
                roomId,
                userId,
                targetId: peerId,
                signal: { sdp: pc.localDescription },
                generation: currentGeneration,
              }));
            } catch (rollbackError) {
              console.error(`[WebRTC] Failed to rollback and handle offer for peer ${peerId}:`, rollbackError);
            }
          } else {
            console.warn(`[WebRTC] Skipping setRemoteDescription(offer) for peer ${peerId} due to signalingState=${pc.signalingState}`);
          }
        } else if (signal.sdp.type === 'answer') {
          // Handle answer - we need to be in 'have-local-offer' state
          if (pc.signalingState === 'have-local-offer') {
            await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
            // Clear pending offer since we received an answer
            pendingOffers.delete(peerId);
          } else {
            console.warn(`[WebRTC] Skipping setRemoteDescription(answer) for peer ${peerId} due to signalingState=${pc.signalingState}`);
          }
        } else if (signal.sdp.type === 'rollback') {
          // Handle rollback
          if (pc.signalingState !== 'stable') {
            await pc.setLocalDescription({ type: 'rollback' });
            // Clear pending offer on rollback
            pendingOffers.delete(peerId);
          }
        }
      } catch (error) {
        console.error(`[WebRTC] Error handling SDP signal for peer ${peerId}:`, error);
        // If we get an error, try to reset the connection
        if (pc.signalingState !== 'stable') {
          try {
            await pc.setLocalDescription({ type: 'rollback' });
          } catch (rollbackError) {
            console.error(`[WebRTC] Failed to rollback for peer ${peerId}:`, rollbackError);
          }
        }
      }
    }
    
    if (signal.candidate) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
      } catch (e) {
        console.warn(`[WebRTC] Failed to add ICE candidate for peer ${peerId}:`, e);
      }
    }
  }

  // --- Renegotiation Helper ---
  async function renegotiate(peerId: string) {
    // Skip renegotiation during cleanup
    if (isCleaningUp) {
      return;
    }
    const pc = peers[peerId];
    if (!pc) return; // Peer has been closed, do not renegotiate
    
    // Check if connection is closed or failed
    if (pc.connectionState === 'closed' || pc.connectionState === 'failed') {
      return;
    }
    
    // Prevent multiple simultaneous offers
    if (pendingOffers.has(peerId)) {
      return;
    }
    
    try {
      
      // Check the current signaling state
      switch (pc.signalingState) {
        case 'stable':
          // Safe to create an offer
        pendingOffers.add(peerId);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        ws?.send(JSON.stringify({
          type: 'signal',
          roomId,
          userId,
          targetId: peerId,
          signal: { sdp: pc.localDescription },
          generation: (pc as any).__generation || 0,
        }));
        // Remove from pending after a delay to allow for processing
        setTimeout(() => {
          pendingOffers.delete(peerId);
        }, 5000);
          break;
          
        case 'have-remote-offer':
          // We have a remote offer, so we should create an answer instead
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          ws?.send(JSON.stringify({
            type: 'signal',
            roomId,
            userId,
            targetId: peerId,
            signal: { sdp: pc.localDescription },
            generation: (pc as any).__generation || 0,
          }));
          break;
          
        case 'have-local-offer':
          // We already have a local offer pending, wait for answer
          break;
          
        default:
          console.warn(`[WebRTC] Cannot renegotiate with peer ${peerId} in state: ${pc.signalingState}`);
          break;
      }
    } catch (error) {
      console.error(`[WebRTC] Error during renegotiation for peer ${peerId}:`, error);
      pendingOffers.delete(peerId);
      // Try to rollback if we're in an unstable state
      if (pc.signalingState !== 'stable') {
        try {
          await pc.setLocalDescription({ type: 'rollback' });
        } catch (rollbackError) {
          console.error(`[WebRTC] Failed to rollback during renegotiation for peer ${peerId}:`, rollbackError);
        }
      }
    }
  }

  // --- Call Message Handling ---
  function handleCallMessage(type: 'audio' | 'video', from: string) {
    events.onCall?.(type, from);
  }

  // --- Data Channel Message Handling ---
  function setupDataChannel(peerId: string, dc: RTCDataChannel) {
    dataChannels[peerId] = dc;
    dc.onopen = () => {
    };
    dc.onclose = () => {
      delete dataChannels[peerId];
      // Optionally: notify the user or try to reconnect
      // alert('Connection lost with peer: ' + peerId);
    };
    dc.onerror = (e) => {
      // Check for user-initiated abort/close
      const isUserClose = e && e.error && e.error.name === 'OperationError' && (
        (e.error.message && e.error.message.toLowerCase().includes('close')) ||
        e.error.toString().toLowerCase().includes('close')
      );
      if (isUserClose) {
      } else {
        console.error(`[DataChannel] Error for peer ${peerId}:`, e);
      }
      delete dataChannels[peerId];
      // Optionally: notify the user or try to reconnect
    };
    dc.onmessage = (event) => {
      // Simple protocol: {type, ...}
      let data;
      try {
        data = JSON.parse(event.data);
      } catch (e) {
        return;
      }
      if (data.type === 'chat') {
        events.onMessage?.({ ...data, from: peerId });
      } else if (data.type === 'file-chunk') {
        // Chunked file receive logic
        const { fileId, name, size, fileType, totalChunks, chunkIndex, chunk, from, ts } = data;
        if (!incomingFiles[fileId]) {
          incomingFiles[fileId] = { chunks: [], received: 0, size, name, type: fileType, totalChunks, from, ts, startTime: Date.now(), lastTime: Date.now(), lastReceived: 0 };
        }
        incomingFiles[fileId].chunks[chunkIndex] = new Uint8Array(chunk);
        incomingFiles[fileId].received++;
        // Download progress
        const fileState = incomingFiles[fileId];
        const receivedBytes = fileState.chunks.reduce((acc, arr) => acc + (arr ? arr.length : 0), 0);
        const now = Date.now();
        const elapsed = (now - fileState.startTime) / 1000;
        const interval = (now - fileState.lastTime) / 1000;
        const speed = interval > 0 ? (receivedBytes - fileState.lastReceived) / interval : 0;
        const percent = Math.min(100, (receivedBytes / size) * 100);
        const eta = speed > 0 ? (size - receivedBytes) / speed : 0;
        if (events.onFileDownloadProgress) {
          events.onFileDownloadProgress({
            fileId,
            name,
            size,
            received: receivedBytes,
            total: size,
            percent,
            speed,
            eta,
            from: fileState.from,
          });
        }
        fileState.lastReceived = receivedBytes;
        fileState.lastTime = now;
        // Optionally: progress event here
        if (incomingFiles[fileId].received === totalChunks) {
          // Reassemble
          const fileData = new Uint8Array(size);
          let offset = 0;
          for (let i = 0; i < totalChunks; i++) {
            const chunk = incomingFiles[fileId].chunks[i];
            if (!chunk) {
              // Clean up and abort
              delete incomingFiles[fileId];
              return;
            }
            fileData.set(chunk, offset);
            offset += chunk.length;
          }
          events.onFile?.({
            name,
            size,
            type: fileType,
            data: fileData.buffer,
            from,
            ts,
            fileId,
            messageId: data.messageId,
          });
          delete incomingFiles[fileId];
        }
      }
      // Remove the legacy single-chunk file fallback call to onFile
      else if (data.type === 'voice-chunk') {
        const { messageId, chunkIndex, totalChunks, chunk, duration, from, ts } = data;
        if (!voiceChunkBuffers[messageId]) {
          voiceChunkBuffers[messageId] = { chunks: [], totalChunks, duration, from, ts };
        }
        voiceChunkBuffers[messageId].chunks[chunkIndex] = chunk;
        // Log progress
        const receivedChunks = voiceChunkBuffers[messageId].chunks.filter(Boolean).length;
        if (receivedChunks === totalChunks) {
          // Reassemble
          const allChunks = voiceChunkBuffers[messageId].chunks;
          const flat = allChunks.flat();
          const audioBuffer = new Uint8Array(flat).buffer;
          if (events.onVoice) {
            events.onVoice({ duration, data: audioBuffer, from, ts });
          }
          delete voiceChunkBuffers[messageId];
        }
        return;
      } else if (data.type === 'voice') {
        events.onVoice?.({ ...data, from: peerId });
      } else if (data.type === 'call') {
        handleCallMessage(data.callType, peerId);
      } else if (data.type === 'call-end') {
        events.onCallEnd?.();
      } else if (data.type === 'typing') {
        events.onTyping?.(peerId);
      } else if (data.type === 'chat-disconnect') {
        events.onDisconnect?.(peerId);
      } else if (data.type === 'file-cancel') {
        canceledFileIds.add(data.fileId);
        // Update receiver UI
        if (events.onFileDownloadProgress) {
          events.onFileDownloadProgress({
            fileId: data.fileId,
            name: '',
            size: 0,
            received: 0,
            total: 0,
            percent: 0,
            speed: 0,
            eta: 0,
            from: userId,
          });
        }
        // Update sender UI
        if (events.onFileUploadProgress) {
          events.onFileUploadProgress({
            fileId: data.fileId,
            name: '',
            size: 0,
            sent: 0,
            total: 0,
            percent: 0,
            speed: 0,
            eta: 0,
          });
        }
        return;
      } else if (data.type === 'file-retry') {
        canceledFileIds.delete(data.fileId);
        
        // Clean up any partial download state for this fileId
        if (incomingFiles[data.fileId]) {
          delete incomingFiles[data.fileId];
        }
        
        // Notify the UI layer about the retry - this helps reset the receiver's message state
        if (events.onFileDownloadProgress) {
          // Send a special progress signal to indicate retry
          events.onFileDownloadProgress({
            fileId: data.fileId,
            name: 'RETRY_SIGNAL',
            size: 0,
            received: 0,
            total: 0,
            percent: 0,
            speed: 0,
            eta: 0,
            from: peerId,
          });
        }
      } else if (data.type === 'reaction') {
        events.onReaction?.({ ...data, from: peerId });
      }
    };
  }

  function sendChatMessage(msg: string, id: string) {
    for (const [peerId, dc] of Object.entries(dataChannels)) {
      if (dc.readyState === 'open') {
        try {
          dc.send(JSON.stringify({ type: 'chat', msg, from: userId, ts: Date.now(), id }));
        } catch (err) {
          delete dataChannels[peerId];
        }
      }
    }
  }

  // Add chunked file transfer logic
  const CHUNK_SIZE = 64 * 1024; // 64KB per chunk (most compatible)
  const incomingFiles = {} as Record<string, {chunks: Uint8Array[], received: number, size: number, name: string, type: string, totalChunks: number, from: string, ts: number, startTime: number, lastTime: number, lastReceived: number}>;
  // Add a map to track canceled fileIds
  const canceledFileIds = new Set<string>();

  function sendFile(file: File, fileIdOverride?: string, messageId?: string) {
    const fileId = fileIdOverride || `${file.name}-${file.size}-${Date.now()}-${Math.random()}`;
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    let offset = 0;
    let chunkIndex = 0;
    const reader = new FileReader();
    // Progress tracking
    let sentBytes = 0;
    let lastSentBytes = 0;
    let lastTime = Date.now();
    let startTime = lastTime;

    // Helper to send with backpressure
    function sendChunkWithBackpressure(dc: RTCDataChannel, chunkData: any, callback: () => void) {
      const MAX_BUFFERED_AMOUNT = 512 * 1024; // 512KB (most compatible)
      function trySend() {
        if (dc.bufferedAmount < MAX_BUFFERED_AMOUNT) {
          dc.send(JSON.stringify(chunkData));
          callback();
        } else {
          setTimeout(trySend, 20); // 20ms retry interval
        }
      }
      trySend();
    }

    function sendNextChunk() {
      if (canceledFileIds.has(fileId)) return;
      const slice = file.slice(offset, offset + CHUNK_SIZE);
      reader.onload = () => {
        // ADD THIS CHECK: If canceled after reading chunk, do not send
        if (canceledFileIds.has(fileId)) return;
        const chunk = new Uint8Array(reader.result as ArrayBuffer);
        const dcs = Object.values(dataChannels).filter(dc => dc.readyState === 'open');
        let sentCount = 0;
        function onSent() {
          sentCount++;
          if (sentCount === dcs.length) {
            offset += CHUNK_SIZE;
            chunkIndex++;
            sentBytes += chunk.length;
            // Progress calculation
            const now = Date.now();
            const elapsed = (now - startTime) / 1000;
            const interval = (now - lastTime) / 1000;
            const speed = interval > 0 ? (sentBytes - lastSentBytes) / interval : 0;
            const percent = Math.min(100, (sentBytes / file.size) * 100);
            const eta = speed > 0 ? (file.size - sentBytes) / speed : 0;
            if (events.onFileUploadProgress) {
              events.onFileUploadProgress({
                fileId,
                name: file.name,
                size: file.size,
                sent: sentBytes,
                total: file.size,
                percent,
                speed,
                eta,
              });
            }
            lastSentBytes = sentBytes;
            lastTime = now;
            if (offset < file.size) {
              sendNextChunk();
            }
          }
        }
        if (dcs.length === 0) return;
        for (const dc of dcs) {
          sendChunkWithBackpressure(dc, {
            type: 'file-chunk',
            fileId, // Always include fileId
            name: file.name,
            size: file.size,
            fileType: file.type,
            totalChunks,
            chunkIndex,
            chunk: Array.from(chunk),
            from: userId,
            ts: Date.now(),
            messageId,
          }, onSent);
        }
      };
      reader.readAsArrayBuffer(slice);
    }
    sendNextChunk();
  }

  function sendCall(type: 'audio' | 'video') {
    // Send call event over WebSocket to all peers (except self)
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    for (const peerId of Object.keys(peers)) {
      if (peerId !== userId) {
        ws.send(JSON.stringify({
          type: 'call',
          callType: type,
          from: userId,
          roomId,
          userId,
          targetId: peerId,
        }));
      }
    }
  }

  function sendTyping() {
    for (const dc of Object.values(dataChannels)) {
      if (dc.readyState === 'open') {
        dc.send(JSON.stringify({ type: 'typing', from: userId, ts: Date.now() }));
      }
    }
  }
  function sendDisconnect() {
    for (const dc of Object.values(dataChannels)) {
      if (dc.readyState === 'open') {
        dc.send(JSON.stringify({ type: 'chat-disconnect', from: userId, ts: Date.now() }));
      }
    }
  }

  function sendCallEnd() {
    for (const dc of Object.values(dataChannels)) {
      if (dc.readyState === 'open') {
        dc.send(JSON.stringify({ type: 'call-end', from: userId, ts: Date.now() }));
      }
    }
  }

  function sendCallAccepted(targetId: string) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({
      type: 'call-accepted',
      from: userId, // always set local userId
      roomId,
      targetId,
    }));
  }

  function sendCallMissed(targetId: string) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({
      type: 'call-missed',
      from: userId,
      roomId,
      targetId,
    }));
  }

  function sendCallRejected(targetId: string) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({
      type: 'call-rejected',
      from: userId,
      roomId,
      targetId,
    }));
  }

  // Room call functions
  function sendRoomCall(type: 'audio' | 'video') {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({
      type: 'room-call',
      roomId,
      userId,
      callType: type,
    }));
  }

  function sendRoomCallAccepted() {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({
      type: 'room-call-accepted',
      roomId,
      userId,
    }));
  }

  function sendRoomCallRejected() {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({
      type: 'room-call-rejected',
      roomId,
      userId,
    }));
  }

  function sendRoomCallEnd() {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({
      type: 'room-call-end',
      roomId,
      userId,
    }));
  }

  function sendRoomCallJoin() {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({
      type: 'room-call-join',
      roomId,
      userId,
    }));
  }

  // --- Voice Note Chunking ---
  const VOICE_CHUNK_SIZE = 16 * 1024; // 16KB
  const voiceChunkBuffers: Record<string, {chunks: any[], totalChunks: number, duration: number, from: string, ts: number}> = {};

  function sendVoice(audioBuffer: ArrayBuffer, duration: number, messageId?: string) {
    if (audioBuffer.byteLength > 1048576) {
      events.onToast?.('Voice Note Too Large', 'Voice note is too large to send. Please record a shorter message.', 'destructive');
      return;
    }
    const totalChunks = Math.ceil(audioBuffer.byteLength / VOICE_CHUNK_SIZE);
    for (const [peerId, dc] of Object.entries(dataChannels)) {
      if (dc.readyState === 'open') {
        for (let i = 0; i < totalChunks; i++) {
          const chunk = audioBuffer.slice(i * VOICE_CHUNK_SIZE, (i + 1) * VOICE_CHUNK_SIZE);
          try {
            dc.send(JSON.stringify({
              type: 'voice-chunk',
              chunk: Array.from(new Uint8Array(chunk)),
              chunkIndex: i,
              totalChunks,
              duration,
              from: userId,
              ts: Date.now(),
              messageId,
            }));
          } catch (err) {
            console.error(`[sendVoice] Error sending chunk ${i+1} to ${peerId}:`, err);
            delete dataChannels[peerId];
            break;
          }
        }
      } else {
        console.warn(`[sendVoice] DataChannel to ${peerId} is not open:`, dc.readyState);
      }
    }
  }

  function sendReaction(messageId: string, emoji: string, action: 'add' | 'remove') {
    for (const [peerId, dc] of Object.entries(dataChannels)) {
      if (dc.readyState === 'open') {
        try {
          dc.send(JSON.stringify({ type: 'reaction', messageId, emoji, from: userId, ts: Date.now(), action }));
        } catch (err) {
          delete dataChannels[peerId];
        }
      }
    }
  }

  function closePeer(peerId: string) {
    const pc = peers[peerId];
    if (pc) {
      try {
        // Clear any pending offers for this peer to prevent stale signaling
        pendingOffers.delete(peerId);
        
        // Close all data channels for this peer
        if (dataChannels[peerId]) {
          dataChannels[peerId].close();
          delete dataChannels[peerId];
        }
        
        // Close the peer connection
        pc.close();
        delete peers[peerId];
        
        // Clean up audio streams
        if (remoteAudioStreams[peerId]) {
          const stream = remoteAudioStreams[peerId];
          stream.getTracks().forEach(track => track.stop());
          delete remoteAudioStreams[peerId];
        }
        if (remoteVideoStreams[peerId]) {
          const stream = remoteVideoStreams[peerId];
          stream.getTracks().forEach(track => track.stop());
          delete remoteVideoStreams[peerId];
        }
        
      } catch (error) {
        console.error(`[WebRTC] Error closing peer ${peerId}:`, error);
      }
    }
  }

  function leave() {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'leave', roomId, userId }));
      ws.close();
    } else if (ws && ws.readyState === WebSocket.CONNECTING) {
      ws.onopen = () => ws?.close();
    } else {
      ws?.close();
    }
    for (const peerId of Object.keys(peers)) {
      closePeer(peerId);
    }
  }

  function cancelFileTransfer(fileId: string) {
    // Mark as canceled locally
    canceledFileIds.add(fileId);
    
    // Send cancel control message to all peers
    let sentCount = 0;
    for (const dc of Object.values(dataChannels)) {
      if (dc.readyState === 'open') {
        try {
          dc.send(JSON.stringify({ type: 'file-cancel', fileId }));
          sentCount++;
        } catch (err) {
          console.error('[WebRTC Cancel] Error sending cancel message:', err);
        }
      }
    }
  }

  function retryFileTransfer(fileId: string) {
    // Remove from canceled set
    canceledFileIds.delete(fileId);
    // Send retry control message to all peers
    for (const dc of Object.values(dataChannels)) {
      if (dc.readyState === 'open') {
        dc.send(JSON.stringify({ type: 'file-retry', fileId }));
      }
    }
  }

  // --- Connection Recovery ---
  function attemptReconnection(peerId: string) {
    closePeer(peerId);
    
    // Wait a bit before attempting to recreate the connection
    setTimeout(async () => {
      try {
        const isInitiator = userId < peerId;
        await createPeer(peerId, isInitiator, 'direct');
      } catch (error) {
        console.error(`[WebRTC] Failed to reconnect to peer ${peerId}:`, error);
      }
    }, 1000);
  }

  // --- Restart Failed Connection ---
  function restartConnection(peerId: string) {
    closePeer(peerId);
    
    // Wait a bit before attempting to recreate the connection
    setTimeout(async () => {
      try {
        const isInitiator = userId < peerId;
        await createPeer(peerId, isInitiator, 'direct');
      } catch (error) {
        console.error(`[WebRTC] Failed to restart connection for peer ${peerId}:`, error);
      }
    }, 2000);
  }

  // --- Connection State Monitoring ---
  function setupConnectionMonitoring(peerId: string, pc: RTCPeerConnection) {
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') {
        restartConnection(peerId);
      } else if (pc.connectionState === 'disconnected') {
        // Don't immediately restart disconnected connections, let them try to reconnect
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed') {
        // Don't immediately restart for ICE failures, let the connection state handler deal with it
      }
    };

    pc.onsignalingstatechange = () => {
      if (pc.signalingState === 'closed') {
      }
    };
  }

  connect();

  return {
    sendChatMessage,
    sendFile,
    sendVoice,
    sendCall,
    sendTyping,
    sendDisconnect,
    leave,
    cancelFileTransfer,
    retryFileTransfer,
    sendReaction,
    startAudioCall,
    startAudioCallWithParticipants,
    filterAudioStreams,
    stopAudioCall,
    muteAudio,
    unmuteAudio,
    toggleMute,
    isMuted: () => isMuted,
    ws, // Expose the WebSocket instance
    sendCallEnd,
    sendCallAccepted,
    sendCallMissed,
    sendCallRejected,
    // Room call functions
    sendRoomCall,
    sendRoomCallAccepted,
    sendRoomCallRejected,
    sendRoomCallEnd,
    sendRoomCallJoin,
    startVideoCall,
    startVideoCallWithParticipants,
    filterVideoStreams,
    stopVideoCall,
    toggleVideo,
    isVideoEnabled: () => isVideoEnabled,
    enableVideo,
    disableVideo,
    getVideoStreamInfo,
    updateVideoConstraints,
  };
} 