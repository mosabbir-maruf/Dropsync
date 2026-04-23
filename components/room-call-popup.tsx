"use client"

import { useState, useEffect, useRef } from "react"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Card } from "@/components/ui/card"
import { Phone, PhoneOff, Video, VideoOff, Mic, MicOff, Volume2, VolumeX, Users, Crown, Minimize2, Maximize2 } from "lucide-react"
import { AVATARS } from "@/hooks/useUserProfile"

interface RoomCallPopupProps {
  type: "audio" | "video"
  isIncoming: boolean
  roomName: string
  participants: string[]
  rejectedUsers?: string[]
  leftUsers?: string[]
  onAccept: () => void
  onDecline: () => void
  onEnd: () => void
  isMuted?: boolean
  onMuteToggle?: () => void
  callAccepted?: boolean
  roomId: string
  currentUser: string
  onStartCall?: () => void
  showParticipantsOnly?: boolean
  callStarted?: boolean
  onJoin?: () => void
  canJoin?: boolean
  // Video-specific props
  localVideoStream?: MediaStream | null
  remoteVideoStreams?: Record<string, MediaStream>
  isVideoEnabled?: boolean
  onVideoToggle?: () => void
}

// Audio file paths
const RINGTONE_URL = "/call-audio/ringtone.mp3";
const RINGBACK_URL = "/call-audio/ringback.mp3";
const CALL_CONNECTED_URL = "/call-audio/call-connected.mp3";
const CALL_ENDED_URL = "/call-audio/call-ended.mp3";

