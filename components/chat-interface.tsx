"use client"

import React, { useState, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Card } from "@/components/ui/card"
import {
  ArrowLeft,
  Send,
  MoreVertical,
  Phone,
  Video,
  Smile,
  Paperclip,
  Mic,
  Play,
  Pause,
  Download,
  FileText,
  ImageIcon,
  Film,
  Music,
  LogOut,
  PhoneOff,
  Plus,
  Copy,
  Users,
  Crown,
  UserMinus,
  X,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { CallPopup } from "@/components/call-popup"
import { RoomCallPopup } from "@/components/room-call-popup"
import { EmojiPicker } from "@/components/emoji-picker"
import { VoiceRecorder } from "@/components/voice-recorder"
import { FileAttachment } from "@/components/file-attachment"
import { createWebRTCConnection } from "@/lib/webrtc"
import { useUserProfile, AVATARS } from "@/hooks/useUserProfile";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "../hooks/use-toast";
import { useIsMobile, useViewportHeight } from "@/hooks/use-mobile";
import { copyWithFeedback } from "@/lib/clipboard";
import { getSignalingUrl, config } from "@/lib/config";

interface MessageReaction {
  emoji: string
  users: string[]
  count: number
}

interface Message {
  id: string
  sender: string
  content: string
  timestamp: Date
  isOwn: boolean
  type?: "text" | "voice" | "file" | "image" | "system"
  duration?: number
  file?: {
    name: string
    size: number
    type: string
    url?: string
    data?: ArrayBuffer // Added for direct file data
    fileId?: string // Added for unique fileId
    status?: 'in-progress' | 'completed' | 'failed' | 'canceled';
  }
  systemType?: "user_joined" | "user_left" | "user_removed" | "user_added" | "group_created" | "group_renamed" | "missed_call" | "call_rejected"
  affectedUser?: string
  actionBy?: string
  reactions?: MessageReaction[]
  avatar?: string
}

interface ChatInterfaceProps {
  chatType: "room" | "direct"
  chatId: string
  chatName: string
  onClose: () => void
  userName: string
  peerStatus?: { isOnline: boolean; lastSeen: number }
  onPeerOffline?: (peerId: string) => void // NEW PROP
  onRoomUsers?: (users: string[]) => void;
  password?: string;
}

const quickReactions = ["❤️", "😂", "😮", "😢", "😡", "👍", "👎"]

// Avatar mapping for consistent user avatars
const userAvatars: { [key: string]: string } = {}

// Helper to get password for a room from sessionStorage (only for creator)
function getRoomPassword(roomId: string): string | null {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem('room_password_' + roomId);
}

// Helper component for audio rendering
function AudioPlayer({ stream, muted = false }: { stream: MediaStream, muted?: boolean }) {
  const audioRef = React.useRef<HTMLAudioElement>(null);
  React.useEffect(() => {
    if (audioRef.current) {
      audioRef.current.srcObject = stream;
    }
  }, [stream]);
  return <audio ref={audioRef} autoPlay playsInline muted={muted} />;
}

// Add at the top:
const BACKEND_URL = config.getHttpBackendUrl();

export function ChatInterface({ chatType, chatId, chatName, onClose, userName, peerStatus, onPeerOffline, password: propPassword }: ChatInterfaceProps) {
  const rtcRef = useRef<any>(null); // <-- Move here, inside the component
  

  const { username, avatar } = useUserProfile();
  const isMobile = useIsMobile();
  const viewportHeight = useViewportHeight();
  
  // State to hold password if user is creator
  const [roomPassword, setRoomPassword] = useState<string | null>(null);

  // Debug logging for props
  console.log('🔍 ChatInterface props:', {
    chatType,
    chatId,
    chatName,
    propPassword,
    roomPassword
  });
  
  // Helper to get a deterministic avatar for a user (by userId)
  function getAvatarForUser(id: string) {
    if (id === userName) return avatar ?? "/placeholder.svg";
    if (id.toLowerCase() === 'mosabbir maruf' || id.toLowerCase() === 'mosabbir') return '/admin.png';
    
    // Handle room avatars for hardcoded rooms
    if (chatType === 'room') {
      const roomNameLower = id.toLowerCase();
      
      if (roomNameLower === 'retro realm' || roomNameLower === 'retro-realm') {
        return '/room-avatars/retro-realm.png';
      }
      if (roomNameLower === 'sanctuary') {
        return '/room-avatars/sanctuary.png';
      }
    }
    
    // Default avatar logic for users
    let hash = 0;
    for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
    const idx = Math.abs(hash) % AVATARS.length;
    return AVATARS[idx];
  }

  // Helper to get display name for a userId
  function getDisplayName(id: string) {
    return id === userName ? "You" : id;
  }

  const [messages, setMessages] = useState<Message[]>([])

  const [newMessage, setNewMessage] = useState("")
  const [isTyping, setIsTyping] = useState(false)
  const typingTimeout = useRef<NodeJS.Timeout | null>(null)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [isSendingMessage, setIsSendingMessage] = useState(false)
  const [playingVoice, setPlayingVoice] = useState<string | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [showFileAttachment, setShowFileAttachment] = useState(false)
  const [showReactionPicker, setShowReactionPicker] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const messageInputRef = useRef<HTMLInputElement>(null)

  // Add state to track the current file accept filter
  const [fileAccept, setFileAccept] = useState<string>("*/*");

  const [activeCall, setActiveCall] = useState<{
    type: "audio" | "video"
    isIncoming: boolean
    callerId?: string
  } | null>(null)

  // Track current room users
  const [roomUsers, setRoomUsers] = useState<string[]>([]);

  // Add state for adminId and kicked
  const [adminId, setAdminId] = useState<string | null>(null);
  const [kicked, setKicked] = useState(false);

  // Add state to track who is typing in a room
  const [typingUserIds, setTypingUserIds] = useState<string[]>([]);

  // Progress state: fileId -> progress info
  const [fileProgress, setFileProgress] = useState<Record<string, {
    percent: number;
    speed: number;
    eta: number;
    sent?: number;
    received?: number;
    total: number;
    name: string;
    type: 'upload' | 'download';
    from?: string; // Added for sender
  }>>({});

  const { toast } = useToast();

  // Add state to track retrying fileId/messageId
  const [retryingFile, setRetryingFile] = useState<{fileId: string, messageId: string} | null>(null);

  // Copy handlers for dropdown menu
  const handleCopyRoomId = async () => {
    // Debug sessionStorage
    if (typeof window !== 'undefined') {
      console.log('📋 All sessionStorage keys:', Object.keys(sessionStorage));
      console.log('📋 Room password in sessionStorage:', sessionStorage.getItem('room_password_' + chatId));
    }
    if (!chatId) {
      toast({
        title: "No Room ID",
        description: "No room ID available to copy",
        variant: "destructive",
      });
      return;
    }
    try {
      const success = await copyWithFeedback(chatId, 
        () => {
          toast({
            title: "Room ID copied",
            description: "Room ID has been copied to clipboard",
          });
        },
        () => {
          toast({
            title: "Copy failed",
            description: "Failed to copy room ID to clipboard",
            variant: "destructive",
          });
        }
      );
    } catch (error) {
    }
  };

  const handleCopyPassword = async () => {
    console.log('🔄 Copying password from dropdown');
    console.log('📋 roomPassword value:', roomPassword);
    console.log('📋 roomPassword type:', typeof roomPassword);
    console.log('📋 roomPassword length:', roomPassword?.length);
    
    if (!roomPassword) {
      console.log('❌ No password to copy');
      toast({
        title: "No password",
        description: "No password available to copy",
        variant: "destructive",
      });
      return;
    }
    
    try {
      const success = await copyWithFeedback(roomPassword, 
        () => {
          console.log('✅ Password copied successfully from dropdown');
          toast({
            title: "Password copied",
            description: "Room password has been copied to clipboard",
          });
        },
        () => {
          console.log('❌ Failed to copy password from dropdown');
          toast({
            title: "Copy failed",
            description: "Failed to copy password to clipboard",
            variant: "destructive",
          });
        }
      );
      console.log('Dropdown password copy result:', success);
    } catch (error) {
      console.error('Error copying password:', error);
    }
  };

  // Effect to maintain focus on mobile after sending message
  useEffect(() => {
    if (isMobile && isSendingMessage && messageInputRef.current) {
      const timer = setTimeout(() => {
        if (messageInputRef.current) {
          messageInputRef.current.focus();
          console.log('Focusing input via useEffect');
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isSendingMessage, isMobile]);

  // Add after other useState hooks
  const [joinPassword, setJoinPassword] = useState<string | undefined>(undefined);

  // Add state to track members dialog open
  const [isMembersDialogOpen, setIsMembersDialogOpen] = useState(false);

  // --- Audio Call State ---
  const [localAudioStream, setLocalAudioStream] = useState<MediaStream | null>(null);
  const [remoteAudioStreams, setRemoteAudioStreams] = useState<Record<string, MediaStream>>({});
  
  // Video stream states
  const [localVideoStream, setLocalVideoStream] = useState<MediaStream | null>(null);
  const [remoteVideoStream, setRemoteVideoStream] = useState<MediaStream | null>(null);
  const [remoteVideoStreams, setRemoteVideoStreams] = useState<Record<string, MediaStream>>({});
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isMuted, setIsMuted] = useState(false);

  // Add state to track if call is accepted (for incoming calls)
  const [callAccepted, setCallAccepted] = useState(false);

  // --- Room Call State ---
  const [roomCallActive, setRoomCallActive] = useState(false);
  const [roomCallParticipants, setRoomCallParticipants] = useState<string[]>([]);
  const [roomCallRejectedUsers, setRoomCallRejectedUsers] = useState<string[]>([]);
  const [roomCallLeftUsers, setRoomCallLeftUsers] = useState<string[]>([]);
  const [roomCallIncoming, setRoomCallIncoming] = useState(false);
  const [roomCallAccepted, setRoomCallAccepted] = useState(false);
  const [roomCallType, setRoomCallType] = useState<'audio' | 'video'>('audio');
  const [showParticipantsOnly, setShowParticipantsOnly] = useState(false);
  const [roomCallStarted, setRoomCallStarted] = useState(false);

  // --- Missed Call Timeout ---
  const missedCallTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // On mount or when chatId changes, always check for password in sessionStorage
    if (chatType === 'room' && chatId) {
      console.log('🔍 Checking for room password');
      console.log('📋 chatId:', chatId);
      console.log('📋 chatType:', chatType);
      
      const pw = getRoomPassword(chatId);
      console.log('📋 Retrieved password:', pw);
      console.log('📋 Password type:', typeof pw);
      console.log('📋 Password length:', pw?.length);
      
      setRoomPassword(pw || null);
      console.log('📋 Set roomPassword to:', pw || null);
    }
  }, [chatType, chatId]);

  // When the user joins a password-protected room, set joinPassword from props or context
  useEffect(() => {
    // If a password is provided as a prop (from join dialog), use it
    if (propPassword) {
      setJoinPassword(propPassword);
    } else if (typeof window !== 'undefined' && chatType === 'room' && chatId) {
      // Try to get from sessionStorage (creator) first
      const pw = getRoomPassword(chatId);
      if (pw) {
        setJoinPassword(pw);
      }
    }
  }, [chatType, chatId, propPassword]);

  useEffect(() => {
    // Pass password to createWebRTCConnection if available
    const password = joinPassword;
    rtcRef.current = createWebRTCConnection({
      roomId: chatId,
      userId: userName,
      displayName: username || userName,
      password,
      events: {
        onMessage: (data) => {
          setMessages((prev) => [
            ...prev,
            {
              id: data.id || (Date.now().toString() + Math.random()),
              sender: data.from,
              content: data.msg,
              timestamp: new Date(data.ts || Date.now()),
              isOwn: data.from === userName,
              type: "text",
              avatar: getAvatarForUser(data.from),
            },
          ])

          // --- AUTO-REPLY LOGIC FOR MOSABBIR MARUF ---
          // Only in direct chat with 'Mosabbir' or 'Mosabbir Maruf' (case-insensitive)
          const chatNameLower = (chatName || '').toLowerCase();
          const senderLower = (data.from || '').toLowerCase();
          const userNameLower = (userName || '').toLowerCase();
          const isMosabbir = userNameLower === 'mosabbir maruf' || userNameLower === 'mosabbir';
          const shouldTriggerBot =
            chatType === 'direct' &&
            (chatNameLower === 'mosabbir maruf' || chatNameLower === 'mosabbir') &&
            senderLower !== 'mosabbir maruf' && senderLower !== 'mosabbir' &&
            !isMosabbir;

          if (shouldTriggerBot) {
            const msg = data.msg.trim().toLowerCase();
            // --- KEYWORD-RESPONSE PAIRS FOR MOSABBIR ---
            function sendBotMessage(content: string, delay = 1200) {
              setIsTyping(true);
              setTimeout(() => {
                setIsTyping(false);
                const botMsgId = Date.now().toString() + Math.random();
                setMessages(prev => [
                  ...prev,
                  {
                    id: botMsgId,
                    sender: 'Mosabbir Maruf',
                    content,
                    timestamp: new Date(),
                    isOwn: false,
                    type: 'text',
                    avatar: getAvatarForUser('Mosabbir Maruf'),
                  },
                ]);
              }, delay);
            }
            const mosabbirBotPairs = [
              { keywords: ["mosabbir", "maruf", "mosabbir maruf"], response: "👋 You're chatting with Mosabbir Maruf. Let me know what you need!" },
              { keywords: ["about", "who are you", "tell me about you", "introduce yourself"], response: "🧑‍💻 I'm Mosabbir Maruf — a full-stack dev from Bangladesh. I build responsive websites, dashboards, and custom web apps." },
              { keywords: ["project", "work", "what do you do", "type of project", "past work", "do you have projects"], response: "🚀 I build modern web applications — landing pages, dashboards, admin panels, file managers, WebRTC projects, expense trackers and more!" },
              { keywords: ["freelance", "hire", "freelancer", "available", "work with you", "can i hire"], response: "✅ Yes, I'm available for freelance projects. Share your idea and I'll see how I can help! <a href=\"https://spendwisego.vercel.app/contact\" target=\"_blank\" rel=\"noopener noreferrer\" class=\"text-blue-600 underline ml-1\">Contact me here</a>" },
              { keywords: ["contact", "email", "how to reach", "message you", "get in touch"], response: "📩 You can contact me here 👉 <a href=\"https://spendwisego.vercel.app/contact\" target=\"_blank\" rel=\"noopener noreferrer\" class=\"text-blue-600 underline ml-1\">Contact me here</a>" },
              { keywords: ["i love you"], response: "I love you too." },
              { keywords: ["love your wife, wife."], response: "fuck you bitch." },
              { keywords: ["services", "what do you offer", "what services", "can you do", "features"], response: "🛠️ I offer full-stack development, UI/UX design, frontend/backend integration, and project support." },
              { keywords: ["price", "cost", "rate", "how much", "charges", "payment"], response: "💰 Pricing depends on your project scope. Send me the details and I'll quote fairly." },
              { keywords: ["skills", "stack", "technologies", "tools", "programming", "framework"], response: "💡 My stack includes: HTML, CSS, JavaScript, React, Next.js, Tailwind CSS, Node.js, Firebase, Supabase, and more!" },
              { keywords: ["location", "where are you", "country", "based"], response: "🌍 I'm from Bangladesh 🇧🇩 but I work with global clients online!" },
              { keywords: ["time", "how long", "reply", "response time", "available time"], response: "⏳ I usually reply within 1-3 hours. If urgent, I'll prioritize your message!" },
              { keywords: ["experience", "how many years", "background", "worked before"], response: "�� I've completed 20+ projects, from personal websites to full SaaS apps." },
              { keywords: ["support", "after work", "maintenance", "bug fix", "update"], response: "🔧 I offer project support, bug fixes, maintenance, and feature upgrades." },
              { keywords: ["hello", "hi", "hey", "yo", "whats up", "salam", "assalamualaikum"], response: "👋 Hello! Mosabbir here. What's on your mind?" },
              { keywords: ["thanks", "thank you", "tnx", "appreciate", "grateful"], response: "😊 You're welcome! Always here to help." },
              { keywords: ["bye", "goodbye", "see you", "talk later", "gotta go"], response: "👋 Take care! You can message me again anytime." },
              { keywords: ["fuck", "shit", "bitch", "asshole", "wtf", "suck", "crap", "damn", "bastard", "moron"], response: "Teri gaand lelunga Easy, soldier. Let's keep it clean. Type your actual issue instead of rage-quitting." },
              { keywords: ["dumb", "stupid", "idiot", "useless", "worst bot", "bad bot", "trash"], response: "🧠 I'm built to help, not to argue. But I can roast too if needed 😏" },
              { keywords: ["chod", "choda", "bokachoda", "tor ma", "tor bap", "magi", "banchod", "madarchod", "gandu", "chudi", "naki", "tui ke", "bokami", "tor matha", "khankir", "bosri", "jhagra", "pagol", "boka", "kutta"], response: "😎 Bhai, gali dicchis ken? Beshi bok bok korle tui gali khabi 🤭 Ei ne ekta demo: tor 14 gustichudi" },
              { keywords: ["kichu janish na", "tor matha thik ache", "tor mathay kichu ase", "bokachoda", "tor ma ki kore", "tor bap ki kore"], response: "😂 Amar matha thik ase. Toke to dekhlei bujha jay kisui thik nai. 😎 Shala lifeless." },
              { keywords: ["are you real", "you ai", "you human", "you bot", "you stupid", "dumb bot"], response: "🤖 I'm a smart bot, not a dumb one. But I still don't do chai er dokan gossip. 😁" },
              { keywords: ["robot", "ai", "machine", "chatgpt", "openai"], response: "🤖 I'm an AI helper for Mosabbir Maruf. I'm fast, polite, and way more helpful than your last ex 😅" },
              { keywords: ["bekar", "bekaar", "faltu", "ghanta", "kichu na", "kajer na"], response: "😏 Bhai tui to keyboard e keyboard e boro hero. IRL e ki? 🤭" },
              { keywords: ["tor matha ulta", "pagol bot", "ai ki bujhe", "bot ki kore", "nai bujhte pare"], response: "😂 Bot e bujhe, tui bujhish na. Eita tor dukkho na amar." },
              { keywords: ["tor bou", "bou", "tor bhai", "tor chacha", "tor gushti", "tor line", "tor dada"], response: "😮 Erokom line marish na bhai. Bot-er bou nai, beshi kotha bole tor bou reo chudbo giye" },
              { keywords: ["chud", "cud"], response: "tui jodi doggy dish taholei chudbo toke" },
            ];
            let matched = false;
            for (const pair of mosabbirBotPairs) {
              if (pair.keywords.some(k => msg.includes(k))) {
                matched = true;
                sendBotMessage(pair.response, 1200);
                break;
              }
            }
            // fallback to previous slur logic if nothing matched (optional)
            if (!matched) {
              const mildSlurs = ["fuck", "ass", "boobs", "asshole", "bastard", "shit", "dick", "pussy", "cunt", "nude", "nudes", "sex"];
              const strongSlurs = ["magi", "khanki", "khanke", "madarchod", "bitch"];
              function containsAny(words: string[], text: string) {
                return words.some(w => text.includes(w));
              }
              if (containsAny(strongSlurs, msg)) {
                sendBotMessage('bhai tui ekta madarchod, jaa vaag.', 1200);
              } else if (containsAny(mildSlurs, msg)) {
                sendBotMessage('fuck you', 1200);
              } else {
                sendBotMessage('hey, buddy cool down.', 1200);
              }
            }
          }
        },
        onFile: (data) => {
          const isImage = data.type.startsWith("image/");
          let fileData = undefined;
          if (!isImage && data.data) {
            fileData = data.data instanceof ArrayBuffer
              ? new Uint8Array(data.data)
              : new Uint8Array(data.data);
          }
          const fileObj: any = {
            name: data.name,
            size: data.size,
            type: data.type,
            url: isImage && data.data
              ? URL.createObjectURL(new Blob([new Uint8Array(data.data)], { type: data.type }))
              : undefined,
            data: data.data ? (data.data instanceof ArrayBuffer ? data.data : new Uint8Array(data.data).buffer) : undefined,
          };
          if ('fileId' in data) fileObj.fileId = (data as any).fileId;
          
          // CRITICAL FIX: Always use messageId from sender to ensure reactions sync properly
          const messageId = (data as any).messageId || Date.now().toString() + Math.random();
          
          const messageObj: Message = {
            id: messageId,
            sender: data.from,
            content: `Shared ${data.name}`,
            timestamp: new Date(data.ts),
            isOwn: data.from === userName,
            type: isImage ? "image" : "file",
            avatar: getAvatarForUser(data.from),
            file: fileObj,
          };
          setMessages((prev) => {
            // Remove any progress message with the same fileId
            const filtered = prev.filter(m => !(m.file && (m.file as any).fileId === fileObj.fileId));
            return [...filtered, messageObj];
          });
        },
        onFileUploadProgress: (progress) => {
          console.log('[Upload Progress] Received:', progress);
          setFileProgress((prev) => ({
            ...prev,
            [progress.fileId]: {
              percent: progress.percent,
              speed: progress.speed,
              eta: progress.eta,
              sent: progress.sent,
              total: progress.total,
              name: progress.name,
              type: 'upload',
            },
          }));
          setMessages((prev) => prev.map(m => {
            if (m.file && m.file.fileId === progress.fileId && m.isOwn) {
              if (progress.percent >= 100) {
                // Ensure blob URL is present for sender
                let url = m.file.url;
                if (!url && m.file.data) {
                  try {
                    url = URL.createObjectURL(new File([m.file.data], m.file.name, { type: m.file.type }));
                  } catch {}
                }
                return {
                  ...m,
                  file: { ...m.file, status: 'completed', url },
                  content: `Shared ${progress.name}`,
                } as Message;
              } else {
                // Keep as in-progress during upload
                return {
                  ...m,
                  file: { ...m.file, status: 'in-progress' },
                  content: `Uploading ${progress.name}`,
                } as Message;
              }
            }
            return m;
          }));
          if (progress.percent >= 100) {
            setFileProgress((prev) => {
              const updated = { ...prev };
              delete updated[progress.fileId];
              return updated;
            });
          }
        },
        onFileDownloadProgress: (progress) => {
          setFileProgress((prev) => ({
            ...prev,
            [progress.fileId]: {
              percent: progress.percent,
              speed: progress.speed,
              eta: progress.eta,
              received: progress.received,
              total: progress.total,
              name: progress.name,
              type: 'download',
              from: (progress as any).from || undefined,
            },
          }));
          
          // Handle special signals first
          if (progress.name === '' || progress.total === 0) {
            // This is a cancel signal - update status to canceled
            setMessages((prev) => prev.map(m => {
              if (m.file && m.file.fileId === progress.fileId) {
                return {
                  ...m,
                  file: { ...m.file, status: 'canceled' },
                  content: 'File transfer canceled',
                } as Message;
              }
              return m;
            }));
            // Clean up progress state when canceled
            setFileProgress((prev) => {
              const updated = { ...prev };
              delete updated[progress.fileId];
              return updated;
            });
            return;
          } else if (progress.name === 'RETRY_SIGNAL') {
            // This is a retry signal - reset the canceled message to prepare for retry

            setMessages((prev) => prev.map(m => {
              if (m.file && m.file.fileId === progress.fileId && m.file.status === 'canceled') {
                return {
                  ...m,
                  file: { ...m.file, status: 'in-progress' },
                  content: `Preparing to receive ${m.file.name}...`,
                } as Message;
              }
              return m;
            }));
            // Clean up any old progress state
            setFileProgress((prev) => {
              const updated = { ...prev };
              delete updated[progress.fileId];
              return updated;
            });
            return;
          }
          
          // If download is complete (100%), update message status (it will be handled by onFile event)
          if (progress.percent >= 100) {
            // Clean up progress state when complete
            setFileProgress((prev) => {
              const updated = { ...prev };
              delete updated[progress.fileId];
              return updated;
            });
          } else {
            // Handle first chunk - either create new message or update existing canceled message
            setMessages((prev) => {
              const existingMessageIndex = prev.findIndex(m => (m.file as any)?.fileId === progress.fileId);
              
              if (existingMessageIndex !== -1) {
                // Update existing message (likely a canceled one being retried)
                const updatedMessages = [...prev];
                updatedMessages[existingMessageIndex] = {
                  ...prev[existingMessageIndex],
                  content: `Receiving ${progress.name}`,
                  file: {
                    ...prev[existingMessageIndex].file!,
                    name: progress.name,
                    size: progress.total,
                    status: 'in-progress',
                  },
                } as Message;
                return updatedMessages;
              } else {
                // Create new message if none exists
                return [
                  ...prev,
                  {
                    id: Date.now().toString() + Math.random(),
                    sender: (progress as any).from || 'Unknown',
                    content: `Receiving ${progress.name}`,
                    timestamp: new Date(),
                    isOwn: false,
                    type: 'file',
                    file: {
                      name: progress.name,
                      size: progress.total,
                      type: '',
                      fileId: progress.fileId,
                      status: 'in-progress',
                    },
                  } as Message,
                ];
              }
            });
          }
        },
        onCall: (type, from) => {
          // Only show incoming call if not already in a call
          if (!activeCall) {
            setActiveCall({ type, isIncoming: true, callerId: from });
            setCallAccepted(false);
          }
        },
        onCallAccepted: (from) => {
          setCallAccepted(true);
          setActiveCall((prev) => prev ? { ...prev, isIncoming: false } : prev);
          
          // Start the appropriate type of call based on activeCall type
          if (activeCall?.type === 'video') {
            rtcRef.current?.startVideoCall?.('direct');
          } else {
            rtcRef.current?.startAudioCall?.('direct');
          }
        },
        onPeerJoin: (peerId, displayName) => {
          // Only show system message if the joined user is NOT the current user
          if (isRealDisplayName(displayName) && displayName !== userName) {
            setMessages((prev) => {
              // Remove the last 'user_left' or 'user_removed' system message for this user if present
              const filtered = prev.filter(
                m => !(m.type === 'system' && (m.systemType === 'user_left' || m.systemType === 'user_removed') && m.affectedUser === displayName)
              );
              return [
                ...filtered,
                {
                  id: Date.now().toString() + "_joined",
                  sender: "System",
                  content: "",
                  timestamp: new Date(),
                  isOwn: false,
                  type: "system",
                  systemType: "user_joined",
                  affectedUser: displayName,
                },
              ];
            });
          }
        },
        onPeerLeave: (peerId, displayName) => {
          // Only show system message if the left user is NOT the current user
          if (chatType === 'direct' && peerId !== userName && typeof onPeerOffline === 'function') {
            onPeerOffline(peerId);
          }
          if (chatType === 'room' && isRealDisplayName(displayName) && displayName !== userName) {
            setMessages((prev) => {
              // Remove the last 'user_joined' system message for this user if present
              const filtered = prev.filter(
                m => !(m.type === 'system' && m.systemType === 'user_joined' && m.affectedUser === displayName)
              );
              return [
                ...filtered,
                {
                  id: Date.now().toString() + "_left",
                  sender: "System",
                  content: "",
                  timestamp: new Date(),
                  isOwn: false,
                  type: "system",
                  systemType: "user_left",
                  affectedUser: displayName,
                },
              ];
            });
          }
        },
        onRoomUsers: (users) => {
          setRoomUsers(users);
        },
        onTyping: (fromUserId?: string) => {
          if (chatType === 'room' && fromUserId && fromUserId !== userId) {
            setTypingUserIds((prev) => {
              if (!prev.includes(fromUserId)) return [...prev, fromUserId];
              return prev;
            });
            setIsTyping(true);
            if (typingTimeout.current) clearTimeout(typingTimeout.current);
            typingTimeout.current = setTimeout(() => {
              setIsTyping(false);
              setTypingUserIds([]);
            }, 1000);
          } else if (chatType === 'direct') {
            setIsTyping(true);
            if (typingTimeout.current) clearTimeout(typingTimeout.current);
            typingTimeout.current = setTimeout(() => setIsTyping(false), 1000);
          }
        },
        onDisconnect: () => {
          if (chatType === 'direct' && typeof onPeerOffline === 'function') {
            onPeerOffline(chatName);
          }
          onClose();
        },
        onVoice: (data) => {
          // Debug log for received voice message
          console.log('[onVoice] Received voice message:', data);
          // Ensure data.data is always a Uint8Array
          let audioArray: Uint8Array;
          if (data.data instanceof ArrayBuffer) {
            audioArray = new Uint8Array(data.data);
          } else if (Array.isArray(data.data)) {
            audioArray = new Uint8Array(data.data);
          } else {
            audioArray = new Uint8Array();
          }
          const messageId = (data as any).messageId || Date.now().toString() + Math.random();
          setMessages((prev) => [
            ...prev,
            {
              id: messageId,
              sender: data.from,
              content: "Voice message",
              timestamp: new Date(data.ts),
              isOwn: data.from === userName,
              type: "voice",
              duration: data.duration,
              avatar: undefined,
              file: {
                name: "voice-note.webm",
                size: audioArray.length,
                type: "audio/webm",
                url: URL.createObjectURL(new Blob([audioArray], { type: "audio/webm" })),
                // no fileId for voice
              },
            },
          ])
        },
        onReaction: (reaction) => {
          setMessages((prev) =>
            prev.map((message) => {
              if (message.id === reaction.messageId) {
                const reactions = message.reactions || [];
                const existingReaction = reactions.find((r) => r.emoji === reaction.emoji);
                if (reaction.action === 'remove') {
                  if (existingReaction && existingReaction.users.includes(reaction.from)) {
                    const updatedUsers = existingReaction.users.filter((user) => user !== reaction.from);
                    if (updatedUsers.length === 0) {
                      return {
                        ...message,
                        reactions: reactions.filter((r) => r.emoji !== reaction.emoji),
                      };
                    } else {
                      return {
                        ...message,
                        reactions: reactions.map((r) =>
                          r.emoji === reaction.emoji ? { ...r, users: updatedUsers, count: updatedUsers.length } : r
                        ),
                      };
                    }
                  }
                  return message;
                } else if (reaction.action === 'add') {
                  if (existingReaction) {
                    if (!existingReaction.users.includes(reaction.from)) {
                      return {
                        ...message,
                        reactions: reactions.map((r) =>
                          r.emoji === reaction.emoji
                            ? { ...r, users: [...r.users, reaction.from], count: r.count + 1 }
                            : r
                        ),
                      };
                    } else {
                      return message;
                    }
                  } else {
                    // New reaction
                    return {
                      ...message,
                      reactions: [...reactions, { emoji: reaction.emoji, users: [reaction.from], count: 1 }],
                    };
                  }
                }
              }
              return message;
            })
          );
        },
        onAudioStream: (peerId, stream) => {
          setRemoteAudioStreams(prev => ({ ...prev, [peerId]: stream }));
        },
        onLocalAudioStream: (stream) => {
          setLocalAudioStream(stream);
        },
        onMuteChange: (muted) => {
          setIsMuted(muted);
        },
        // Video stream handlers
        onVideoStream: (peerId, stream) => {
          const normPeerId = peerId.toLowerCase();
          console.log('[Chat Interface] Received remote video stream from:', normPeerId, stream);
          console.log('[Chat Interface] Current roomCallParticipants:', roomCallParticipants);
          if (chatType === 'room') {
            setRemoteVideoStreams(prev => {
              const updated = {
                ...prev,
                [normPeerId]: stream
              };
              setTimeout(() => {
                console.log('[Chat Interface] remoteVideoStreams after update:', Object.keys(updated));
              }, 1000);
              return updated;
            });
          } else {
            setRemoteVideoStream(stream);
          }
        },
        onLocalVideoStream: (stream) => {
          console.log('[Chat Interface] Received local video stream:', stream);
          setLocalVideoStream(stream);
        },
        onVideoToggle: (enabled) => {
          setIsVideoEnabled(enabled);
        },
        onCallEnd: () => {
          // Send end signal first
          rtcRef.current?.sendCallEnd?.();
          
          // Clean up state
          setActiveCall(null);
          setCallAccepted(false);
          
          // Clean up all media streams
          cleanupMediaStreams();
        },
        onCallMissed: (from: string) => {
          // Add missed call message for caller
          setMessages((prev: Message[]) => [
            ...prev,
            {
              id: Date.now().toString() + "_missed",
              sender: "System",
              content: `Your call to ${chatName} was not answered`,
              timestamp: new Date(),
              isOwn: true,
              type: "system",
              systemType: "missed_call",
              affectedUser: chatName,
            } as Message,
          ]);
          setActiveCall(null);
          setCallAccepted(false);
        },
        onCallRejected: (from: string) => {
          setMessages((prev: Message[]) => [
            ...prev,
            {
              id: Date.now().toString() + '_rejected',
              sender: 'System',
              content: `Call to ${chatName} was rejected`,
              timestamp: new Date(),
              isOwn: true,
              type: 'system',
              systemType: 'call_rejected',
              affectedUser: chatName,
            } as Message,
          ]);
          setActiveCall(null);
          setCallAccepted(false);
        },
        // Room call events
        onRoomCall: (type: 'audio' | 'video', from: string, participants: string[], rejectedUsers?: string[], leftUsers?: string[]) => {
          console.log('[Room Call] Room call from', from, 'type:', type, 'participants:', participants);
          console.log('[Room Call] Current user:', userName, 'From user:', from);
          setRoomCallActive(true);
          // Only show as incoming if this user is not the caller
          setRoomCallIncoming(from !== userName);
          setRoomCallType(type);
          setRoomCallParticipants(participants || []);
          setRoomCallRejectedUsers(rejectedUsers || []);
          setRoomCallLeftUsers(leftUsers || []);
          setRoomCallAccepted(false);
          console.log('[Room Call] Set incoming:', from !== userName, 'Active:', true, 'Accepted:', false);
          
          // Filter audio streams immediately to only accept from the initiator
          // This prevents non-accepted users from receiving audio
          rtcRef.current?.filterAudioStreams([from]);
          
          // Add system message for room call start
          const startMessage: Message = {
            id: Date.now().toString() + "_room_call_start",
            sender: "System",
            content: `Room call started by ${getDisplayName(from)}`,
            timestamp: new Date(),
            isOwn: false,
            type: "system",
            systemType: "user_joined", // Reuse user_joined for call start
            affectedUser: from,
            actionBy: from,
          };
          setMessages((prev) => [...prev, startMessage]);
        },
        onRoomCallAccepted: (from: string, participants: string[], rejectedUsers?: string[], leftUsers?: string[]) => {
          console.log('[Room Call] Room call accepted by', from, 'participants:', participants);
          console.log('[Room Call] Current user:', userName, 'From:', from);
          console.log('[Room Call] Current state - Active:', roomCallActive, 'Incoming:', roomCallIncoming, 'Accepted:', roomCallAccepted);
          setRoomCallParticipants(participants || []);
          setRoomCallRejectedUsers(rejectedUsers || []);
          setRoomCallLeftUsers(leftUsers || []);
          // If this user accepted, update their state and start call
          if (from === userName) {
            console.log('[Room Call] This user accepted the call');
            setRoomCallAccepted(true);
            setRoomCallIncoming(false);
            setRoomCallStarted(false); // Stop ringback sound
            setRoomCallActive(true); // Ensure call is active
            // Start call only with accepted participants
            if (roomCallType === 'video') {
              rtcRef.current?.startVideoCallWithParticipants(participants, 'room');
              rtcRef.current?.filterVideoStreams(participants);
            } else {
              rtcRef.current?.startAudioCallWithParticipants(participants, 'room');
              rtcRef.current?.filterAudioStreams(participants);
            }
            setTimeout(() => {
              console.log('[Room Call] Updated state after acceptance - Active: true, Incoming: false, Accepted: true');
            }, 100);
          }
          // If someone else accepted, update the initiator's state to start the call
          const isInitiator = participants.length > 0 && participants[0] === userName;
          if (from !== userName && isInitiator) {
            console.log('[Room Call] Someone else accepted, starting call for initiator');
            setRoomCallStarted(false); // Stop ringback sound for initiator
            setRoomCallActive(true); // Keep call active for initiator
            setRoomCallAccepted(true); // Mark as accepted for initiator
            // Start call only with accepted participants
            if (roomCallType === 'video') {
              rtcRef.current?.startVideoCallWithParticipants(participants, 'room');
              rtcRef.current?.filterVideoStreams(participants);
            } else {
              rtcRef.current?.startAudioCallWithParticipants(participants, 'room');
              rtcRef.current?.filterAudioStreams(participants);
            }
            setTimeout(() => {
              console.log('[Room Call] Updated state after someone accepted - Active: true, Incoming: false, Accepted: true');
            }, 100);
          }
        },
        onRoomCallRejected: (from: string, participants: string[], rejectedUsers?: string[], leftUsers?: string[]) => {
          console.log('[Room Call] Room call rejected by', from, 'participants:', participants);
          setRoomCallParticipants(participants || []);
          setRoomCallRejectedUsers(rejectedUsers || []);
          setRoomCallLeftUsers(leftUsers || []);
          // Add system message for room call rejection
          const rejectionMessage: Message = {
            id: Date.now().toString() + "_room_call_rejected",
            sender: "System",
            content: `Room call was rejected by ${getDisplayName(from)}`,
            timestamp: new Date(),
            isOwn: false,
            type: "system",
            systemType: "call_rejected",
            affectedUser: from,
            actionBy: from,
          };
          setMessages((prev) => [...prev, rejectionMessage]);
          // If this user rejected, update their state
          if (from === userName) {
            setRoomCallActive(false);
            setRoomCallIncoming(false);
            setRoomCallAccepted(false);
            rtcRef.current?.stopAudioCall();
            rtcRef.current?.stopVideoCall();
          }
          // If no participants left, end the call for everyone
          if ((participants || []).length === 0) {
            setRoomCallActive(false);
            setRoomCallIncoming(false);
            setRoomCallAccepted(false);
            setRoomCallParticipants([]);
            setRoomCallRejectedUsers([]);
            setRoomCallLeftUsers([]);
            rtcRef.current?.stopAudioCall();
            rtcRef.current?.stopVideoCall();
          } else {
            // Only call WebRTC functions with the updated participants list
            if (roomCallType === 'video') {
              rtcRef.current?.startVideoCallWithParticipants(participants, 'room');
              rtcRef.current?.filterVideoStreams(participants);
            } else {
              rtcRef.current?.startAudioCallWithParticipants(participants, 'room');
              rtcRef.current?.filterAudioStreams(participants);
            }
          }
        },
        onRoomCallEnd: (from: string, participants: string[], rejectedUsers?: string[], leftUsers?: string[]) => {
          console.log('[Room Call] Room call ended by', from, 'participants:', participants);
          // Add system message for room call end
          const endMessage: Message = {
            id: Date.now().toString() + "_room_call_ended",
            sender: "System",
            content: `Room call was ended by ${getDisplayName(from)}`,
            timestamp: new Date(),
            isOwn: false,
            type: "system",
            systemType: "call_rejected", // Reuse call_rejected for call end
            affectedUser: from,
            actionBy: from,
          };
          setMessages((prev) => [...prev, endMessage]);
          // If this user ended the call, update their state
          if (from === userName) {
            setRoomCallActive(false);
            setRoomCallIncoming(false);
            setRoomCallAccepted(false);
            setRoomCallParticipants([]);
            setRoomCallRejectedUsers([]);
            setRoomCallLeftUsers([]);
            rtcRef.current?.stopAudioCall();
            rtcRef.current?.stopVideoCall();
          } else {
            // Someone else ended the call, update participants list
            setRoomCallParticipants(participants || []);
            setRoomCallRejectedUsers(rejectedUsers || []);
            setRoomCallLeftUsers(leftUsers || []);
            // If no participants left, end the call for everyone
            if ((participants || []).length === 0) {
              setRoomCallActive(false);
              setRoomCallIncoming(false);
              setRoomCallAccepted(false);
              setRoomCallParticipants([]);
              setRoomCallRejectedUsers([]);
              setRoomCallLeftUsers([]);
              rtcRef.current?.stopAudioCall();
              rtcRef.current?.stopVideoCall();
            } else {
              // Only call WebRTC functions with the updated participants list
              if (roomCallType === 'video') {
                rtcRef.current?.startVideoCallWithParticipants(participants, 'room');
                rtcRef.current?.filterVideoStreams(participants);
              } else {
                rtcRef.current?.startAudioCallWithParticipants(participants, 'room');
                rtcRef.current?.filterAudioStreams(participants);
              }
            }
          }
        },
        onRoomCallJoin: (from: string, participants: string[], rejectedUsers?: string[], leftUsers?: string[]) => {
          console.log('[Room Call] Room call joined by', from, 'participants:', participants);
          setRoomCallParticipants(participants || []);
          setRoomCallRejectedUsers(rejectedUsers || []);
          setRoomCallLeftUsers(leftUsers || []);
          
          // Add system message for room call join
          const joinMessage: Message = {
            id: Date.now().toString() + "_room_call_join",
            sender: "System",
            content: `${getDisplayName(from)} joined the room call`,
            timestamp: new Date(),
            isOwn: false,
            type: "system",
            systemType: "user_joined",
            affectedUser: from,
            actionBy: from,
          };
          setMessages((prev) => [...prev, joinMessage]);
          
          // If this user joined, update their state
          if (from === userName) {
            setRoomCallAccepted(true);
            setRoomCallIncoming(false);
            setRoomCallStarted(false); // Stop ringback sound
            if (roomCallType === 'video') {
              rtcRef.current?.startVideoCallWithParticipants(participants, 'room');
              rtcRef.current?.filterVideoStreams(participants);
            } else {
              rtcRef.current?.startAudioCallWithParticipants(participants, 'room');
              rtcRef.current?.filterAudioStreams(participants);
            }
          }
          
          // If someone else joined, only update participants list (no auto-accept for others)
          if (from !== userName) {
            console.log('[Room Call] Someone else joined, updating participants list only');
            // Only update participants list, don't auto-accept for other members
            // Other members need to manually join
          }
        },
        onToast: (title: string, description: string, variant?: 'default' | 'destructive') => {
          toast({
            title,
            description,
            variant: variant || 'default',
          });
        },
      },
    })
    return () => {
      rtcRef.current?.stopAudioCall?.()
      rtcRef.current?.stopVideoCall?.()
      rtcRef.current?.leave()
      if (typingTimeout.current) clearTimeout(typingTimeout.current)
    }
  }, [chatId, userName, username, joinPassword]);

  // Restore helper functions accidentally removed
  function generateFileId(file: File) {
    return `${file.name}-${file.size}-${Date.now()}-${Math.random()}`;
  }

  function getFileIdForMessage(message: Message) {
    if (!message.file) return undefined;
    if ((message.file as any).fileId) return (message.file as any).fileId;
    
    // Find a progress entry with matching name and total size
    const progressMatch = Object.entries(fileProgress).find(
      ([, v]) => v.name === message.file!.name && v.total === message.file!.size
    );
    
    return progressMatch?.[0];
  }

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)

    const files = Array.from(e.dataTransfer.files)
    handleFiles(files)
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    handleFiles(files)
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  const handleFiles = async (files: File[]) => {
    for (const file of files) {
      const isImage = file.type.startsWith("image/");
      const messageId = Date.now().toString() + Math.random();
      const timestamp = new Date();
      const fileId = generateFileId(file);
      // 1. Immediately broadcast 'in-progress' message
      const inProgressMsg: Message = {
        id: messageId,
        sender: userName,
        content: `Uploading ${file.name}`,
        timestamp,
        isOwn: true,
        type: isImage ? "image" : "file",
        avatar: getAvatarForUser(userName),
        file: {
          name: file.name,
          size: file.size,
          type: file.type,
          fileId,
          status: 'in-progress',
          url: URL.createObjectURL(file), // Always attach blob URL for sender
          data: undefined, // Optionally keep the file data if needed
        },
      };
      setMessages((prev) => [...prev, inProgressMsg]);

      // 2. Send via WebRTC file transfer for peer-to-peer sharing only
      if (rtcRef.current?.sendFile) {
        rtcRef.current.sendFile(file, fileId, messageId);
      }
    }
  };

  // Helper: mosabbir maruf auto-reply logic for local test mode
  function maybeTriggerMosabbirBotLocal(msgText: string) {
    const chatNameLower = (chatName || '').toLowerCase();
    const userNameLower = (userName || '').toLowerCase();
    const isMosabbir = userNameLower === 'mosabbir maruf' || userNameLower === 'mosabbir';
    if (
      chatType === 'direct' &&
      (chatNameLower === 'mosabbir maruf' || chatNameLower === 'mosabbir') &&
      !isMosabbir
    ) {
      const msg = msgText.trim().toLowerCase();
      // --- KEYWORD-RESPONSE PAIRS FOR MOSABBIR ---
      function sendBotMessage(content: string, delay = 1200) {
        setIsTyping(true);
        setTimeout(() => {
          setIsTyping(false);
          const botMsgId = Date.now().toString() + Math.random();
          setMessages(prev => [
            ...prev,
            {
              id: botMsgId,
              sender: 'Mosabbir Maruf',
              content,
              timestamp: new Date(),
              isOwn: false,
              type: 'text',
              avatar: getAvatarForUser('Mosabbir Maruf'),
            },
          ]);
        }, delay);
      }
      const mosabbirBotPairs = [
        { keywords: ["mosabbir", "maruf", "mosabbir maruf"], response: "👋 You're chatting with Mosabbir Maruf. Let me know what you need!" },
        { keywords: ["about", "who are you", "tell me about you", "introduce yourself"], response: "🧑‍�� I'm Mosabbir Maruf — a full-stack dev from Bangladesh. I build responsive websites, dashboards, and custom web apps." },
        { keywords: ["project", "work", "what do you do", "type of project", "past work", "do you have projects"], response: "🚀 I build modern web applications — landing pages, dashboards, admin panels, file managers, WebRTC projects, expense trackers and more!" },
        { keywords: ["freelance", "hire", "freelancer", "available", "work with you", "can i hire"], response: "✅ Yes, I'm available for freelance projects. Share your idea and I'll see how I can help! <a href=\"https://spendwisego.vercel.app/contact\" target=\"_blank\" rel=\"noopener noreferrer\" class=\"text-blue-600 underline ml-1\">Contact me here</a>" },
        { keywords: ["contact", "email", "how to reach", "message you", "get in touch"], response: "📩 You can contact me here 👉 <a href=\"https://spendwisego.vercel.app/contact\" target=\"_blank\" rel=\"noopener noreferrer\" class=\"text-blue-600 underline ml-1\">Contact me here</a>" },
        { keywords: ["i love you"], response: "I love you too." },
        { keywords: ["love your wife, wife."], response: "fuck you bitch." },
        { keywords: ["services", "what do you offer", "what services", "can you do", "features"], response: "🛠️ I offer full-stack development, UI/UX design, frontend/backend integration, and project support." },
        { keywords: ["price", "cost", "rate", "how much", "charges", "payment"], response: "�� Pricing depends on your project scope. Send me the details and I'll quote fairly." },
        { keywords: ["skills", "stack", "technologies", "tools", "programming", "framework"], response: "💡 My stack includes: HTML, CSS, JavaScript, React, Next.js, Tailwind CSS, Node.js, Firebase, Supabase, and more!" },
        { keywords: ["location", "where are you", "country", "based"], response: "🌍 I'm from Bangladesh 🇧🇩 but I work with global clients online!" },
        { keywords: ["time", "how long", "reply", "response time", "available time"], response: "⏳ I usually reply within 1-3 hours. If urgent, I'll prioritize your message!" },
        { keywords: ["experience", "how many years", "background", "worked before"], response: "📚 I've completed 20+ projects, from personal websites to full SaaS apps." },
        { keywords: ["support", "after work", "maintenance", "bug fix", "update"], response: "🔧 I offer project support, bug fixes, maintenance, and feature upgrades." },
        { keywords: ["hello", "hi", "hey", "yo", "whats up", "salam", "assalamualaikum"], response: "👋 Hello! Mosabbir here. What's on your mind?" },
        { keywords: ["thanks", "thank you", "tnx", "appreciate", "grateful"], response: "😊 You're welcome! Always here to help." },
        { keywords: ["bye", "goodbye", "see you", "talk later", "gotta go"], response: "👋 Take care! You can message me again anytime." },
        { keywords: ["fuck", "shit", "bitch", "asshole", "wtf", "suck", "crap", "damn", "bastard", "moron"], response: " Easy, soldier. Let's keep it clean. Type your actual issue instead of rage-quitting." },
        { keywords: ["dumb", "stupid", "idiot", "useless", "worst bot", "bad bot", "trash"], response: "🧠 I'm built to help, not to argue. But I can roast too if needed 😏" },
        { keywords: ["chod", "choda", "bokachoda", "tor ma", "tor bap", "magi", "banchod", "madarchod", "gandu", "chudi", "naki", "tui ke", "bokami", "tor matha", "khankir", "bosri", "jhagra", "pagol", "boka", "kutta"], response: "😎 Bhai, gali dicchis ken? Beshi bok bok korle tui gali khabi 🤭 Ei ne ekta demo: tor 14 gustichudi" },
        { keywords: ["kichu janish na", "tor matha thik ache", "tor mathay kichu ase", "bokachoda", "tor ma ki kore", "tor bap ki kore"], response: "😂 Amar matha thik ase. Toke to dekhlei bujha jay kisui thik nai. 😎 Shala lifeless." },
        { keywords: ["are you real", "you ai", "you human", "you bot", "you stupid", "dumb bot"], response: "🤖 I'm a smart bot, not a dumb one. But I still don't do chai er dokan gossip. 😁" },
        { keywords: ["robot", "ai", "machine", "chatgpt", "openai"], response: "🤖 I'm an AI helper for Mosabbir Maruf. I'm fast, polite, and way more helpful than your last ex 😅" },
        { keywords: ["bekar", "bekaar", "faltu", "ghanta", "kichu na", "kajer na"], response: "😏 Bhai tui to keyboard e keyboard e boro hero. IRL e ki? 🤭" },
        { keywords: ["tor matha ulta", "pagol bot", "ai ki bujhe", "bot ki kore", "nai bujhte pare"], response: "😂 Bot e bujhe, tui bujhish na. Eita tor dukkho na amar." },
        { keywords: ["tor bou", "bou", "tor bhai", "tor chacha", "tor gushti", "tor line", "tor dada"], response: "😮 Erokom line marish na bhai. Bot-er bou nai, beshi kotha bole tor bou reo chudbo giye" },
        { keywords: ["chud", "cud"], response: "tui jodi doggy dish taholei chudbo toke" },
      ];
      let matched = false;
      for (const pair of mosabbirBotPairs) {
        if (pair.keywords.some(k => msg.includes(k))) {
          matched = true;
          sendBotMessage(pair.response, 1200);
          break;
        }
      }
      // fallback to previous slur logic if nothing matched (optional)
      if (!matched) {
        const mildSlurs = ["fuck", "ass", "boobs", "asshole", "bastard", "shit", "dick", "pussy", "cunt", "nude", "nudes", "sex"];
        const strongSlurs = ["magi", "khanki", "khanke", "madarchod", "bitch"];
        function containsAny(words: string[], text: string) {
          return words.some(w => text.includes(w));
        }
        if (containsAny(strongSlurs, msg)) {
          sendBotMessage('bhai tui ekta madarchod, jaa vaag.', 1200);
        } else if (containsAny(mildSlurs, msg)) {
          sendBotMessage('fuck you', 1200);
        } else {
          sendBotMessage('hey, buddy cool down.', 1200);
        }
      }
    }
  }

  const handleSendMessage = () => {
    if (newMessage.trim()) {
      setIsSendingMessage(true);
      const messageId = Date.now().toString() + Math.random();
      // Optimistically add the message to your own chat history
      setMessages((prev) => [
        ...prev,
        {
          id: messageId,
          sender: userName,
          content: newMessage,
          timestamp: new Date(),
          isOwn: true,
          type: "text",
        },
      ]);
      rtcRef.current?.sendChatMessage(newMessage, messageId);
      // Local test mode: trigger bot reply logic
      maybeTriggerMosabbirBotLocal(newMessage);
      setNewMessage("");
      setShowEmojiPicker(false);
      
      // Keep keyboard open on mobile after sending message (like WhatsApp/Messenger)
      if (isMobile) {
        // Multiple focus attempts with different timing strategies
        const focusInput = () => {
          if (messageInputRef.current) {
            messageInputRef.current.focus();
            console.log('Focusing input after send');
          }
        };
        
        // Immediate focus
        focusInput();
        
        // Use requestAnimationFrame for next frame
        requestAnimationFrame(focusInput);
        
        // Delayed focus attempts
        setTimeout(focusInput, 50);
        setTimeout(focusInput, 150);
        setTimeout(() => {
          focusInput();
          setIsSendingMessage(false);
        }, 300);
      } else {
        setIsSendingMessage(false);
      }
    }
  }

  const handleEmojiSelect = (emoji: string) => {
    setNewMessage((prev) => prev + emoji)
  }

  const handleVoiceRecorded = (duration: number, audioBlob: Blob) => {
    const messageId = Date.now().toString() + Math.random();
    // Read the audio blob as ArrayBuffer and send to peer
    const reader = new FileReader();
    reader.onload = () => {
      const audioBuffer = reader.result as ArrayBuffer;
      // Add to own chat history
      setMessages((prev) => [
        ...prev,
        {
          id: messageId,
          sender: "You",
          content: "Voice message",
          timestamp: new Date(),
          isOwn: true,
          type: "voice",
          duration,
          avatar: undefined,
          file: {
            name: "voice-note.webm",
            size: audioBlob.size,
            type: "audio/webm",
            url: URL.createObjectURL(audioBlob),
            fileId: undefined, // No fileId for voice messages
          },
        },
      ]);
      // Debug log for sending voice message
      console.log('[sendVoice] Sending voice message:', { duration, messageId });
      rtcRef.current?.sendVoice(audioBuffer, duration, messageId);
      setIsRecording(false);
    };
    reader.readAsArrayBuffer(audioBlob);
  }

  const handlePlayVoice = (messageId: string) => {
    if (playingVoice === messageId) {
      setPlayingVoice(null)
    } else {
      setPlayingVoice(messageId)
      // Removed setTimeout; playback is now controlled by the audio element's onEnded event
    }
  }

  const handleReaction = (messageId: string, emoji: string) => {
    let shouldSend: 'add' | 'remove' | null = null;
    setMessages((prev) =>
      prev.map((message) => {
        if (message.id === messageId) {
          const reactions = message.reactions || []
          const existingReaction = reactions.find((r) => r.emoji === emoji)

          if (existingReaction) {
            // Toggle reaction
            if (existingReaction.users.includes("You")) {
              // Remove reaction
              shouldSend = 'remove';
              const updatedUsers = existingReaction.users.filter((user) => user !== "You")
              if (updatedUsers.length === 0) {
                return {
                  ...message,
                  reactions: reactions.filter((r) => r.emoji !== emoji),
                }
              } else {
                return {
                  ...message,
                  reactions: reactions.map((r) =>
                    r.emoji === emoji ? { ...r, users: updatedUsers, count: updatedUsers.length } : r,
                  ),
                }
              }
            } else {
              // Add reaction
              shouldSend = 'add';
              return {
                ...message,
                reactions: reactions.map((r) =>
                  r.emoji === emoji ? { ...r, users: [...r.users, "You"], count: r.count + 1 } : r,
                ),
              }
            }
          } else {
            // New reaction
            shouldSend = 'add';
            return {
              ...message,
              reactions: [...reactions, { emoji, users: ["You"], count: 1 }],
            }
          }
        }
        return message
      }),
    )
    if (
      shouldSend &&
      rtcRef.current &&
      typeof rtcRef.current.sendReaction === "function"
    ) {
      rtcRef.current.sendReaction(messageId, emoji, shouldSend);
    }
    setShowReactionPicker(null)
  }

  const handleLeaveRoom = () => {
    // Add system message for leaving
    const leaveMessage: Message = {
      id: Date.now().toString() + "_leave",
      sender: "System",
      content: "You left the group",
      timestamp: new Date(),
      isOwn: false,
      type: "system",
      systemType: "user_left",
      affectedUser: "You",
    }
    setMessages((prev) => [...prev, leaveMessage])

    // Close chat after a short delay
    setTimeout(() => {
      onClose()
    }, 1500)
  }

  const handleDisconnect = () => {
    rtcRef.current?.sendDisconnect()
    onClose()
  }

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  }

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes"
    const k = 1024
    const sizes = ["Bytes", "KB", "MB", "GB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
  }

  const getFileIcon = (type: string) => {
    if (type.startsWith("image/")) return <ImageIcon className="h-4 w-4" />
    if (type.startsWith("video/")) return <Film className="h-4 w-4" />
    if (type.startsWith("audio/")) return <Music className="h-4 w-4" />
    return <FileText className="h-4 w-4" />
  }

  const getInitials = (name: string) => {
    return name.split(" ")[0].charAt(0).toUpperCase()
  }

  const VoiceMessage = ({ message }: { message: Message }) => {
    const isPlaying = playingVoice === message.id;
    const audioRef = useRef<HTMLAudioElement | null>(null);

    useEffect(() => {
      if (isPlaying && audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch((e) => {
          // Ignore play interruption errors
        });
        const onEnded = () => setPlayingVoice(null);
        audioRef.current.addEventListener('ended', onEnded);
        return () => {
          audioRef.current?.removeEventListener('ended', onEnded);
        };
      } else if (!isPlaying && audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
    }, [isPlaying]);

    return (
      <div className="flex items-center gap-2 min-w-[200px]">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => handlePlayVoice(message.id)}
          className="h-8 w-8 p-0 rounded-full"
        >
          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Button>
        <div className="flex-1 flex items-center gap-2">
          <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-primary rounded-full"
              initial={{ width: "0%" }}
              animate={{ width: isPlaying ? "100%" : "0%" }}
              transition={{ duration: message.duration || 0 }}
            />
          </div>
          <span className="text-xs text-muted-foreground">{formatDuration(message.duration || 0)}</span>
        </div>
        {/* Voice wave illustration */}
        <div className="w-8 h-8 opacity-30">
          <img src="/illustrations/voice-wave.png" alt="Voice wave" className="w-full h-full object-cover rounded" />
        </div>
        {/* Audio element for playback */}
        <audio ref={audioRef} src={message.file?.url} preload="auto" />
      </div>
    )
  }

  // In FileMessage, implement download
  const FileMessage = ({ message }: { message: Message }) => {
    const file = message.file!;
    const fileId = getFileIdForMessage(message);
    const progress = fileId ? fileProgress[fileId] : undefined;
    const isInProgress = progress && progress.percent < 100;

    // In FileMessage, get status from file
    const status = file.status || (isInProgress ? 'in-progress' : 'completed');
    // If canceled, show canceled UI (existing logic)
    if (status === 'canceled') {
      // Different border colors for sender vs receiver
      const borderColor = message.isOwn ? 'border-blue-200' : 'border-green-200';
      
      return (
        <div className={`inline-flex items-center gap-2 px-3 py-2 bg-destructive/10 hover:bg-destructive/15 rounded-full transition-colors max-w-[320px] opacity-80 border ${borderColor}`}>
          <div className="flex-shrink-0 w-4 h-4 text-destructive/70">
            {getFileIcon(file.type)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{file.name}</p>
            <div className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-destructive"></div>
              <span className="text-xs text-destructive font-medium">Canceled</span>
            </div>
          </div>
          <div className="flex-shrink-0 text-xs text-muted-foreground">
            {formatFileSize(file.size)}
          </div>
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-6 w-6 p-0 rounded-full hover:bg-primary/20 hover:text-primary transition-colors flex-shrink-0" 
            onClick={(e) => { e.stopPropagation(); handleRetryFileTransfer(message); }} 
            title="Retry"
          >
            <span className="text-sm">↻</span>
          </Button>
        </div>
      );
    }

    // Check for in-progress status FIRST (before file.url check)
    if (status === 'in-progress') {
      // Always get fileId from file or fallback
      const cancelFileId = file.fileId || getFileIdForMessage(message);
      
      // Different border colors for sender vs receiver
      const borderColor = message.isOwn ? 'border-blue-200' : 'border-green-200';
      
      return (
        <div className={`inline-flex items-center gap-2 px-3 py-2 pr-9 bg-muted/60 hover:bg-muted/80 rounded-full transition-colors max-w-[360px] border ${borderColor}`} style={{ position: 'relative' }}>
          <div className="flex-shrink-0 w-4 h-4 text-muted-foreground">
            {getFileIcon(file.type)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{file.name}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <Progress 
                value={progress ? progress.percent : 0} 
                className="h-1 bg-muted/60 flex-1"
              />
              <span className="text-xs text-muted-foreground tabular-nums">
                {progress ? progress.percent.toFixed(0) : '0'}%
              </span>
            </div>
            {/* Speed and ETA display */}
            {progress && progress.speed > 0 && (
              <div className="flex items-center justify-between mt-1 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <span className={`inline-block w-1 h-1 rounded-full ${
                    progress.type === 'upload' ? 'bg-blue-400' : 'bg-green-400'
                  }`}></span>
                  <span className="font-medium">
                    {progress.speed > 1024 * 1024 
                      ? `${(progress.speed / 1024 / 1024).toFixed(1)} MB/s`
                      : `${(progress.speed / 1024).toFixed(0)} KB/s`
                    }
                  </span>
                  <span className="text-[9px] opacity-60">
                    {progress.type === 'upload' ? '↑' : '↓'}
                  </span>
                </span>
                {progress.eta > 0 && (
                  <span className="text-[9px] opacity-80">
                    {progress.eta < 60 
                      ? `${progress.eta.toFixed(0)}s left`
                      : `${Math.floor(progress.eta / 60)}:${String(Math.floor(progress.eta % 60)).padStart(2, '0')} left`
                    }
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="flex-shrink-0 text-xs text-muted-foreground">
            {formatFileSize(file.size)}
          </div>
          <div
            className="h-5 w-5 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center cursor-pointer select-none opacity-80 hover:opacity-100 transition-opacity"
            style={{
              position: 'absolute',
              right: '6px',
              top: '50%',
              transform: 'translateY(-50%)',
              zIndex: 9999,
              border: '1px solid white',
              pointerEvents: 'auto',
              touchAction: 'manipulation',
            }}
            onMouseDown={(e) => {
              e.stopPropagation();
              console.log('[Cancel] Mouse down on div');
              
              const fileIdToCancel = cancelFileId || file.fileId;
              
              if (!fileIdToCancel) {
                console.error('[Cancel] No fileId available to cancel');
                alert('Error: Cannot cancel - no file ID found');
                return;
              }
              
              console.log('[Cancel] DIV CLICKED!!! Calling handleCancelFileTransfer with:', fileIdToCancel);
              handleCancelFileTransfer(fileIdToCancel);
            }}
            onTouchStart={(e) => {
              e.stopPropagation();
              console.log('[Cancel] Touch start on div');
              
              const fileIdToCancel = cancelFileId || file.fileId;
              
              if (!fileIdToCancel) {
                console.error('[Cancel] No fileId available to cancel');
                return;
              }
              
              console.log('[Cancel] TOUCH START!!! Calling handleCancelFileTransfer with:', fileIdToCancel);
              handleCancelFileTransfer(fileIdToCancel);
            }}
            title="Cancel transfer"
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </div>
        </div>
      );
    }

    // Compact pill design for completed files - matches the sleek style
    if (file.url || file.data) {
      // Different border colors for sender vs receiver
      const borderColor = message.isOwn ? 'border-blue-200' : 'border-green-200';
      
      const handleDownload = async () => {
        const originalFileName = file.name || 'download';
        
        if (file.url) {
          try {
            // Fetch the file and create a blob to ensure correct filename
            const response = await fetch(file.url);
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = originalFileName; // Force original filename
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            setTimeout(() => {
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
            }, 100);
          } catch (error) {
            // Fallback to direct URL download if fetch fails
            console.warn('Fetch download failed, using direct URL:', error);
            const a = document.createElement('a');
            a.href = file.url;
            a.download = originalFileName;
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            setTimeout(() => {
              document.body.removeChild(a);
            }, 100);
          }
        } else if (file.data) {
          const blob = new Blob([file.data], { type: file.type });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = originalFileName;
          a.style.display = 'none';
          document.body.appendChild(a);
          a.click();
          setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          }, 100);
        }
      };
      
      return (
        <div className={`inline-flex items-center gap-2 px-3 py-2 bg-muted/50 hover:bg-muted/70 rounded-full transition-colors cursor-pointer max-w-[320px] border ${borderColor}`} onClick={handleDownload}>
          <div className="flex-shrink-0 w-4 h-4 text-muted-foreground">
            {getFileIcon(file.type)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{file.name}</p>
          </div>
          <div className="flex-shrink-0 text-xs text-muted-foreground">
            {formatFileSize(file.size)}
          </div>
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-6 w-6 p-0 rounded-full hover:bg-primary/20 hover:text-primary transition-colors flex-shrink-0" 
            onClick={(e) => { e.stopPropagation(); handleDownload(); }}
            title="Download"
          >
            <Download className="h-3.5 w-3.5" />
          </Button>
        </div>
      );
    }
    // If file is missing, incomplete, or 0 bytes, show a warning and hide download
    if ((!file.data && !file.url) || file.size === 0) {
      return (
        <div className="flex items-center gap-3 p-2 border border-border/50 rounded-lg min-w-[250px] bg-muted/60">
          <div className="flex-shrink-0">{getFileIcon(file.type)}</div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{file.name}</p>
            <p className="text-xs text-destructive font-semibold">File not available or transfer incomplete</p>
          </div>
        </div>
      );
    }
    // Restore handleDownload function
    const handleDownload = async () => {
      if (!file.url && !file.data) {
        alert('File data is missing or corrupted.');
        return;
      }
      
      const originalFileName = file.name || 'download';
      
      if (!file.url && file.data) {
        // If file.url is not set but file.data exists, create a Blob and URL
        const blob = new Blob([file.data], { type: file.type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = originalFileName;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }, 100);
      } else if (file.url) {
        try {
          // Fetch the file and create a blob to ensure correct filename
          const response = await fetch(file.url);
          const blob = await response.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = originalFileName; // Force original filename
          a.style.display = 'none';
          document.body.appendChild(a);
          a.click();
          setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          }, 100);
        } catch (error) {
          // Fallback to direct URL download if fetch fails
          console.warn('Fetch download failed, using direct URL:', error);
          const a = document.createElement('a');
          a.href = file.url;
          a.download = originalFileName;
          a.style.display = 'none';
          document.body.appendChild(a);
          a.click();
          setTimeout(() => {
            document.body.removeChild(a);
          }, 100);
        }
      }
    };

    if (message.type === "image" && file.url) {
      // Different border colors for sender vs receiver
      const borderColor = message.isOwn ? 'border-blue-200' : 'border-green-200';
      
      return (
        <div className="space-y-2">
          <div className={`relative rounded-xl overflow-hidden max-w-xs bg-background border ${borderColor}`}>
            <img src={file.url || "/placeholder.svg"} alt={file.name} className="w-full h-auto" />
          </div>
          <div className={`inline-flex items-center gap-2 px-3 py-1.5 bg-muted/50 hover:bg-muted/70 rounded-full transition-colors cursor-pointer max-w-[320px] border ${borderColor}`} onClick={handleDownload}>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate">{file.name}</p>
            </div>
            <div className="flex-shrink-0 text-xs text-muted-foreground">
              {formatFileSize(file.size)}
            </div>
            <Button variant="ghost" size="icon" className="h-5 w-5 p-0 rounded-full hover:bg-primary/20 hover:text-primary transition-colors flex-shrink-0" onClick={(e) => { e.stopPropagation(); handleDownload(); }}>
              <Download className="h-3 w-3" />
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-3 p-2 border border-border/50 rounded-lg min-w-[250px]">
        <div className="flex-shrink-0">{getFileIcon(file.type)}</div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{file.name}</p>
          <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
        </div>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={handleDownload}>
          <Download className="h-4 w-4" />
        </Button>
      </div>
    );
  };

  // SystemMessage component: remove waving hand icon for join/leave/removed
  const SystemMessage = ({ message }: { message: Message }) => {
    const getDisplayName = (id: string) => {
      if (!id) return "Unknown";
      if (id === userName) return "You";
      return id;
    };
    const getSystemMessageContent = () => {
      switch (message.systemType) {
        case "user_joined":
          return `${getDisplayName(message.affectedUser || "")} joined the room.`;
        case "user_left":
          return `${getDisplayName(message.affectedUser || "")} left the room.`;
        case "user_removed":
          return `${getDisplayName(message.affectedUser || "")} was removed from the room.`;
        case "user_added":
          return `${getDisplayName(message.affectedUser || "")} was added to the room.`;
        case "group_created":
          return `Group created by ${getDisplayName(message.actionBy || "")}.`;
        case "group_renamed":
          return `Group renamed by ${getDisplayName(message.actionBy || "")}.`;
        case "call_rejected":
          return `Call to ${getDisplayName(message.affectedUser || "")} was rejected.`;
        default:
          return message.content;
      }
    };
    return (
      <div className="text-xs text-muted-foreground text-center my-2">
        {getSystemMessageContent()}
      </div>
    );
  };

  const MessageReactions = ({ message }: { message: Message }) => {
    if (!message.reactions || message.reactions.length === 0) return null

    return (
      <div className="flex flex-wrap gap-1 mt-1">
        {message.reactions.map((reaction) => (
          <motion.button
            key={reaction.emoji}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => handleReaction(message.id, reaction.emoji)}
            className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs border transition-colors ${
              reaction.users.includes("You")
                ? "bg-primary/20 border-primary/30 text-primary"
                : "bg-muted/50 border-border/50 hover:bg-muted"
            }`}
          >
            <span>{reaction.emoji}</span>
            <span>{reaction.count}</span>
          </motion.button>
        ))}
      </div>
    )
  }

  const ReactionPicker = ({ messageId }: { messageId: string }) => {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.8 }}
        className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-50"
      >
        <Card className="p-2 bg-background/95 backdrop-blur-sm border-border/50 flex items-center gap-1">
          {quickReactions.map((emoji) => (
            <motion.button
              key={emoji}
              whileHover={{ scale: 1.2 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => handleReaction(messageId, emoji)}
              className="p-2 rounded-full hover:bg-accent text-lg"
            >
              {emoji}
            </motion.button>
          ))}
          <Button variant="ghost" size="sm" onClick={() => setShowEmojiPicker(true)} className="h-8 w-8 p-0">
            <Plus className="h-4 w-4" />
          </Button>
        </Card>
      </motion.div>
    )
  }

  // Simulate group activity
  // Remove simulateGroupActivity and its useEffect

  // Add this to simulate random group activities (optional)
  // useEffect(() => {
  //   if (chatType === "room") {
  //     const interval = setInterval(() => {
  //       if (Math.random() < 0.1) {
  //         // 10% chance every 30 seconds
  //         // simulateGroupActivity()
  //       }
  //     }, 30000)

  //     return () => clearInterval(interval)
  //   }
  // }, [chatType])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewMessage(e.target.value)
    rtcRef.current?.sendTyping()
  }

  // --- Audio Call Handlers ---
  const handleStartCall = async (type: "audio" | "video") => {
    // Reset video state for new calls
    setIsVideoEnabled(true);
    setActiveCall({ type, isIncoming: false });
    setCallAccepted(false); // Reset before sending
    
    // Start capturing media stream immediately when initiating the call
    if (type === 'video') {
      await rtcRef.current?.startVideoCall?.('direct');
    } else {
      await rtcRef.current?.startAudioCall?.('direct');
    }
    
    rtcRef.current?.sendCall(type);
  };
  const handleAcceptCall = async () => {
    if (activeCall) {
      setActiveCall({ ...activeCall, isIncoming: false });
      setCallAccepted(true); // Ensure callee transitions to in-call UI
      // Send call-accepted to the caller using callerId
      if (activeCall.callerId) {
        rtcRef.current?.sendCallAccepted?.(activeCall.callerId);
      }
      
      // For incoming calls, start capturing media stream when accepting
      if (activeCall.isIncoming) {
        if (activeCall.type === 'video') {
          await rtcRef.current?.startVideoCall?.('direct'); // Crystal clear quality for 1:1 video calls
        } else {
          await rtcRef.current?.startAudioCall?.('direct'); // Crystal clear quality for 1:1 audio calls
        }
      }
    }
  };
  const handleEndCall = () => {
    // Send end signal first
    rtcRef.current?.sendCallEnd?.();
    
    // Clean up state
    setActiveCall(null);
    setCallAccepted(false);
    
    // Clean up all media streams
    cleanupMediaStreams();
  };
  const handleMuteToggle = () => {
    rtcRef.current?.toggleMute?.();
  };

  // Room call handlers
  const handleStartRoomCall = (type: "audio" | "video") => {
    // Prevent starting a new call if one is already active
    if (roomCallActive || roomCallIncoming || roomCallAccepted) {
      console.log('[Room Call] Call already active, ignoring start request');
      return;
    }
    
    console.log('[Room Call] Starting room call:', type, 'in room:', chatId, 'user:', userName);
    setRoomCallActive(true);
    setRoomCallIncoming(false);
    setRoomCallType(type);
    setShowParticipantsOnly(false); // Don't use participants-only mode
    setRoomCallStarted(false); // Call hasn't started yet
    setRoomCallParticipants(roomUsers);
    // Don't start the actual call yet - wait for user to click "Start Call"
  };

  const handleStartActualRoomCall = async () => {
    // Prevent starting if call is already started
    if (roomCallStarted) {
      console.log('[Room Call] Call already started, ignoring start request');
      return;
    }
    
    console.log('[Room Call] Starting actual room call:', roomCallType, 'in room:', chatId, 'user:', userName);
    
    // Start capturing media stream immediately when starting the room call
    if (roomCallType === 'video') {
      await rtcRef.current?.startVideoCall?.('room');
    } else {
      await rtcRef.current?.startAudioCall?.('room');
    }
    
    rtcRef.current?.sendRoomCall(roomCallType);
    setRoomCallStarted(true); // Now the call has actually started
    setRoomCallParticipants([userName]);
  };

  const handleAcceptRoomCall = async () => {
    setRoomCallAccepted(true);
    setRoomCallIncoming(false);
    rtcRef.current?.sendRoomCallAccepted();
    
    // For incoming calls, start capturing media stream when accepting
    if (roomCallIncoming) {
      if (roomCallType === 'video') {
        await rtcRef.current?.startVideoCall('room'); // Messenger/WhatsApp quality for room video calls
      } else {
        await rtcRef.current?.startAudioCall('room'); // Messenger/WhatsApp quality for room audio calls
      }
    }
  };

  const handleEndRoomCall = () => {
    console.log('[Room Call] User ending room call');
    rtcRef.current?.sendRoomCallEnd();
    rtcRef.current?.stopAudioCall();
    rtcRef.current?.stopVideoCall();
    setRoomCallActive(false);
    setRoomCallIncoming(false);
    setRoomCallAccepted(false);
    setRoomCallStarted(false);
    setRoomCallParticipants([]);
    setRoomCallRejectedUsers([]);
    setRoomCallLeftUsers([]);
  };

  const handleDeclineRoomCall = () => {
    console.log('[Room Call] User declining room call');
    if (showParticipantsOnly) {
      // If showing participants only, just close the popup
      setRoomCallActive(false);
      setShowParticipantsOnly(false);
      setRoomCallParticipants([]);
    } else {
      // If in actual call, send rejection
      rtcRef.current?.sendRoomCallRejected();
      setRoomCallActive(false);
      setRoomCallIncoming(false);
      setRoomCallAccepted(false);
      setRoomCallStarted(false);
      setRoomCallParticipants([]);
      setRoomCallRejectedUsers([]);
      setRoomCallLeftUsers([]);
      // Stop audio if it was started
      rtcRef.current?.stopAudioCall();
      rtcRef.current?.stopVideoCall();
    }
  };

  const handleJoinRoomCall = () => {
    console.log('[Room Call] User joining existing room call');
    rtcRef.current?.sendRoomCallJoin();
    setRoomCallAccepted(true);
    setRoomCallIncoming(false);
    rtcRef.current?.startAudioCall('room'); // Messenger/WhatsApp quality for room calls
  };

  function handleCancelFileTransfer(fileId: string) {
    console.log('[Cancel] handleCancelFileTransfer called with fileId:', fileId);
    
    // Show immediate visual feedback
    toast({
      title: "Canceling transfer...",
      description: "Stopping file transfer",
      duration: 2000,
    });
    
    // Cancel the WebRTC transfer
    if (rtcRef.current?.cancelFileTransfer) {
      console.log('[Cancel] Calling rtcRef.current.cancelFileTransfer');
      rtcRef.current.cancelFileTransfer(fileId);
    } else {
      console.error('[Cancel] rtcRef.current.cancelFileTransfer is not available');
    }
    
    // Clean up progress state first
    setFileProgress((prev) => {
      const updated = { ...prev };
      delete updated[fileId];
      console.log('[Cancel] Cleaned up progress state for fileId:', fileId);
      return updated;
    });
    
    // Update the UI immediately
    setMessages((prev) => prev.map(m => {
      if (m.file && m.file.fileId === fileId) {
        console.log('[Cancel] Updating message status to canceled for fileId:', fileId);
        return {
          ...m,
          file: { ...m.file, status: 'canceled' },
          content: 'File transfer canceled',
        } as Message;
      }
      return m;
    }));
    
    console.log('[Cancel] handleCancelFileTransfer completed');
    
    // Show completion feedback
    setTimeout(() => {
      toast({
        title: "Transfer canceled",
        description: "File transfer has been stopped",
        variant: "destructive",
        duration: 3000,
      });
    }, 500);
  }

  function handleRetryFileTransfer(message: Message) {
    if (!message.file) return;
    // If file data is missing, prompt user to re-select
    if (!message.file.data) {
      setRetryingFile({ fileId: message.file.fileId!, messageId: message.id });
      toast({ title: "Select file to retry", description: "Please re-select the file to retry transfer.", duration: 4000 });
      fileInputRef.current?.click();
      return;
    }
    // Generate a new fileId for the retry to avoid conflicts
    const newFileId = `${message.file.name}-${message.file.size}-${Date.now()}-${Math.random()}`;
    setMessages((prev) => prev.map(m => {
      if (m.file && m.file.fileId === message.file!.fileId) {
        return {
          ...m,
          file: { 
            ...m.file, 
            status: 'in-progress', 
            fileId: newFileId // Use new fileId for retry
          },
          content: `Retrying ${m.file.name}`,
        } as Message;
      }
      return m;
    }));
    setFileProgress((prev) => {
      const updated = { ...prev };
      delete updated[message.file!.fileId!];
      return updated;
    });
    rtcRef.current?.retryFileTransfer(message.file.fileId!);
    if (message.isOwn && message.file) {
      if (message.file.data && message.file.name && message.file.type) {
        const blob = new Blob([message.file.data], { type: message.file.type });
        const file = new File([blob], message.file.name, { type: message.file.type });
        rtcRef.current?.sendFile(file, newFileId, message.id);
      }
    }
  }

  function isRealDisplayName(name: string | undefined) {
    if (!name) return false;
    // Exclude random user_xxxxxxxx
    return !/^user_[a-z0-9]{8}$/.test(name);
  }

  // Fetch adminId on mount for room
  useEffect(() => {
    if (chatType === 'room') {
      // Fetch room meta to get adminId
      const ws = new window.WebSocket(getSignalingUrl());
      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'get-room-meta', roomId: chatId }));
      };
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'room-meta' && data.roomId === chatId) {
          setAdminId(data.adminId);
          ws.close();
        }
      };
      ws.onerror = () => ws.close();
    }
  }, [chatType, chatId]);

  // Listen for admin-changed, user-kicked, kicked events and WebSocket close
  useEffect(() => {
    if (chatType !== 'room') return;
    const ws = rtcRef.current?.ws;
    if (!ws) return;
    const handler = (event: MessageEvent) => {
      const data = JSON.parse(event.data);
      if (data.type === 'admin-changed' && data.newAdminId) {
        setAdminId(data.newAdminId);
      }
      if (data.type === 'user-kicked') {
        // System message for all users in the room - use the same messages system as join/leave
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now().toString() + "_removed",
            sender: "System",
            content: "",
            timestamp: new Date(),
            isOwn: false,
            type: "system",
            systemType: "user_removed",
            affectedUser: getDisplayName(data.userId),
          },
        ]);
      }
      if (data.type === 'user-kicked' && data.userId === userId) {
        toast({ title: 'Removed from room', description: 'You have been removed from the room by the admin.' });
        setKicked(true);
        setTimeout(() => onClose(), 1000);
      }
      if (data.type === 'kicked' && data.roomId === chatId) {
        toast({ title: 'Removed from room', description: 'You have been removed from the room by the admin.' });
        setKicked(true);
        rtcRef.current?.leave?.();
        setTimeout(() => onClose(), 1000);
      }
    };
    const closeHandler = () => {
      // Only leave the chat if the user was actually kicked
      if (kicked) {
        rtcRef.current?.leave?.();
        setTimeout(() => onClose(), 100);
      } else {
      }
    };
    ws.addEventListener('message', handler);
    ws.addEventListener('close', closeHandler);
    return () => {
      ws.removeEventListener('message', handler);
      ws.removeEventListener('close', closeHandler);
    };
  }, [chatType, chatId, userName, onClose, kicked]);

  // Add kick handler
  const handleKickUser = (user: string) => {
    if (!adminId || user === userId) return;
    console.log('Kicking userId:', user, 'from room:', chatId, 'by admin:', userId);
    // Find the userId for the given display name (user)
    // In this codebase, roomUsers contains userIds, so just use user directly
    rtcRef.current?.ws?.send(
      JSON.stringify({ type: 'kick', roomId: chatId, userId: userId, targetId: user })
    );
  };

  // Get userId for admin logic (rooms)
  const userId = typeof window !== 'undefined' ? localStorage.getItem('dropsync_userid') : null;

  // Helper to fetch latest room meta (adminId)
  const fetchRoomMeta = () => {
    const ws = rtcRef.current?.ws;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'get-room-meta', roomId: chatId }));
    }
  };

  // Listen for room meta response and update adminId
  useEffect(() => {
    if (chatType !== 'room') return;
    const ws = rtcRef.current?.ws;
    if (!ws) return;
    const handler = (event: MessageEvent) => {
      const data = JSON.parse(event.data);
      if (data.type === 'room-meta' && data.roomId === chatId) {
        setAdminId(data.adminId);
      }
    };
    ws.addEventListener('message', handler);
    return () => ws.removeEventListener('message', handler);
  }, [chatType, chatId]);

  // Add this useEffect after the messages state is defined
  useEffect(() => {
    setMessages([]); // Clear messages when switching rooms/chats
  }, [chatId]);

  // When a new incoming call is received, reset callAccepted to false
  useEffect(() => {
    if (activeCall && activeCall.isIncoming) {
      setCallAccepted(false);
    }
  }, [activeCall]);

  // --- Missed Call Timeout ---
  useEffect(() => {
    // Start missed call timer for incoming calls
    if (activeCall && activeCall.isIncoming && !callAccepted) {
      if (missedCallTimeoutRef.current) clearTimeout(missedCallTimeoutRef.current);
      missedCallTimeoutRef.current = setTimeout(() => {
        // Auto-close call popup
        setActiveCall(null);
        setCallAccepted(false);
        // Send call-missed event to caller
        if (activeCall.callerId) {
          rtcRef.current?.sendCallMissed?.(activeCall.callerId);
        }
        // Add missed call message for callee
        setMessages((prev: Message[]) => [
          ...prev,
          {
            id: Date.now().toString() + "_missed",
            sender: "System",
            content: `You missed a call from ${activeCall.callerId || 'Unknown'}`,
            timestamp: new Date(),
            isOwn: false,
            type: "system",
            systemType: "missed_call",
            affectedUser: activeCall.callerId || 'Unknown',
          } as Message,
        ]);
      }, 35000);
    } else {
      if (missedCallTimeoutRef.current) {
        clearTimeout(missedCallTimeoutRef.current);
        missedCallTimeoutRef.current = null;
      }
    }
    // Cleanup on unmount
    return () => {
      if (missedCallTimeoutRef.current) {
        clearTimeout(missedCallTimeoutRef.current);
        missedCallTimeoutRef.current = null;
      }
    };
  }, [activeCall, callAccepted]);

  // Comprehensive media cleanup function
  const cleanupMediaStreams = () => {
    console.log('[Chat Interface] Cleaning up all media streams...');
    
    // Stop all local streams
    if (localAudioStream) {
      localAudioStream.getTracks().forEach(track => {
        console.log(`[Cleanup] Stopping local audio track: ${track.label}`);
        track.stop();
      });
    }
    
    if (localVideoStream) {
      localVideoStream.getTracks().forEach(track => {
        console.log(`[Cleanup] Stopping local video track: ${track.label}`);
        track.stop();
      });
    }
    
    // Clear all stream states
    setLocalAudioStream(null);
    setRemoteAudioStreams({});
    setLocalVideoStream(null);
    setRemoteVideoStream(null);
    setRemoteVideoStreams({});
    setIsVideoEnabled(true); // Reset for next call
    
    // Stop WebRTC media
    rtcRef.current?.stopAudioCall?.();
    rtcRef.current?.stopVideoCall?.();
  };

  const handleDeclineCall = () => {
    setActiveCall(null);
    setCallAccepted(false);
    
    // Add system message for callee: 'You rejected a call from [caller]'
    setMessages((prev: Message[]) => [
      ...prev,
      {
        id: Date.now().toString() + '_rejected',
        sender: 'System',
        content: `You rejected a call from ${activeCall?.callerId || chatName}`,
        timestamp: new Date(),
        isOwn: true,
        type: 'system',
        systemType: 'call_rejected',
        affectedUser: activeCall?.callerId || chatName,
      } as Message,
    ]);
    
    rtcRef.current?.sendCallRejected?.(activeCall?.callerId || chatName);
    rtcRef.current?.sendCallEnd?.();
    
    // Clean up any media that might have been started
    cleanupMediaStreams();
  };

  if (kicked) {
    console.log('[UI] Rendered kicked message');
    rtcRef.current?.leave?.();
    setTimeout(() => onClose(), 100);
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <span className="text-2xl font-bold mb-2">You have been removed from the room.</span>
        <span className="text-muted-foreground">You can rejoin if invited again.</span>
      </div>
    );
  }

  // Determine room or direct chat avatar for header
  let headerAvatarUrl: string | undefined = undefined;
  if (chatType === 'room') {
    // Check if this is a hardcoded room first
    const roomNameLower = chatName.toLowerCase();
    if (roomNameLower === 'retro realm' || roomNameLower === 'retro-realm') {
      headerAvatarUrl = '/room-avatars/retro-realm.png';
    } else if (roomNameLower === 'sanctuary') {
      headerAvatarUrl = '/room-avatars/sanctuary.png';
    } else {
      // Use auto-generated room avatar for other rooms
      let hash = 0;
      for (let i = 0; i < chatId.length; i++) hash = chatId.charCodeAt(i) + ((hash << 5) - hash);
      const idx = Math.abs(hash) % AVATARS.length;
      headerAvatarUrl = AVATARS[idx];
    }
  } else if (chatType === 'direct' && (chatName === 'Mosabbir' || chatName === 'Mosabbir Maruf')) {
    headerAvatarUrl = '/admin.png';
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={`bg-background flex flex-col relative ${
        isMobile ? 'chat-container' : 'min-h-screen'
      }`}
      style={{
        height: isMobile ? '100dvh' : undefined,
        minHeight: isMobile ? '100dvh' : '100vh',
      }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag Overlay */}
      <AnimatePresence>
        {isDragOver && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-primary/10 backdrop-blur-sm flex items-center justify-center"
          >
            <motion.div
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.8 }}
              className="bg-background/95 backdrop-blur-sm border-2 border-dashed border-primary rounded-2xl p-12 text-center shadow-2xl"
            >
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.6 }}
                className="space-y-6"
              >
                <div className="w-40 h-40 mx-auto opacity-80">
                  <img
                    src="/illustrations/file-upload.png"
                    alt="File upload"
                    className="w-full h-full object-contain drop-shadow-lg"
                  />
                </div>
                <div className="space-y-3">
                  <h3 className="text-2xl font-semibold text-foreground">Drop files here</h3>
                  <p className="text-muted-foreground text-lg">Release to attach files to your message</p>
                </div>
              </motion.div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hidden file input */}
      <input ref={fileInputRef} type="file" multiple onChange={handleFileSelect} className="hidden" accept={fileAccept} />

      {/* Header */}
      <motion.header
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="border-b border-border/40 backdrop-blur-sm bg-background/80 sticky top-0 z-50"
      >
        <div className="container mx-auto px-4 py-3 sm:py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
            <Button variant="ghost" size="sm" onClick={onClose} className="shrink-0">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="relative shrink-0">
              <Avatar className="h-8 w-8">
                <AvatarImage
                  src={headerAvatarUrl || getAvatarForUser(chatName.split("'")[0]) || "/placeholder.svg"}
                  alt={chatName}
                />
                <AvatarFallback className="text-sm">{getInitials(chatName)}</AvatarFallback>
              </Avatar>
              {chatType === 'direct' && (
                <span
                  className={`absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-background ${
                    chatType === 'direct' && (chatName === 'Mosabbir Maruf' || chatName === 'Mosabbir')
                      ? 'bg-green-500'
                      : peerStatus?.isOnline
                        ? 'bg-green-500'
                        : 'bg-gray-400'
                  }`}
                />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="font-semibold text-sm sm:text-base truncate">
                {chatName}
                {chatName === 'Mosabbir Maruf' && (
                  <img
                    src="/verified.png"
                    alt="Verified"
                    style={{ width: 16, height: 16, display: 'inline', marginLeft: 4, verticalAlign: 'middle', pointerEvents: 'none', userSelect: 'none' }}
                    draggable={false}
                  />
                )}
              </h1>
              <div className="flex items-center gap-1 sm:gap-2 min-h-[16px] sm:min-h-[20px]">
                {chatType === 'room' ? (
                  <>
                    <Badge variant="secondary" className="text-xs">Room</Badge>
                    <span className="text-xs text-muted-foreground hidden sm:inline">{roomUsers.length} member{roomUsers.length !== 1 ? 's' : ''}</span>
                    <span className="text-xs text-muted-foreground sm:hidden">{roomUsers.length}</span>
                    <Dialog open={isMembersDialogOpen} onOpenChange={(open) => {
                      setIsMembersDialogOpen(open);
                      if (open) fetchRoomMeta();
                    }}>
                      <DialogTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-5 w-5 sm:h-6 sm:w-6 p-0" title="View all members">
                          <Users className="h-3 w-3 sm:h-4 sm:w-4" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-xs">
                        <DialogHeader>
                          <DialogTitle>Room Members</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-2 max-h-64 overflow-y-auto">
                          {roomUsers.map((user) => {
                            const isSelf = user === userId;
                            const isAdmin = adminId === user;
                            // Only show kick icon if: current user is admin, the entry is not self, and the entry is not the admin
                            const showKick = adminId === userId && !isSelf && !isAdmin;
                            return (
                              <div key={user} className="flex items-center gap-3 p-2 rounded hover:bg-muted">
                                <Avatar className="h-7 w-7">
                                  <AvatarImage src={getAvatarForUser(user)} alt={getDisplayName(user)} />
                                  <AvatarFallback className="text-xs">{getInitials(getDisplayName(user))}</AvatarFallback>
                                </Avatar>
                                <span className="text-sm flex items-center gap-1">
                                  {getDisplayName(user)}
                                  {isAdmin && <Crown className="h-4 w-4 text-yellow-500" />}
                                </span>
                                {showKick && (
                                  <button className="ml-auto p-1 rounded hover:bg-destructive/20" title="Kick user" onClick={() => handleKickUser(user)}>
                                    <UserMinus className="h-5 w-5 text-destructive" />
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </DialogContent>
                    </Dialog>
                  </>
                ) : (
                  <span className={`text-xs font-medium ${chatType === 'direct' && (chatName === 'Mosabbir Maruf' || chatName === 'Mosabbir') ? 'text-green-600' : peerStatus?.isOnline ? 'text-green-600' : 'text-muted-foreground'}`}>
                    {chatType === 'direct' && (chatName === 'Mosabbir Maruf' || chatName === 'Mosabbir')
                      ? 'Active now'
                      : peerStatus?.isOnline
                        ? 'Active now'
                        : peerStatus?.lastSeen
                          ? (() => {
                              const ago = Math.floor((Date.now() - peerStatus.lastSeen) / 1000);
                              if (ago < 60) return 'Disconnected';
                              if (ago < 3600) return `Active ${Math.floor(ago / 60)}m ago`;
                              return `Active ${Math.floor(ago / 3600)}h ago`;
                            })()
                          : 'Disconnected'}
                  </span>
                )}
              </div>
            </div>
          </div>
          
          {/* Room ID and Password - Hidden on mobile */}
          {chatType === 'room' && (
            <div className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground">
              <span className="font-mono">{chatId}</span>
              <Button
                size="icon"
                variant="ghost"
                className="h-5 w-5 p-0"
                title="Copy Room ID"
                onClick={async () => {
                  console.log('🔄 Copying room ID:', chatId);
                  const success = await copyWithFeedback(chatId, 
                    () => {
                      console.log('✅ Room ID copied successfully');
                      toast({
                        title: "Room ID copied",
                        description: "Room ID has been copied to clipboard",
                      });
                    },
                    () => {
                      console.log('❌ Failed to copy room ID');
                      toast({
                        title: "Copy failed",
                        description: "Failed to copy room ID to clipboard",
                        variant: "destructive",
                      });
                    }
                  );
                  console.log('Copy result:', success);
                }}
              >
                <Copy className="h-3 w-3" />
              </Button>
              {roomPassword && (
                <>
                  <span className="ml-2 font-mono">Password: {roomPassword}</span>
                  <Button size="icon" variant="ghost" className="h-5 w-5 p-0" title="Copy Password"                   onClick={async () => {
                    console.log('🔄 Copying password:', roomPassword);
                    const success = await copyWithFeedback(roomPassword, 
                      () => {
                        console.log('✅ Password copied successfully');
                        toast({
                          title: "Password copied",
                          description: "Password has been copied to clipboard",
                        });
                      },
                      () => {
                        console.log('❌ Failed to copy password');
                        toast({
                          title: "Copy failed",
                          description: "Failed to copy password to clipboard",
                          variant: "destructive",
                        });
                      }
                    );
                    console.log('Copy result:', success);
                  }}>
                    <Copy className="h-3 w-3" />
                  </Button>
                </>
              )}
            </div>
          )}
          
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            {chatType === 'direct' && (
              <>
                <Button variant="ghost" size="sm" onClick={() => handleStartCall("audio")} className="h-8 w-8 sm:h-9 sm:w-9 p-0">
                  <Phone className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => handleStartCall("video")} className="h-8 w-8 sm:h-9 sm:w-9 p-0">
                  <Video className="h-4 w-4" />
                </Button>
              </>
            )}
            {chatType === 'room' && (
              <>
                <Button variant="ghost" size="sm" onClick={() => handleStartRoomCall("audio")} className="h-8 w-8 sm:h-9 sm:w-9 p-0">
                  <Phone className="h-4 w-4" />
                </Button>
              </>
            )}
            {/* Leave/Disconnect menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 sm:h-9 sm:w-9 p-0">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {chatType === "room" && (
                  <>
                    <DropdownMenuItem onClick={handleCopyRoomId}>
                      <Copy className="h-4 w-4 mr-2" />
                      Copy Room ID
                    </DropdownMenuItem>
                    {roomPassword && (
                      <DropdownMenuItem onClick={handleCopyPassword}>
                        <Copy className="h-4 w-4 mr-2" />
                        Copy Password
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                  </>
                )}
                {chatType === "room" ? (
                  <DropdownMenuItem onClick={handleLeaveRoom} className="text-destructive">
                    <LogOut className="h-4 w-4 mr-2" />
                    Leave Room
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onClick={handleDisconnect}>
                    <PhoneOff className="h-4 w-4 mr-2" />
                    Disconnect
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </motion.header>

      {/* Messages */}
      <div className={`flex-1 overflow-y-auto p-4 ${isMobile ? 'pb-4' : ''}`}>
        <div className="max-w-4xl mx-auto space-y-4">
          {/* Empty State for No Messages */}
          {messages.length === 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center justify-center py-16 text-center max-w-md mx-auto"
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2, duration: 0.6 }}
                className="relative mb-8"
              >
                <div className="w-40 h-40 mx-auto opacity-70">
                  <img
                    src="/illustrations/chat-empty.png"
                    alt="No messages"
                    className="w-full h-full object-contain drop-shadow-sm"
                  />
                </div>
                {/* Decorative elements */}
                <div className="absolute -top-2 -left-2 w-4 h-4 bg-primary/10 rounded-full blur-sm"></div>
                <div className="absolute -bottom-2 -right-2 w-3 h-3 bg-primary/5 rounded-full blur-sm"></div>
              </motion.div>
              
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4, duration: 0.6 }}
                className="space-y-3"
              >
                <h3 className="text-xl font-semibold text-foreground">No messages yet</h3>
                <p className="text-muted-foreground text-sm leading-relaxed max-w-sm">
                  {chatType === 'direct' 
                    ? `Start a conversation with ${chatName} by sending a message.`
                    : `Be the first to send a message in ${chatName}!`
                  }
                </p>
              </motion.div>
            </motion.div>
          )}
          
          <AnimatePresence>
            {messages.map((message, index) => (
              <motion.div
                key={`${message.id}-${index}-${message.file?.fileId || message.timestamp.getTime()}`}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className={
                  message.type === "system" ? "w-full" : `flex gap-3 ${message.isOwn ? "justify-end" : "justify-start"}`
                }
              >
                {message.type === "system" ? (
                  <SystemMessage message={message} />
                ) : (
                  <>
                    {!message.isOwn ? (
                      <div className="flex flex-row items-start gap-2 mb-1">
                        <Avatar className="h-8 w-8 mt-1">
                          <AvatarImage src={getAvatarForUser(message.sender)} alt={getDisplayName(message.sender)} />
                          <AvatarFallback className="text-sm">{getInitials(getDisplayName(message.sender))}</AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col">
                          <p className="text-sm font-medium text-muted-foreground">{getDisplayName(message.sender)}</p>
                          <div className={`max-w-xs lg:max-w-md relative`}>
                            <div className="relative group">
                              {message.type === "file" || message.type === "image" ? (
                                // File messages use light background for both sender and receiver
                                <div className="bg-transparent" onDoubleClick={() => setShowReactionPicker(message.id)}>
                                  <FileMessage message={message} />
                                </div>
                              ) : (
                                <Card
                                  className={`p-3 bg-muted`}
                                  onDoubleClick={() => setShowReactionPicker(message.id)}
                                >
                                  {message.type === "voice" ? (
                                    <VoiceMessage message={message} />
                                  ) : (
                                    message.sender === 'Mosabbir Maruf' && typeof message.content === 'string' && message.content.includes('<a href=') ? (
                                      <span className="text-sm break-words overflow-wrap-break-word" dangerouslySetInnerHTML={{ __html: message.content }} />
                                    ) : (
                                      <p className="text-sm break-words overflow-wrap-break-word">{message.content}</p>
                                    )
                                  )}
                                </Card>
                              )}
                              {/* Quick reaction button */}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setShowReactionPicker(showReactionPicker === message.id ? null : message.id)}
                                className="absolute -right-2 top-1/2 -translate-y-1/2 h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity bg-background border border-border/50 hover:bg-accent"
                              >
                                <Smile className="h-3 w-3" />
                              </Button>
                              {/* Reaction picker */}
                              <AnimatePresence>
                                {showReactionPicker === message.id && <ReactionPicker messageId={message.id} />}
                              </AnimatePresence>
                            </div>
                            {/* Message reactions */}
                            <MessageReactions message={message} />
                            <p className="text-xs text-muted-foreground mt-1">{formatTime(message.timestamp)}</p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-3 justify-end">
                        <div className={`max-w-xs lg:max-w-md order-1 relative`}>
                          <div className="relative group">
                            {message.type === "file" || message.type === "image" ? (
                              // File messages use light background for both sender and receiver
                              <div className="bg-transparent" onDoubleClick={() => setShowReactionPicker(message.id)}>
                                <FileMessage message={message} />
                              </div>
                            ) : (
                              <Card
                                className={`p-3 bg-primary text-primary-foreground`}
                                onDoubleClick={() => setShowReactionPicker(message.id)}
                              >
                                {message.type === "voice" ? (
                                  <VoiceMessage message={message} />
                                ) : (
                                  message.sender === 'Mosabbir Maruf' && typeof message.content === 'string' && message.content.includes('<a href=') ? (
                                    <span className="text-sm break-words overflow-wrap-break-word" dangerouslySetInnerHTML={{ __html: message.content }} />
                                  ) : (
                                    <p className="text-sm break-words overflow-wrap-break-word">{message.content}</p>
                                  )
                                )}
                              </Card>
                            )}
                            {/* Quick reaction button */}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setShowReactionPicker(showReactionPicker === message.id ? null : message.id)}
                              className="absolute -right-2 top-1/2 -translate-y-1/2 h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity bg-background border border-border/50 hover:bg-accent"
                            >
                              <Smile className="h-3 w-3" />
                            </Button>
                            {/* Reaction picker */}
                            <AnimatePresence>
                              {showReactionPicker === message.id && <ReactionPicker messageId={message.id} />}
                            </AnimatePresence>
                          </div>
                          {/* Message reactions */}
                          <MessageReactions message={message} />
                          <p className="text-xs text-muted-foreground mt-1">{formatTime(message.timestamp)}</p>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Typing Indicator */}
          <AnimatePresence>
            {isTyping && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="flex gap-3"
              >
                {chatType === 'room' && typingUserIds.length > 0 ? (
                  <>
                    <div className="flex items-center gap-2 mt-1">
                      {typingUserIds.map((id) => (
                        <Avatar key={id} className="h-8 w-8 mt-1">
                          <AvatarImage src={getAvatarForUser(id)} alt={getDisplayName(id)} />
                          <AvatarFallback className="text-sm">{getInitials(getDisplayName(id))}</AvatarFallback>
                        </Avatar>
                      ))}
                      <Card className="p-3 bg-muted mt-4 flex flex-col items-start">
                        <span className="text-sm text-muted-foreground mb-1">
                          {typingUserIds.map(getDisplayName).join(', ')} {typingUserIds.length === 1 ? 'is' : 'are'} typing...
                        </span>
                        <div className="flex gap-1 mt-1">
                          <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 1, repeat: Number.POSITIVE_INFINITY, delay: 0 }} className="w-2 h-2 bg-muted-foreground rounded-full" />
                          <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 1, repeat: Number.POSITIVE_INFINITY, delay: 0.2 }} className="w-2 h-2 bg-muted-foreground rounded-full" />
                          <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 1, repeat: Number.POSITIVE_INFINITY, delay: 0.4 }} className="w-2 h-2 bg-muted-foreground rounded-full" />
                        </div>
                      </Card>
                    </div>
                  </>
                ) : (
                  // Direct chat or fallback
                  <>
                    <Avatar className="h-8 w-8 mt-1">
                      <AvatarImage src={getAvatarForUser(chatName)} alt={chatName} />
                      <AvatarFallback className="text-sm">{getInitials(chatName)}</AvatarFallback>
                    </Avatar>
                    <Card className="p-3 bg-muted">
                      <div className="flex gap-1">
                        <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 1, repeat: Number.POSITIVE_INFINITY, delay: 0 }} className="w-2 h-2 bg-muted-foreground rounded-full" />
                        <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 1, repeat: Number.POSITIVE_INFINITY, delay: 0.2 }} className="w-2 h-2 bg-muted-foreground rounded-full" />
                        <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 1, repeat: Number.POSITIVE_INFINITY, delay: 0.4 }} className="w-2 h-2 bg-muted-foreground rounded-full" />
                      </div>
                    </Card>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
          {/* Only show 'Typing...' text for direct chats */}
          {isTyping && chatType === 'direct' ? (
            <div className="text-xs text-muted-foreground px-2 pb-2">Typing...</div>
          ) : null}



          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Message Input */}
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className={`border-t border-border/40 p-2 sm:p-3 relative ${
          isMobile ? 'mt-auto' : ''
        }`}
        style={{
          paddingBottom: isMobile ? 'calc(0.5rem + env(safe-area-inset-bottom, 0px))' : undefined,
          position: 'relative',
        }}
      >
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-2 sm:gap-3">
            {/* File Attachment Button */}
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setShowFileAttachment(!showFileAttachment)}
                className="h-9 w-9 sm:h-9 sm:w-9 p-0 rounded-full bg-muted/50 hover:bg-muted transition-colors"
              >
                <Paperclip className="h-4 w-4 sm:h-4 sm:w-4" />
              </Button>
            </motion.div>

            {/* Message Input Container */}
            <div className="flex-1 relative">
              <Input
                ref={messageInputRef}
                value={newMessage}
                onChange={handleInputChange}
                placeholder={isMobile ? "Message..." : "Type a message..."}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                className={`pr-10 rounded-full border transition-all duration-300 ${
                  isMobile 
                    ? `h-12 text-base bg-background/80 backdrop-blur-sm border-border/60 focus:border-primary/60 focus:ring-1 focus:ring-primary/20 focus:scale-[1.02] focus:shadow-lg ${newMessage.trim() ? 'border-primary/40 shadow-sm' : ''}` 
                    : 'h-10'
                }`}
                onFocus={() => {
                  if (isMobile && !isSendingMessage) {
                    setTimeout(() => {
                      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
                    }, 100);
                  }
                }}
                style={{
                  touchAction: 'manipulation'
                }}
              />
            </div>

            {/* Emoji Button */}
            <Button
              variant="ghost"
              size="sm"
              className="h-10 w-10 sm:h-8 sm:w-8 p-0 rounded-full hover:bg-muted/80 transition-colors z-20 bg-background/80 backdrop-blur-sm"
              style={{
                pointerEvents: 'auto',
                touchAction: 'manipulation'
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setShowEmojiPicker(!showEmojiPicker);
              }}
              type="button"
            >
              <Smile className="h-4 w-4" />
            </Button>

            {/* Send/Voice Button */}
            {newMessage.trim() ? (
              <motion.div 
                whileHover={{ scale: 1.05 }} 
                whileTap={{ scale: 0.95 }}
                className="flex-shrink-0"
              >
                <Button 
                  onClick={handleSendMessage} 
                  size="sm"
                  className="h-10 w-10 sm:h-10 sm:w-10 p-0 rounded-full bg-primary hover:bg-primary/90 transition-all duration-300 shadow-lg hover:shadow-xl hover:scale-105"
                >
                  <Send className="h-4 w-4 sm:h-4 sm:w-4 text-primary-foreground" />
                </Button>
              </motion.div>
            ) : (
              <motion.div 
                whileHover={{ scale: 1.05 }} 
                whileTap={{ scale: 0.95 }}
                className="flex-shrink-0"
              >
                <Button
                  variant={isRecording ? "destructive" : "ghost"}
                  size="sm"
                  onClick={() => !isRecording && setIsRecording(true)}
                  className={`h-10 w-10 sm:h-10 sm:w-10 p-0 rounded-full transition-all duration-200 ${
                    isRecording 
                      ? 'bg-destructive hover:bg-destructive/90 shadow-lg animate-pulse' 
                      : 'bg-muted/50 hover:bg-muted border border-border/60 hover:border-primary/60'
                  }`}
                  disabled={isRecording}
                  aria-label="Record voice message"
                >
                  <Mic className={`h-4 w-4 sm:h-4 sm:w-4 ${isRecording ? 'text-destructive-foreground' : ''}`} />
                </Button>
              </motion.div>
            )}
          </div>
        </div>

        {/* File Attachment Menu */}
        <AnimatePresence>
          {showFileAttachment && (
            <FileAttachment
              onFileSelect={(accept) => {
                setFileAccept(accept);
                setTimeout(() => fileInputRef.current?.click(), 0);
              }}
              onClose={() => setShowFileAttachment(false)}
            />
          )}
        </AnimatePresence>

        {/* Emoji Picker */}
        <AnimatePresence>
          {showEmojiPicker && (
            <div className="absolute bottom-full right-0 mb-2 z-50" style={{ position: 'absolute', bottom: '100%', right: '0.25rem', marginBottom: '0.5rem' }}>
            <EmojiPicker onEmojiSelect={handleEmojiSelect} onClose={() => setShowEmojiPicker(false)} />
            </div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Voice Recorder */}
      <AnimatePresence>
        {isRecording && (
          <VoiceRecorder onRecorded={handleVoiceRecorded} onCancel={() => setIsRecording(false)} />
        )}
      </AnimatePresence>

      {/* Audio elements for remote streams */}
      {Object.entries(remoteAudioStreams).map(([peerId, stream]) => (
        <AudioPlayer key={peerId} stream={stream} />
      ))}
      {/* Optionally, local audio for testing (muted) */}
      {localAudioStream && <AudioPlayer stream={localAudioStream} muted />}

      {/* Call Popup */}
      <AnimatePresence>
        {activeCall && (
          <CallPopup
            type={activeCall.type}
            isIncoming={activeCall.isIncoming}
            contactName={chatName}
            onAccept={handleAcceptCall}
            onDecline={handleDeclineCall}
            onEnd={handleEndCall}
            isMuted={isMuted}
            onMuteToggle={handleMuteToggle}
            avatarUrl={getAvatarForUser(chatName)}
            callAccepted={callAccepted}
            // Video props
            localVideoStream={localVideoStream}
            remoteVideoStream={remoteVideoStream}
            isVideoEnabled={isVideoEnabled}
            onVideoToggle={async () => await rtcRef.current?.toggleVideo()}
          />
        )}
      </AnimatePresence>

      {/* Room Call Popup */}
      <AnimatePresence>
        {roomCallActive && (
          <RoomCallPopup
            type={roomCallType}
            isIncoming={roomCallIncoming}
            roomName={chatName}
            participants={roomCallParticipants}
            rejectedUsers={roomCallRejectedUsers}
            leftUsers={roomCallLeftUsers}
            onAccept={handleAcceptRoomCall}
            onDecline={handleDeclineRoomCall}
            onEnd={handleEndRoomCall}
            isMuted={isMuted}
            onMuteToggle={handleMuteToggle}
            callAccepted={roomCallAccepted}
            roomId={chatId}
            currentUser={userName}
            onStartCall={handleStartActualRoomCall}
            showParticipantsOnly={showParticipantsOnly}
            callStarted={roomCallStarted}
            onJoin={handleJoinRoomCall}
            canJoin={roomCallActive && !roomCallAccepted && !roomCallIncoming}
            // Video props
            localVideoStream={localVideoStream}
            remoteVideoStreams={remoteVideoStreams}
            isVideoEnabled={isVideoEnabled}
            onVideoToggle={async () => await rtcRef.current?.toggleVideo()}
          />
        )}
      </AnimatePresence>

      {/* Show kicked message if kicked */}
      {kicked && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white p-6 rounded shadow text-center">
            <h2 className="text-lg font-bold mb-2">You were removed from the room</h2>
            <p className="text-sm">You have been kicked by the admin.</p>
          </div>
        </div>
      )}


    </motion.div>
  )
}
