"use client"

import { useEffect, useRef, useState } from "react"
import { motion } from "framer-motion"
import { NearbyDevices } from "@/components/nearby-devices"
import { RoomSection } from "@/components/room-section"
import { ChatInterface } from "@/components/chat-interface"
import { ThemeToggle } from "@/components/theme-toggle"
import { MessageSquare, Users, Wifi, FileText, Send, Zap, RefreshCw } from "lucide-react"
import { useUserProfile, AVATARS, resetUsername, changeUsername } from "@/hooks/useUserProfile";
import { useCallback } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { getSignalingUrl } from "@/lib/config";
import { SparklesText } from "@/components/ui/sparkles-text";

export default function Home() {
  const { username, avatar } = useUserProfile();
  const [activeChat, setActiveChat] = useState<{
    type: "room" | "direct"
    id: string
    name: string
    password?: string
  } | null>(null)
  const userName = username || "";
  const [lobbyUsers, setLobbyUsers] = useState<string[]>([])
  const [userStatus, setUserStatus] = useState<{
    [username: string]: { isOnline: boolean; lastSeen: number }
  }>({})
  const ws = useRef<WebSocket | null>(null)
  const [inLobby, setInLobby] = useState(true)
  const [currentRoomUsers, setCurrentRoomUsers] = useState<string[]>([]);
  // Track password for active chat
  const [activeChatPassword, setActiveChatPassword] = useState<string | undefined>(undefined);
  // Track connection status
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');

  // Function to handle username change
  const handleUsernameChange = () => {
    changeUsername();
  };

  // Function to retry connection
  const handleRetryConnection = () => {
    if (ws.current) {
      ws.current.close();
    }
    setConnectionStatus('connecting');
    ws.current = new window.WebSocket(getSignalingUrl());
    ws.current.onopen = () => {
      setConnectionStatus('connected');
      if (inLobby) {
        ws.current?.send(JSON.stringify({ type: "join", roomId: "lobby", userId: userName }));
      }
    };
    ws.current.onclose = () => {
      setConnectionStatus('disconnected');
    };
    ws.current.onerror = () => {
      setConnectionStatus('disconnected');
    };
    ws.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "lobby-users") {
        setLobbyUsers(data.users.filter((id: string) => id !== userName));
        setUserStatus((prev) => {
          const now = Date.now();
          const updated: typeof prev = { ...prev };
          for (const u of data.users) {
            if (u !== userName) {
              updated[u] = { isOnline: true, lastSeen: now };
            }
          }
          for (const u in updated) {
            if (!data.users.includes(u)) {
              if (updated[u].isOnline) {
                updated[u] = { ...updated[u], isOnline: false, lastSeen: now };
              }
            }
          }
          return updated;
        });
      }
      if (data.type === "all-users") {
        setAllUsersMap(() => {
          const map: Record<string, string> = {};
          for (const user of data.users) {
            map[user.id] = user.roomId;
          }
          return map;
        });
        setUserStatus((prev) => {
          const now = Date.now();
          const updated: typeof prev = { ...prev };
          const allUserIds = data.users.map((u: any) => u.id);
          for (const u of allUserIds) {
            if (!updated[u]) {
              updated[u] = { isOnline: true, lastSeen: now };
            } else {
              updated[u] = { ...updated[u], isOnline: true, lastSeen: now };
            }
          }
          for (const u in updated) {
            if (!allUserIds.includes(u)) {
              if (updated[u].isOnline) {
                updated[u] = { ...updated[u], isOnline: false, lastSeen: now };
              }
            }
          }
          return updated;
        });
      }
      if (data.type === "chat-invite" && inLobby) {
        setInLobby(false);
        setActiveChat({ type: "direct", id: data.roomId, name: data.from });
      }
    };
  };

  // Helper to get deterministic 1:1 room ID
  function getDirectRoomId(id1: string, id2: string) {
    return [id1, id2].sort().join("--")
  }

  useEffect(() => {
    ws.current = new window.WebSocket(getSignalingUrl())
    ws.current.onopen = () => {
      setConnectionStatus('connected');
      if (inLobby) {
        ws.current?.send(JSON.stringify({ type: "join", roomId: "lobby", userId: userName }))
      }
    }
    ws.current.onmessage = (event) => {
      const data = JSON.parse(event.data)
      if (data.type === "lobby-users") {
        setLobbyUsers(data.users.filter((id: string) => id !== userName))
        setUserStatus((prev) => {
          const now = Date.now()
          const updated: typeof prev = { ...prev }
          // Mark all current lobby users as online
          for (const u of data.users) {
            if (u !== userName) {
              updated[u] = { isOnline: true, lastSeen: now }
            }
          }
          // Mark users not in lobby as offline, but keep their lastSeen
          for (const u in updated) {
            if (!data.users.includes(u)) {
              // Only update if not already offline
              if (updated[u].isOnline) {
                updated[u] = { ...updated[u], isOnline: false, lastSeen: now }
              }
            }
          }
          return updated
        })
      }
      if (data.type === "all-users") {
        // Build a map of userId -> roomId
        setAllUsersMap(() => {
          const map: Record<string, string> = {};
          for (const user of data.users) {
            map[user.id] = user.roomId;
          }
          return map;
        });
        // Update userStatus for all users in all-users
        setUserStatus((prev) => {
          const now = Date.now();
          const updated: typeof prev = { ...prev };
          const allUserIds = data.users.map((u: any) => u.id);
          // Mark all users in all-users as online
          for (const u of allUserIds) {
            if (!updated[u]) {
              updated[u] = { isOnline: true, lastSeen: now };
            } else {
              updated[u] = { ...updated[u], isOnline: true, lastSeen: now };
            }
          }
          // Mark users not in all-users as offline
          for (const u in updated) {
            if (!allUserIds.includes(u)) {
              if (updated[u].isOnline) {
                updated[u] = { ...updated[u], isOnline: false, lastSeen: now };
              }
            }
          }
          return updated;
        });
      }
      if (data.type === "chat-invite" && inLobby) {
        setInLobby(false)
        setActiveChat({ type: "direct", id: data.roomId, name: data.from })
      }
    }
    ws.current.onclose = () => {
      setConnectionStatus('disconnected');
    }
    ws.current.onerror = () => {
      setConnectionStatus('disconnected');
    }
    return () => {
      if (ws.current && ws.current.readyState === WebSocket.OPEN && inLobby) {
        ws.current.send(JSON.stringify({ type: "leave", roomId: "lobby", userId: userName }))
      }
      ws.current?.close()
    }
  }, [userName, inLobby])

  // New state to track all users and their room
  const [allUsersMap, setAllUsersMap] = useState<Record<string, string>>({});

  // Clean up users who have been offline for more than 2 minutes
  useEffect(() => {
    const interval = setInterval(() => {
      setUserStatus((prev) => {
        const now = Date.now()
        const keep: typeof prev = {}
        for (const u in prev) {
          if (prev[u].isOnline || now - prev[u].lastSeen < 2 * 60 * 1000) {
            keep[u] = prev[u]
          }
        }
        return keep
      })
    }, 30 * 1000)
    return () => clearInterval(interval)
  }, [])

  // Callback to update room users from ChatInterface
  const handleRoomUsersUpdate = useCallback((users: string[]) => {
    setCurrentRoomUsers(users);
  }, []);

  // Prepare devices array for NearbyDevices
  const devices = Object.entries(userStatus)
    .filter(([name, status]) => name !== userName) // Exclude self from Nearby Devices
    .filter(([name, status]) => {
      // Only show users who are online or in a room, and not random user_xxxxxxxx unless they are online
      const isRandomUser = /^user_[a-z0-9]{8}$/.test(name);
      return (
        status.isOnline || (allUsersMap[name] && allUsersMap[name] !== 'lobby')
      ) && (!isRandomUser || status.isOnline);
    })
    .map(([name, status]) => {
      let deviceStatus = status.isOnline ? (allUsersMap[name] && allUsersMap[name] !== 'lobby' ? "In Room" : "Online") : "Offline";
      // Use allUsersMap to determine if user is in a chat or room
      const userRoom = allUsersMap[name];
      if (status.isOnline && userRoom && userRoom !== 'lobby') {
        if (userRoom.startsWith(name + '--') || userRoom.endsWith('--' + name)) {
          deviceStatus = "In Chat";
        } else {
          deviceStatus = "In Room";
        }
      }
      return {
        id: name,
        name,
        type: "unknown",
        isOnline: status.isOnline,
        lastSeen: status.isOnline
          ? "now"
          : (() => {
              const ago = Math.floor((Date.now() - status.lastSeen) / 1000)
              if (ago < 60) return `${ago}s ago`
              if (ago < 3600) return `${Math.floor(ago / 60)}m ago`
              return `${Math.floor(ago / 3600)}h ago`
            })(),
        avatar: (() => {
          let hash = 0;
          for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
          const idx = Math.abs(hash) % AVATARS.length;
          return AVATARS[idx];
        })(),
        status: deviceStatus,
      }
    })
    .sort((a, b) => (a.isOnline === b.isOnline ? 0 : a.isOnline ? -1 : 1))

  // Enter chat: leave lobby
  const handleStartChat = (type: "room" | "direct", id: string, name: string, password?: string) => {
    if (inLobby && ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: "leave", roomId: "lobby", userId: userName }))
      setInLobby(false)
    }
    setActiveChat({ type, id, name, password });
    setActiveChatPassword(password);
  }

  // Close chat: rejoin lobby
  const handleCloseChat = () => {
    // If in a direct chat, instantly set the peer's status to offline
    if (activeChat && activeChat.type === 'direct' && activeChat.name !== userName) {
      setUserStatus(prev => ({
        ...prev,
        [activeChat.name]: {
          isOnline: false,
          lastSeen: Date.now(),
        },
      }));
    }
    setActiveChat(null)
    setInLobby(true)
    // Rejoin lobby will be handled by useEffect
  }

  // When clicking a user in Nearby Devices, open a direct chat with deterministic room ID
  const handleNearbyChat = (otherUserName: string) => {
    const roomId = getDirectRoomId(userName, otherUserName)
    // Send chat-invite to the other user with deterministic roomId
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: "chat-invite", roomId, userId: userName, targetId: otherUserName }))
    }
    handleStartChat("direct", roomId, otherUserName)
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/40 backdrop-blur-sm bg-background/80 sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/icon.png" alt="DropSync Logo" className="h-9 w-9 rounded-full" />
            <SparklesText 
              text="DropSync" 
              className="text-xl font-bold tracking-tight drop-shadow-sm"
              sparklesCount={4}
              colors={{ first: "#60A5FA", second: "#A78BFA" }}
            />
          </div>
          <div className="flex items-center gap-0 min-w-0">
            {/* Connection Status Indicator */}
            <div className="flex items-center gap-2 mr-2">
              <Wifi className={`h-4 w-4 ${
                connectionStatus === 'connected' ? 'text-green-500' :
                connectionStatus === 'connecting' ? 'text-yellow-500' :
                'text-red-500'
              }`} />
              {connectionStatus === 'disconnected' && (
                <button
                  onClick={handleRetryConnection}
                  className="p-1 hover:bg-gray-100 rounded transition-colors"
                  title="Retry connection"
                >
                  <RefreshCw className="h-4 w-4 text-red-500" />
                </button>
              )}
            </div>
              <img
                src={avatar ?? "/placeholder-user.jpg"}
                alt="User Avatar"
              className="h-10 w-10 rounded-full object-cover border ml-1"
            />
            <button
              onClick={handleUsernameChange}
              className="font-semibold text-base truncate max-w-[120px] sm:max-w-xs hover:text-primary hover:bg-primary/5 px-2 py-1 rounded transition-all duration-200 cursor-pointer group relative hover:scale-105"
              title="Click to change username"
            >
              {username ?? "Loading..."}
            </button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {/* Modern Hero Section */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.8, ease: "easeOut" }}
          className="mb-12 text-center max-w-6xl mx-auto pl-6 pr-10"
        >
          {/* Hero Grid Layout */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2, duration: 0.8, ease: "easeOut" }}
            className="grid lg:grid-cols-5 gap-16 items-center"
          >
            {/* Left Side - Content */}
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2, duration: 0.8, ease: "easeOut" }}
              className="space-y-8 text-left order-2 lg:order-1 lg:col-span-3 -ml-4"
            >
              {/* Main Heading */}
              <div className="space-y-4">
                <motion.h1 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3, duration: 0.6 }}
                  whileHover={{ scale: 1.02 }}
                  className="text-4xl md:text-5xl lg:text-6xl font-bold leading-tight cursor-pointer"
                >
                  <span className="bg-gradient-to-r from-primary via-primary/90 to-primary/70 bg-clip-text text-transparent">
                    Effortless
                  </span>
                  <span className="text-foreground ml-2">
                    File Sharing
                  </span>
                </motion.h1>
                
                <motion.p 
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4, duration: 0.6 }}
                  className="text-lg md:text-xl text-muted-foreground leading-relaxed max-w-3xl"
                >
                  Share files and chat in real-time with nearby users. 
                  Fast, secure, and completely private.
                </motion.p>
              </div>

              {/* Feature Pills */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5, duration: 0.6 }}
                className="flex gap-8"
              >
                <motion.div 
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.6, duration: 0.4 }}
                  whileHover={{ scale: 1.05, y: -2 }}
                  className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer"
                >
                  <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                  <span>Real-time messaging</span>
                </motion.div>
                <motion.div 
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.7, duration: 0.4 }}
                  whileHover={{ scale: 1.05, y: -2 }}
                  className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer"
                >
                  <div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div>
                  <span>Secure file sharing</span>
                </motion.div>
                <motion.div 
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.8, duration: 0.4 }}
                  whileHover={{ scale: 1.05, y: -2 }}
                  className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer"
                >
                  <div className="w-1.5 h-1.5 bg-purple-500 rounded-full"></div>
                  <span>No registration required</span>
                </motion.div>
              </motion.div>
            </motion.div>

            {/* Right Side - Visual */}
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3, duration: 0.8, ease: "easeOut" }}
              className="relative order-1 lg:order-2 lg:col-span-2 flex justify-end"
            >
              {/* Main Illustration */}
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.4, duration: 0.8, ease: "easeOut" }}
                className="relative"
              >
                <div className="w-64 h-64 mx-auto relative bg-white/20 rounded-2xl p-6 border-2 border-white/30 shadow-2xl backdrop-blur-sm">
                  <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent rounded-2xl"></div>
                  <img
                    src="/illustrations/chat-empty.png"
                    alt="DropSync Interface"
                    className="w-full h-full object-contain drop-shadow-2xl filter brightness-150 contrast-200 relative z-10"
                  />
                  
                  {/* Floating Elements */}
                  <motion.div
                    animate={{ 
                      y: [-10, 10, -10],
                      rotate: [0, 5, 0]
                    }}
                    transition={{ 
                      duration: 4, 
                      repeat: Infinity, 
                      ease: "easeInOut" 
                    }}
                    className="absolute -top-4 -right-4 w-16 h-16 bg-primary/20 backdrop-blur-sm rounded-2xl border-2 border-primary/30 shadow-2xl z-20"
                  >
                    <div className="flex items-center justify-center h-full">
                      <Send className="w-6 h-6 text-primary drop-shadow-lg" />
                    </div>
                  </motion.div>
                  
                  <motion.div
                    animate={{ 
                      y: [10, -10, 10],
                      rotate: [0, -5, 0]
                    }}
                    transition={{ 
                      duration: 4, 
                      repeat: Infinity, 
                      ease: "easeInOut",
                      delay: 1
                    }}
                    className="absolute -bottom-4 -left-4 w-16 h-16 bg-blue-500/20 backdrop-blur-sm rounded-2xl border-2 border-blue-500/30 shadow-2xl z-20"
                  >
                    <div className="flex items-center justify-center h-full">
                      <FileText className="w-6 h-6 text-blue-600 drop-shadow-lg" />
                    </div>
                  </motion.div>
                  
                  <motion.div
                    animate={{ 
                      scale: [1, 1.1, 1],
                      opacity: [0.7, 1, 0.7]
                    }}
                    transition={{ 
                      duration: 3, 
                      repeat: Infinity, 
                      ease: "easeInOut",
                      delay: 2
                    }}
                    className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-24 h-24 bg-gradient-to-r from-primary/20 to-purple-500/20 rounded-full blur-xl"
                  ></motion.div>
                </div>
              </motion.div>
            </motion.div>
          </motion.div>
        </motion.div>
        {activeChat ? (
          <div className="fixed inset-0 z-50 bg-background flex flex-col">
            <ChatInterface
              chatType={activeChat.type}
              chatId={activeChat.id}
              chatName={activeChat.name}
              onClose={handleCloseChat}
              userName={userName}
              peerStatus={activeChat.type === 'direct' && activeChat.name !== userName ? userStatus[activeChat.name] : undefined}
              onPeerOffline={(peerId) => {
                setUserStatus(prev => ({
                  ...prev,
                  [peerId]: {
                    isOnline: false,
                    lastSeen: Date.now(),
                  },
                }));
              }}
              password={activeChatPassword}
              // Only pass for room chats
              {...(activeChat.type === 'room' ? { onRoomUsers: handleRoomUsersUpdate } : {})}
            />
          </div>
        ) : (
          <div className="grid lg:grid-cols-2 gap-8 max-w-6xl mx-auto">
            {/* Nearby Devices Section */}
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }}>
              <div className="flex items-center gap-2 mb-6">
                <Wifi className="h-5 w-5 text-primary" />
                <h3 className="text-xl font-semibold">Nearby Users</h3>
              </div>
              <NearbyDevices onStartChat={handleNearbyChat} userName={userName} users={devices} />
            </motion.div>
            {/* Room Section */}
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }}>
              <div className="flex items-center gap-2 mb-6">
                <Users className="h-5 w-5 text-primary" />
                <h3 className="text-xl font-semibold">Rooms</h3>
              </div>
              <RoomSection onStartChat={handleStartChat} />
            </motion.div>
          </div>
        )}

        {/* How it Works Section */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.8, ease: "easeOut" }}
          className="mt-16 max-w-6xl mx-auto px-4"
        >
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.6 }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              How it Works
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Simple steps to start sharing files and chatting with nearby users
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Step 1 */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.6 }}
              className="text-center"
            >
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl font-bold text-primary">1</span>
              </div>
              <h3 className="text-xl font-semibold mb-2">Connect</h3>
              <p className="text-muted-foreground">
                Join the lobby to discover nearby users and available rooms
              </p>
            </motion.div>

            {/* Step 2 */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6, duration: 0.6 }}
              className="text-center"
            >
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl font-bold text-primary">2</span>
              </div>
              <h3 className="text-xl font-semibold mb-2">Chat</h3>
              <p className="text-muted-foreground">
                Start a conversation with nearby users or join existing rooms
              </p>
            </motion.div>

            {/* Step 3 */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7, duration: 0.6 }}
              className="text-center"
            >
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl font-bold text-primary">3</span>
              </div>
              <h3 className="text-xl font-semibold mb-2">Share</h3>
              <p className="text-muted-foreground">
                Send files, images, and messages in real-time with complete privacy
              </p>
            </motion.div>
          </div>
        </motion.div>
      </main>
    </div>
  )
}
