"use client"

import React, { useState, useEffect, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Card } from "@/components/ui/card"
import { Phone, PhoneOff, Video, VideoOff, Mic, MicOff, Volume2, VolumeX, Minimize2, Maximize2 } from "lucide-react"

interface CallPopupProps {
  type: "audio" | "video"
  isIncoming: boolean
  contactName: string
  onAccept: () => void
  onDecline: () => void
  onEnd: () => void
  isMuted?: boolean
  onMuteToggle?: () => void
  callAccepted?: boolean
  avatarUrl?: string
  // Video-specific props
  localVideoStream?: MediaStream | null
  remoteVideoStream?: MediaStream | null
  isVideoEnabled?: boolean
  onVideoToggle?: () => void
}

const contactAvatars: { [key: string]: string } = {
  "Alex's iPhone": "/avatars/avatar-1.png",
  "Sarah's MacBook": "/avatars/avatar-2.png",
  "Mike's iPad": "/avatars/avatar-3.png",
  "Emma's Phone": "/avatars/avatar-4.png",
  "General Discussion": "/avatars/avatar-1.png",
  "Tech Talk": "/avatars/avatar-2.png",
}

// Audio file paths
const RINGTONE_URL = "/call-audio/ringtone.mp3";
const RINGBACK_URL = "/call-audio/ringback.mp3";
const CALL_CONNECTED_URL = "/call-audio/call-connected.mp3";
const CALL_ENDED_URL = "/call-audio/call-ended.mp3";