export function RoomCallPopup({ 
  type, 
  isIncoming, 
  roomName, 
  participants, 
  rejectedUsers = [],
  leftUsers = [],
  onAccept, 
  onDecline, 
  onEnd, 
  isMuted = false, 
  onMuteToggle, 
  callAccepted = false, 
  roomId,
  currentUser,
  onStartCall,
  showParticipantsOnly = false,
  callStarted = false,
  onJoin,
  canJoin = false,
  // Video props
  localVideoStream,
  remoteVideoStreams = {},
  isVideoEnabled = true,
  onVideoToggle
}: RoomCallPopupProps) {
  const [callDuration, setCallDuration] = useState(0)
  const [isVideoOff, setIsVideoOff] = useState(!isVideoEnabled)
  const [isSpeakerOn, setIsSpeakerOn] = useState(false)
  const [isMinimized, setIsMinimized] = useState(false)
  const [speakerError, setSpeakerError] = useState<string | null>(null);
  const audioRefs = useRef<HTMLAudioElement[]>([]);

  // Sync isVideoOff with isVideoEnabled prop
  useEffect(() => {
    setIsVideoOff(!isVideoEnabled);
  }, [isVideoEnabled]);

  // Video refs
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRefs = useRef<Record<string, HTMLVideoElement>>({});

  // Audio refs
  const ringtoneRef = useRef<HTMLAudioElement>(null);
  const ringbackRef = useRef<HTMLAudioElement>(null);
  const connectedRef = useRef<HTMLAudioElement>(null);
  const endedRef = useRef<HTMLAudioElement>(null);

  // Set up local video stream
  useEffect(() => {
    if (localVideoRef.current && localVideoStream) {
      localVideoRef.current.srcObject = localVideoStream;
      localVideoRef.current.play().catch(err => console.log('Local video autoplay failed:', err));
    }
  }, [localVideoStream]);

  // Set up remote video streams
  useEffect(() => {
    Object.entries(remoteVideoStreams).forEach(([peerId, stream]) => {
      const videoElement = remoteVideoRefs.current[peerId];
      if (videoElement && stream) {
        videoElement.srcObject = stream;
        videoElement.play().catch(err => console.log('Remote video autoplay failed for', peerId, ':', err));
      }
    });
  }, [remoteVideoStreams]);

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
  // For room calls, stop ringback when call is accepted by anyone
  useEffect(() => {
    if (!isIncoming && !callAccepted && callStarted) {
      ringbackRef.current?.play().catch(() => {});
    } else {
      ringbackRef.current?.pause();
      ringbackRef.current && (ringbackRef.current.currentTime = 0);
    }
  }, [isIncoming, callAccepted, callStarted]);

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

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
  }

  const getInitials = (name: string) => {
    return name.split(" ")[0].charAt(0).toUpperCase()
  }

  const getAvatarForUser = (userId: string) => {
    // Use the same avatar logic as in chat interface
    const avatarNumber = (userId.charCodeAt(0) % 99) + 1;
    return `/avatar/avatar${avatarNumber}.png`;
  }

  const getRoomAvatar = (roomId: string) => {
    // Auto-generate room avatar using hash of roomId, similar to user avatars
    let hash = 0;
    for (let i = 0; i < roomId.length; i++) hash = roomId.charCodeAt(i) + ((hash << 5) - hash);
    const idx = Math.abs(hash) % AVATARS.length;
    return AVATARS[idx];
  }

  const getDisplayName = (userId: string) => {
    return userId;
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
    // Update local state to match the actual video enabled state
    setIsVideoOff(!isVideoEnabled);
  };

  // Create video grid layout
  const getGridLayout = (participantCount: number) => {
    if (participantCount <= 1) return "grid-cols-1";
    if (participantCount <= 4) return "grid-cols-2";
    if (participantCount <= 9) return "grid-cols-3";
    return "grid-cols-4";
  };

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
            <div className="flex items-center gap-1">
              <Users className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">{participants.length}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{roomName}</p>
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

  // For group video calls, use grid layout
  if (type === "video" && callAccepted) {
    // Google Meet-style grid: all participants (including yourself) as tiles
    const allParticipants = [currentUser, ...participants.filter(p => p !== currentUser)];
    const gridCols = getGridLayout(allParticipants.length);

    // Debug logging
    console.log('[RoomCallPopup] allParticipants:', allParticipants);
    console.log('[RoomCallPopup] remoteVideoStreams keys:', Object.keys(remoteVideoStreams));
    allParticipants.forEach(p => {
      const normP = p.toLowerCase();
      console.log('[RoomCallPopup] participant:', p, 'normalized:', normP, 'has stream:', !!remoteVideoStreams[normP]);
    });

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
          {/* Header with room info */}
          <div className="p-4 bg-black/50 backdrop-blur-sm">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full overflow-hidden">
                <img 
                  src={getRoomAvatar(roomId)} 
                  alt={roomName}
                  className="w-full h-full object-cover"
                />
              </div>
              <div>
                <h3 className="text-white font-semibold">{roomName}</h3>
                <p className="text-gray-300 text-sm">{formatDuration(callDuration)} • {allParticipants.length} participants</p>
              </div>
            </div>
          </div>

          {/* Video grid */}
          <div className="flex-1 p-4">
            <div className={`grid ${gridCols} gap-2 h-full`}>
              {allParticipants.map((participant) => {
                const normParticipant = participant.toLowerCase();
                const hasRemoteStream = !!remoteVideoStreams[normParticipant];
                if (participant !== currentUser) {
                  console.log(`[RoomCallPopup] Rendering participant: ${participant} (normalized: ${normParticipant}), hasRemoteStream:`, hasRemoteStream);
                }
                return (
                  <div key={participant} className="relative bg-gray-900 rounded-lg overflow-hidden">
                    {/* Local user video */}
                    {participant === currentUser ? (
                      localVideoStream && isVideoEnabled ? (
                        <video
                          ref={el => {
                            if (el) {
                              localVideoRef.current = el;
                              if (el.srcObject !== localVideoStream) {
                                el.srcObject = localVideoStream;
                                el.play().catch(e => console.log('Local video play error:', e));
                              }
                            }
                          }}
                          autoPlay
                          playsInline
                          muted
                          className="w-full h-full object-cover scale-x-[-1]"
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center bg-gray-800">
                          <Avatar className="h-16 w-16 mb-2">
                            <AvatarImage src={getAvatarForUser(currentUser)} alt="You" />
                            <AvatarFallback>{getInitials(currentUser)}</AvatarFallback>
                          </Avatar>
                          <span className="text-white text-sm">You</span>
                          {!isVideoEnabled && <VideoOff className="h-4 w-4 text-gray-400 mt-1" />}
                        </div>
                      )
                    ) :
                      hasRemoteStream ? (
                        <video
                          ref={el => {
                            if (el) {
                              remoteVideoRefs.current[participant] = el;
                              if (el.srcObject !== remoteVideoStreams[normParticipant]) {
                                el.srcObject = remoteVideoStreams[normParticipant];
                                el.play().catch(e => console.log('Remote video play error:', e));
                              }
                            }
                          }}
                          autoPlay
                          playsInline
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center bg-gray-800">
                          <Avatar className="h-16 w-16 mb-2">
                            <AvatarImage src={getAvatarForUser(participant)} alt={getDisplayName(participant)} />
                            <AvatarFallback>{getInitials(getDisplayName(participant))}</AvatarFallback>
                          </Avatar>
                          <span className="text-white text-sm">{getDisplayName(participant)}</span>
                          <VideoOff className="h-4 w-4 text-gray-400 mt-1" />
                        </div>
                      )
                    }
                    <div className="absolute bottom-2 left-2 bg-black/60 backdrop-blur-sm rounded px-2 py-1">
                      <span className="text-white text-xs">{participant === currentUser ? 'You' : getDisplayName(participant)}</span>
                    </div>
                    {participant === currentUser && isMuted && (
                      <div className="absolute top-2 right-2">
                        <MicOff className="h-4 w-4 text-red-500" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Controls (bottom) */}
          <div className="p-6 bg-gradient-to-t from-black/80 to-transparent">
            <div className="flex justify-center items-center gap-4">
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Button
                  variant={isMuted ? "destructive" : "secondary"}
                  size="lg"
                  onClick={onMuteToggle}
                  className="h-14 w-14 rounded-full bg-white/20 backdrop-blur-sm border-white/20 text-white hover:bg-white/30"
                >
                  {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                </Button>
              </motion.div>
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Button
                  variant={isVideoOff ? "destructive" : "secondary"}
                  size="lg"
                  onClick={handleVideoToggle}
                  className={`h-14 w-14 rounded-full backdrop-blur-sm ${
                    isVideoOff 
                      ? "bg-red-500/70 border-red-400/50 text-white hover:bg-red-500/80" 
                      : "bg-white/20 border-white/20 text-white hover:bg-white/30"
                  }`}
                >
                  {isVideoOff ? <VideoOff className="h-5 w-5" /> : <Video className="h-5 w-5" />}
                </Button>
              </motion.div>
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Button
                  variant={isSpeakerOn ? "default" : "secondary"}
                  size="lg"
                  onClick={() => setIsSpeakerOn(!isSpeakerOn)}
                  className="h-14 w-14 rounded-full bg-white/20 backdrop-blur-sm border-white/20 text-white hover:bg-white/30"
                >
                  {isSpeakerOn ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
                </Button>
              </motion.div>
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Button
                  variant="secondary"
                  size="lg"
                  onClick={() => setIsMinimized(true)}
                  className="h-14 w-14 rounded-full bg-white/20 backdrop-blur-sm border-white/20 text-white hover:bg-white/30"
                >
                  <Minimize2 className="h-5 w-5" />
                </Button>
              </motion.div>
              <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                <Button
                  variant="destructive"
                  size="lg"
                  onClick={handleEnd}
                  className="h-14 w-14 rounded-full bg-red-600 hover:bg-red-700"
                >
                  <PhoneOff className="h-5 w-5" />
                </Button>
              </motion.div>
            </div>
          </div>
        </motion.div>
      </>
    );
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
            {/* Room Info */}
            <div className="mb-8">
              <motion.div
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY }}
                className="mb-4"
              >
                <div className="w-20 h-20 mx-auto rounded-full overflow-hidden border-2 border-primary/20">
                  <img 
                    src={getRoomAvatar(roomId)} 
                    alt={roomName}
                    className="w-full h-full object-cover"
                  />
                </div>
              </motion.div>
              <h2 className="text-xl font-semibold mb-2">{roomName}</h2>
              <p className="text-muted-foreground">
                {showParticipantsOnly ? "Room participants" : isIncoming ? "Incoming room call" : callAccepted ? "Room call active" : "Starting room call"}
              </p>
              {callAccepted && (
                <div className="mt-2">
                  <p className="text-sm text-muted-foreground">{formatDuration(callDuration)}</p>
                  <p className="text-xs text-muted-foreground">{participants.length} participants</p>
                  <p className="text-xs text-green-600">Connected</p>
                </div>
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

            {/* Participants List */}
            {(callAccepted || showParticipantsOnly || (!isIncoming && !callAccepted)) && participants.length > 0 && (
              <div className="mb-6">
                <h3 className="text-sm font-medium mb-3">Participants</h3>
                <div className="space-y-2 max-h-32 overflow-y-auto">
                  {participants.map((participant, index) => (
                    <div key={participant} className="flex items-center gap-2 justify-center">
                      <Avatar className="h-6 w-6">
                        <AvatarImage src={getAvatarForUser(participant)} alt={getDisplayName(participant)} />
                        <AvatarFallback className="text-xs">{getInitials(getDisplayName(participant))}</AvatarFallback>
                      </Avatar>
                      <span className="text-sm">{getDisplayName(participant)}</span>
                      {participant === currentUser && <span className="text-xs text-muted-foreground">(You)</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Rejected Users */}
            {rejectedUsers.length > 0 && (
              <div className="mb-4">
                <div className="space-y-1 max-h-20 overflow-y-auto">
                  {rejectedUsers.map((user) => (
                    <div key={user} className="flex items-center gap-2 justify-center">
                      <Avatar className="h-5 w-5">
                        <AvatarImage src={getAvatarForUser(user)} alt={getDisplayName(user)} />
                        <AvatarFallback className="text-xs">{getInitials(getDisplayName(user))}</AvatarFallback>
                      </Avatar>
                      <span className="text-xs text-red-600">{getDisplayName(user)} (Rejected)</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Left Users */}
            {leftUsers.length > 0 && (
              <div className="mb-4">
                <div className="space-y-1 max-h-20 overflow-y-auto">
                  {leftUsers.map((user) => (
                    <div key={user} className="flex items-center gap-2 justify-center">
                      <Avatar className="h-5 w-5">
                        <AvatarImage src={getAvatarForUser(user)} alt={getDisplayName(user)} />
                        <AvatarFallback className="text-xs">{getInitials(getDisplayName(user))}</AvatarFallback>
                      </Avatar>
                      <span className="text-xs text-orange-600">{getDisplayName(user)} (Left)</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Call Controls */}
            {(!callAccepted && !isIncoming) || showParticipantsOnly ? (
              <div className="flex justify-center gap-4">
                <Button
                  onClick={onDecline}
                  variant="outline"
                  size="lg"
                  className="h-12 px-6"
                >
                  Cancel
                </Button>
                <Button
                  onClick={onStartCall}
                  size="lg"
                  className="h-12 px-6 bg-green-600 hover:bg-green-700"
                >
                  <Phone className="h-5 w-5 mr-2" />
                  Start Call
                </Button>
              </div>
            ) : !callAccepted ? (
              <div className="flex justify-center gap-4">
                <Button
                  onClick={handleDecline}
                  variant="destructive"
                  size="lg"
                  className="h-12 w-12 rounded-full"
                >
                  <PhoneOff className="h-6 w-6" />
                </Button>
                <Button
                  onClick={handleAccept}
                  size="lg"
                  className="h-12 w-12 rounded-full bg-green-600 hover:bg-green-700"
                >
                  <Phone className="h-6 w-6" />
                </Button>
              </div>
            ) : (
              <div className="flex justify-center gap-4">
                <Button
                  onClick={onMuteToggle}
                  variant={isMuted ? "destructive" : "outline"}
                  size="lg"
                  className="h-12 w-12 rounded-full"
                >
                  {isMuted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
                </Button>
                {type === "video" && (
                  <Button
                    onClick={handleVideoToggle}
                    variant={isVideoOff ? "destructive" : "outline"}
                    size="lg"
                    className="h-12 w-12 rounded-full"
                  >
                    {isVideoOff ? <VideoOff className="h-6 w-6" /> : <Video className="h-6 w-6" />}
                  </Button>
                )}
                <Button
                  onClick={() => setIsSpeakerOn(!isSpeakerOn)}
                  variant={isSpeakerOn ? "default" : "outline"}
                  size="lg"
                  className="h-12 w-12 rounded-full"
                >
                  {isSpeakerOn ? <Volume2 className="h-6 w-6" /> : <VolumeX className="h-6 w-6" />}
                </Button>
                <Button
                  onClick={handleEnd}
                  variant="destructive"
                  size="lg"
                  className="h-12 w-12 rounded-full"
                >
                  <PhoneOff className="h-6 w-6" />
                </Button>
              </div>
            )}

            {/* Join Button for members who haven't accepted yet */}
            {callAccepted && canJoin && onJoin && (
              <div className="mt-4">
                <Button
                  onClick={onJoin}
                  size="lg"
                  className="h-12 px-6 bg-blue-600 hover:bg-blue-700"
                >
                  <Phone className="h-5 w-5 mr-2" />
                  Join Call
                </Button>
              </div>
            )}

            {/* Minimize Button */}
            {callAccepted && (
              <div className="mt-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsMinimized(true)}
                  className="text-muted-foreground"
                >
                  Minimize
                </Button>
              </div>
            )}

            {/* Error Message */}
            {speakerError && (
              <p className="text-xs text-destructive mt-2">{speakerError}</p>
            )}
          </Card>
        </motion.div>
      </motion.div>
    </>
  )
} 