export function CallPopup({ 
  type, 
  isIncoming, 
  contactName, 
  onAccept, 
  onDecline, 
  onEnd, 
  isMuted = false, 
  onMuteToggle, 
  callAccepted = false, 
  avatarUrl,
  // Video props
  localVideoStream,
  remoteVideoStream,
  isVideoEnabled = true,
  onVideoToggle
}: CallPopupProps) {
  const [callDuration, setCallDuration] = useState(0)
  // Remove isVideoOff state and timeout logic
  // const [isVideoOff, setIsVideoOff] = useState(!isVideoEnabled)
  const [isSpeakerOn, setIsSpeakerOn] = useState(false)
  const [isMinimized, setIsMinimized] = useState(false)
  const [speakerError, setSpeakerError] = useState<string | null>(null);
  const audioRefs = useRef<HTMLAudioElement[]>([]);
  const [remoteAspectRatio, setRemoteAspectRatio] = useState<number | null>(null);
  const [connectingTimeout, setConnectingTimeout] = useState<NodeJS.Timeout | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [isRemoteCameraOff, setIsRemoteCameraOff] = useState(false);
  const remoteCanvasRef = useRef<HTMLCanvasElement>(null);

  // Sync isVideoOff with isVideoEnabled prop
  useEffect(() => {
    // State will be updated via the useEffect that syncs with isVideoEnabled prop
  }, [isVideoEnabled]);

  // Video refs
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  // Audio refs
  const ringtoneRef = useRef<HTMLAudioElement>(null);
  const ringbackRef = useRef<HTMLAudioElement>(null);
  const connectedRef = useRef<HTMLAudioElement>(null);
  const endedRef = useRef<HTMLAudioElement>(null);

  // Set up video streams
  // Commented out because we're setting srcObject in the ref callback
  /*
  useEffect(() => {
    if (localVideoRef.current && localVideoStream) {
      localVideoRef.current.srcObject = localVideoStream;
      localVideoRef.current.play().catch(err => {});
    } else {
      console.log('[CallPopup] Missing localVideoRef or localVideoStream:', { 
        hasRef: !!localVideoRef.current, 
        hasStream: !!localVideoStream 
      });
    }
  }, [localVideoStream]);
  */

  // Separate effect for video state logging
  useEffect(() => {
    // console.log('[CallPopup] Video states - isVideoEnabled:', isVideoEnabled, 'isVideoOff:', isVideoOff);
  }, [isVideoEnabled]);

  // Commented out because we're setting srcObject in the ref callback
  /*
  useEffect(() => {
    if (remoteVideoRef.current && remoteVideoStream) {
      console.log('[CallPopup] Setting remote video stream to video element:', remoteVideoStream);
      console.log('[CallPopup] Remote video tracks:', remoteVideoStream.getVideoTracks());
      console.log('[CallPopup] Remote video track enabled states:', remoteVideoStream.getVideoTracks().map(t => t.enabled));
      remoteVideoRef.current.srcObject = remoteVideoStream;
      remoteVideoRef.current.play().catch(err => console.log('Remote video autoplay failed:', err));
    } else {
      console.log('[CallPopup] Missing remoteVideoRef or remoteVideoStream:', { 
        hasRef: !!remoteVideoRef.current, 
        hasStream: !!remoteVideoStream 
      });
    }
  }, [remoteVideoStream]);
  */

  // Play ringtone for incoming call (not yet accepted)
  useEffect(() => {
    if (isIncoming && !callAccepted) {
      ringtoneRef.current?.play().catch(() => {});
    } else {
      ringtoneRef.current?.pause();
      ringtoneRef.current && (ringtoneRef.current.currentTime = 0);
    }
  }, [isIncoming, callAccepted]);

  // Play ringback for outgoing call (not yet accepted)
  useEffect(() => {
    if (!isIncoming && !callAccepted) {
      ringbackRef.current?.play().catch(() => {});
    } else {
      ringbackRef.current?.pause();
      ringbackRef.current && (ringbackRef.current.currentTime = 0);
    }
  }, [isIncoming, callAccepted]);

  // Play call connected sound when call is accepted
  useEffect(() => {
    if (callAccepted) {
      connectedRef.current?.play().catch(() => {});
    }
  }, [callAccepted]);

  // Play call ended sound when popup is closed (callAccepted was true, now false)
  const prevCallAccepted = useRef(callAccepted);
  useEffect(() => {
    if (prevCallAccepted.current && !callAccepted) {
      endedRef.current?.play().catch(() => {});
    }
    prevCallAccepted.current = callAccepted;
  }, [callAccepted]);

  // Timer: Only start after call is accepted
  useEffect(() => {
    let interval: NodeJS.Timeout | undefined;
    if (callAccepted) {
      interval = setInterval(() => {
        setCallDuration((prev) => prev + 1)
      }, 1000);
    } else {
      setCallDuration(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [callAccepted]);

  // Speaker logic: set sinkId if supported
  useEffect(() => {
    if (!callAccepted) return;
    if (audioRefs.current.length === 0) return;
    audioRefs.current.forEach(audio => {
      if (audio && typeof audio.setSinkId === "function") {
        audio.setSinkId(isSpeakerOn ? "speaker" : "default").catch(err => {
          setSpeakerError("Speaker not supported on this device/browser.");
        });
      } else if (isSpeakerOn) {
        setSpeakerError("Speaker not supported on this device/browser.");
      }
    });
  }, [isSpeakerOn, callAccepted]);

  // Start a timeout when callAccepted is true but remoteVideoStream is not set
  useEffect(() => {
    if (type === 'video' && callAccepted && !remoteVideoStream) {
      if (connectingTimeout) clearTimeout(connectingTimeout);
      const timeout = setTimeout(() => {
        setConnectionError('Connection failed. Please try again.');
      }, 5000); // 5 seconds
      setConnectingTimeout(timeout);
    } else {
      if (connectingTimeout) {
        clearTimeout(connectingTimeout);
        setConnectingTimeout(null);
      }
      setConnectionError(null);
    }
    return () => {
      if (connectingTimeout) clearTimeout(connectingTimeout);
    };
  }, [type, callAccepted, remoteVideoStream]);

  // Retry handler
  const handleRetryConnection = () => {
    setConnectionError(null);
    onEnd(); // End the current call so user can try again
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
  }

  const getInitials = (name: string) => {
    return name.split(" ")[0].charAt(0).toUpperCase()
  }

  const getContactAvatar = (name: string) => {
    return contactAvatars[name] || "/avatars/avatar-1.png"
  }

  const handleAccept = () => {
    onAccept();
  }

  // Play call ended sound and then call onEnd/onDecline
  const handleEnd = () => {
    endedRef.current?.play().catch(() => {});
    onEnd();
  };
  const handleDecline = () => {
    endedRef.current?.play().catch(() => {});
    onDecline();
  };

  const handleVideoToggle = async () => {
    if (onVideoToggle) {
      await onVideoToggle();
    }
    // State will be updated via the useEffect that syncs with isVideoEnabled prop
  };

  // Handler to update aspect ratio when video metadata is loaded
  const handleRemoteVideoLoadedMetadata = (event: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = event.currentTarget;
    if (video.videoWidth && video.videoHeight) {
      setRemoteAspectRatio(video.videoWidth / video.videoHeight);
    }
  };

  // Helper to check if remote video is active
  function isRemoteVideoActive() {
    if (!remoteVideoStream) return false;
    const tracks = remoteVideoStream.getVideoTracks();
    return tracks.length > 0 && tracks.some(track => track.enabled);
  }

  // Robust remote camera off state
  useEffect(() => {
    // If no remote stream or no tracks, camera is off
    if (!remoteVideoStream || remoteVideoStream.getVideoTracks().length === 0) {
      setIsRemoteCameraOff(true);
      return;
    }
    const track = remoteVideoStream.getVideoTracks()[0];
    // Listen for mute/unmute events
    const handleMute = () => setIsRemoteCameraOff(true);
    const handleUnmute = () => setIsRemoteCameraOff(false);
    track.addEventListener('mute', handleMute);
    track.addEventListener('unmute', handleUnmute);
    // Set initial state
    setIsRemoteCameraOff(!track.enabled);
    // If the track is enabled, ensure overlay is hidden
    if (track.enabled) setIsRemoteCameraOff(false);
    return () => {
      track.removeEventListener('mute', handleMute);
      track.removeEventListener('unmute', handleUnmute);
    };
  }, [remoteVideoStream]);

  // Black frame detection for remote video (fallback)
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    function checkBlackFrame() {
      if (remoteVideoRef.current && remoteVideoStream && remoteCanvasRef.current) {
        const video = remoteVideoRef.current;
        const canvas = remoteCanvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!video.videoWidth || !video.videoHeight) return;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
        const frame = ctx?.getImageData(0, 0, canvas.width, canvas.height);
        if (frame) {
          // Check if all pixels are black
          const isBlack = frame.data.every((value, idx) => {
            // Only check RGB, skip alpha
            if ((idx + 1) % 4 === 0) return true;
            return value === 0;
          });
          // If the video is black, treat as camera off
          if (isBlack) setIsRemoteCameraOff(true);
          else setIsRemoteCameraOff(false);
        }
      }
    }
    checkBlackFrame();
    interval = setInterval(checkBlackFrame, 500);
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [remoteVideoStream]);

  if (isMinimized) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.8 }}
        className="fixed bottom-4 right-4 z-50"
      >
        <Card className="p-3 bg-background/95 backdrop-blur-sm border-border/50">
          <div className="flex items-center gap-3">
            {type === "video" && callAccepted && remoteVideoStream ? (
              <div className="w-12 h-8 rounded overflow-hidden bg-muted">
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
              </div>
            ) : (
              <Avatar className="h-8 w-8">
                <AvatarImage src={getContactAvatar(contactName) || "/placeholder.svg"} alt={contactName} />
                <AvatarFallback className="text-xs">{getInitials(contactName)}</AvatarFallback>
              </Avatar>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{contactName}</p>
              <p className="text-xs text-muted-foreground">{formatDuration(callDuration)}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setIsMinimized(false)} className="h-8 w-8 p-0">
              <Maximize2 className="h-4 w-4" />
            </Button>
            <Button variant="destructive" size="sm" onClick={handleEnd} className="h-8 w-8 p-0">
              <PhoneOff className="h-4 w-4" />
            </Button>
          </div>
        </Card>
      </motion.div>
    )
  }

  // For video calls, use full-screen layout like Instagram/Messenger
  if (type === "video" && callAccepted) {
    return (
      <>
        {/* Audio elements for call sounds */}
        <audio ref={ringtoneRef} src={RINGTONE_URL} loop preload="auto" />
        <audio ref={ringbackRef} src={RINGBACK_URL} loop preload="auto" />
        <audio ref={connectedRef} src={CALL_CONNECTED_URL} preload="auto" />
        <audio ref={endedRef} src={CALL_ENDED_URL} preload="auto" />
        
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-black flex flex-col"
        >
          {/* Main remote video or placeholder */}
          <div className="flex-1 relative">
            {/* Always render the remote video for canvas sampling */}
            <video
              ref={(el) => {
                if (el) {
                  remoteVideoRef.current = el;
                  if (remoteVideoStream && el.srcObject !== remoteVideoStream) {
                    el.srcObject = remoteVideoStream;
                    el.play().catch(e => {});
                  }
                }
              }}
              autoPlay
              playsInline
              onLoadedMetadata={handleRemoteVideoLoadedMetadata}
              className="object-contain bg-black"
              style={{
                width: '100vw',
                height: '90vh',
                maxWidth: '100vw',
                maxHeight: '90vh',
                willChange: 'contents',
                visibility: isRemoteCameraOff ? 'hidden' : 'visible',
                position: 'absolute',
                inset: 0,
              }}
            />
            {/* Overlay placeholder if remote camera is off (robust) */}
            {isRemoteCameraOff && (
              <div className="absolute inset-0 flex items-center justify-center bg-[#232c39] rounded-xl">
                <div className="flex flex-col items-center justify-center w-full">
                  <Avatar className="h-24 w-24 mb-4">
                    <AvatarImage src={avatarUrl || "/placeholder.svg"} alt={contactName} />
                    <AvatarFallback className="text-3xl">{getInitials(contactName)}</AvatarFallback>
                  </Avatar>
                  <div className="text-lg font-semibold text-white mb-2">{contactName}</div>
                  <VideoOff className="h-7 w-7 text-gray-300 mb-1" />
                </div>
                {/* Bottom-left name badge */}
                <div className="absolute bottom-3 left-3 bg-black/70 text-white text-xs rounded px-2 py-1">{contactName}</div>
              </div>
            )}
            {/* Hidden canvas for black frame detection */}
            <canvas ref={remoteCanvasRef} style={{ display: 'none' }} />
            
            {/* Local video (small, top-right corner) */}
            <div className="absolute top-4 right-4 w-32 h-44 rounded-2xl overflow-hidden border-2 border-white/20 z-10">
              {localVideoStream && isVideoEnabled ? (
                <video
                  ref={(el) => {
                    if (el) {
                      localVideoRef.current = el;
                      if (localVideoStream && el.srcObject !== localVideoStream) {
                        el.srcObject = localVideoStream;
                        el.play().catch(e => {});
                      }
                    }
                  }}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover scale-x-[-1]"
                  style={{ willChange: 'transform' }}
                />
              ) : (
                <div className="w-full h-full bg-gray-700 flex items-center justify-center">
                  <VideoOff className="h-8 w-8 text-white/60" />
                </div>
              )}
            </div>

            {/* Call info overlay (top-left) */}
            <div className="absolute top-4 left-4 bg-black/50 backdrop-blur-sm rounded-full px-4 py-2 z-10">
              <p className="text-white text-sm font-medium">{formatDuration(callDuration)}</p>
            </div>
          </div>

          {/* Controls (bottom) */}
          <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/90 via-black/50 to-transparent z-20">
            <div className="flex justify-center items-center gap-6">
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Button
                  variant={isMuted ? "destructive" : "secondary"}
                  size="lg"
                  onClick={onMuteToggle}
                  className="h-16 w-16 rounded-full bg-white/30 backdrop-blur-md border-2 border-white/30 text-white hover:bg-white/40 shadow-lg"
                >
                  {isMuted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
                </Button>
              </motion.div>

              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Button
                  variant={!isVideoEnabled ? "destructive" : "secondary"}
                  size="lg"
                  onClick={handleVideoToggle}
                  className={`h-16 w-16 rounded-full backdrop-blur-md border-2 shadow-lg ${
                    !isVideoEnabled 
                      ? "bg-red-500/70 border-red-400/50 text-white hover:bg-red-500/80" 
                      : "bg-white/30 border-white/30 text-white hover:bg-white/40"
                  }`}
                >
                  {!isVideoEnabled ? <VideoOff className="h-6 w-6" /> : <Video className="h-6 w-6" />}
                </Button>
              </motion.div>

              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Button
                  variant="secondary"
                  size="lg"
                  onClick={() => setIsMinimized(true)}
                  className="h-16 w-16 rounded-full bg-white/30 backdrop-blur-md border-2 border-white/30 text-white hover:bg-white/40 shadow-lg"
                >
                  <Minimize2 className="h-6 w-6" />
                </Button>
              </motion.div>

              <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                <Button
                  variant="destructive"
                  size="lg"
                  onClick={handleEnd}
                  className="h-16 w-16 rounded-full bg-red-600 hover:bg-red-700 border-2 border-red-500 shadow-lg"
                >
                  <PhoneOff className="h-6 w-6" />
                </Button>
              </motion.div>
            </div>
          </div>
        </motion.div>
      </>
    )
  }

  // Original layout for audio calls and video call setup
  return (
    <>
      {/* Audio elements for call sounds */}
      <audio ref={ringtoneRef} src={RINGTONE_URL} loop preload="auto" />
      <audio ref={ringbackRef} src={RINGBACK_URL} loop preload="auto" />
      <audio ref={connectedRef} src={CALL_CONNECTED_URL} preload="auto" />
      <audio ref={endedRef} src={CALL_ENDED_URL} preload="auto" />
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="w-full max-w-md"
      >
        <Card className="p-8 text-center bg-background/95 backdrop-blur-sm border-border/50">
          {/* Contact Info */}
          <div className="mb-8">
            <motion.div
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY }}
              className="mb-4"
            >
              <Avatar className="h-24 w-24 mx-auto">
                  <AvatarImage src={avatarUrl || "/placeholder.svg"} alt={contactName} />
                <AvatarFallback className="text-2xl">{getInitials(contactName)}</AvatarFallback>
              </Avatar>
            </motion.div>
            <h2 className="text-xl font-semibold mb-2">{contactName}</h2>
            <p className="text-muted-foreground">
                {callAccepted ? formatDuration(callDuration) : (isIncoming && !callAccepted ? `Incoming ${type} call...` : `${type === "audio" ? "Audio" : "Video"} calling...`)}
            </p>
              {/* Speaker error tooltip */}
              {speakerError && (
                <div className="text-xs text-red-500 mt-1">{speakerError}</div>
              )}
          </div>

          {/* Video Preview (for video calls during setup) */}
          {type === "video" && !callAccepted && localVideoStream && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mb-6 relative"
            >
              <div className="aspect-video bg-muted rounded-lg overflow-hidden">
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover scale-x-[-1]"
                />
              </div>
            </motion.div>
          )}

          {/* Call Controls */}
          {isIncoming && !callAccepted ? (
            <div className="flex justify-center gap-6">
              <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                  <Button variant="destructive" size="lg" onClick={handleDecline} className="h-14 w-14 rounded-full p-0">
                  <PhoneOff className="h-6 w-6" />
                </Button>
              </motion.div>
              <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                <Button
                  variant="default"
                  size="lg"
                  onClick={handleAccept}
                  className="h-14 w-14 rounded-full p-0 bg-green-600 hover:bg-green-700"
                >
                  <Phone className="h-6 w-6" />
                </Button>
              </motion.div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Primary Controls */}
              <div className="flex justify-center gap-4">
                <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                  <Button
                    variant={isMuted ? "destructive" : "secondary"}
                    size="lg"
                      onClick={onMuteToggle}
                    className="h-12 w-12 rounded-full p-0"
                  >
                    {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                  </Button>
                </motion.div>

                {type === "audio" && (
                  <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                    <Button
                      variant={isSpeakerOn ? "default" : "secondary"}
                      size="lg"
                      onClick={() => setIsSpeakerOn(!isSpeakerOn)}
                      className="h-12 w-12 rounded-full p-0"
                    >
                      {isSpeakerOn ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
                    </Button>
                  </motion.div>
                )}

                {type === "video" && (
                  <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                    <Button
                      variant={!isVideoEnabled ? "destructive" : "secondary"}
                      size="lg"
                      onClick={handleVideoToggle}
                      className={`h-12 w-12 rounded-full p-0 ${
                        !isVideoEnabled 
                          ? "bg-red-500 hover:bg-red-600" 
                          : ""
                      }`}
                    >
                      {!isVideoEnabled ? <VideoOff className="h-5 w-5" /> : <Video className="h-5 w-5" />}
                    </Button>
                  </motion.div>
                )}

                <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                  <Button
                    variant="ghost"
                    size="lg"
                    onClick={() => setIsMinimized(true)}
                    className="h-12 w-12 rounded-full p-0"
                  >
                    <Minimize2 className="h-5 w-5" />
                  </Button>
                </motion.div>
              </div>

              {/* End Call */}
              <div className="flex justify-center">
                <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                    <Button variant="destructive" size="lg" onClick={handleEnd} className="h-14 w-14 rounded-full p-0">
                    <PhoneOff className="h-6 w-6" />
                  </Button>
                </motion.div>
              </div>
            </div>
          )}
        </Card>
      </motion.div>
    </motion.div>
    </>
  )
}
