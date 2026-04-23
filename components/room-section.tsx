"use client"

import { useState, useEffect, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Plus, Users, Lock, Globe, Hash, Loader2 } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Dialog as AlertDialog, DialogContent as AlertDialogContent, DialogHeader as AlertDialogHeader, DialogTitle as AlertDialogTitle } from "@/components/ui/dialog"
import { useUserProfile } from "@/hooks/useUserProfile";
import { copyWithFeedback } from "@/lib/clipboard"

interface Room {
  id: string
  name: string
  memberCount: number
  isPrivate: boolean
  isSecure?: boolean
  description?: string
  avatar?: string
}

interface RoomSectionProps {
  onStartChat: (type: "room", id: string, name: string, password?: string) => void
}

// Generate a unique userId for this session
function getUserId() {
  let id = localStorage.getItem('dropsync_userid');
  if (!id) {
    // Generate a clean unique ID using random string only
    const randomStr = Math.random().toString(36).slice(2, 10);
    id = 'user_' + randomStr;
    localStorage.setItem('dropsync_userid', id);
  }
  return id;
}

// Add at the top of the file (after imports)
declare global {
  interface Window {
    _lastRoomNameForJoin?: string;
    _lastPasswordProtectedForJoin?: boolean;
  }
}

import { getSignalingUrl } from '../lib/config';

export function RoomSection({ onStartChat }: RoomSectionProps) {
  const { username } = useUserProfile();
  const [rooms, setRooms] = useState<Room[]>([])
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isJoinDialogOpen, setIsJoinDialogOpen] = useState(false)
  const [joinRoomId, setJoinRoomId] = useState("")
  const [newRoom, setNewRoom] = useState({
    name: "",
    description: "",
    isPrivate: false,
    passwordProtected: false,
  })
  const [passwordPrompt, setPasswordPrompt] = useState<{ open: boolean; error: string; roomId?: string; loading?: boolean }>({ open: false, error: "" });
  const [passwordInput, setPasswordInput] = useState("");
  const [pendingRoom, setPendingRoom] = useState<Room | null>(null);
  const [createdRoomId, setCreatedRoomId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [roomNames, setRoomNames] = useState<{ [id: string]: string }>({});
  const [createdRoomPassword, setCreatedRoomPassword] = useState<string | null>(null);
  const [showPasswordAlert, setShowPasswordAlert] = useState(false);
  const validationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isJoining, setIsJoining] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && username) {
      localStorage.setItem('dropsync_userid', username);
      setUserId(username);
    }
  }, [username]);

  // Debug log: print all available rooms and their isSecure status whenever rooms state changes
  useEffect(() => {
    if (rooms && rooms.length > 0) {
      // console.log('[Available Rooms] isSecure status:', rooms.map(r => ({ name: r.name, id: r.id, isSecure: r.isSecure })));
    }
  }, [rooms]);

  // WebSocket for room management
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    wsRef.current = new window.WebSocket(getSignalingUrl());
    wsRef.current.onopen = () => {
      wsRef.current?.send(JSON.stringify({ type: 'get-public-rooms' }));
    };
    wsRef.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'public-rooms') {
        // --- Inject default rooms ---
        const defaultRooms: Room[] = [
          {
            id: 'retro-realm',
            name: 'Retro Realm',
            memberCount: 0,
            isPrivate: true,
            isSecure: true, // <-- Added to require password prompt
            description: 'Step into the Retro Realm! A private space to share memories, vintage finds, and good vibes.',
          },
          {
            id: 'sanctuary',
            name: 'Sanctuary',
            memberCount: 0,
            isPrivate: false,
            description: 'Welcome to Sanctuary! An open space for everyone to share messages and files freely. Join and connect with the community. We will not store your data.',
          },
        ];
        // Merge backend rooms first, then default rooms (default rooms always at the bottom)
        const backendRooms = (data.rooms || []).slice().reverse();
        // For each default room, if it exists in backendRooms, use backend's memberCount
        const mergedDefaultRooms = defaultRooms.map(def => {
          const backend = backendRooms.find((r: Room) => r.id === def.id);
          return backend ? { ...def, memberCount: backend.memberCount } : def;
        });
        const mergedRooms = [
          ...backendRooms.filter((r: Room) => !defaultRooms.some(def => def.id === r.id)),
          ...mergedDefaultRooms,
        ];
        setRooms(mergedRooms);
        // Update roomNames map
        const names: Record<string, string> = {};
        mergedRooms.forEach((room: Room) => {
          names[room.id] = room.name;
        });
        setRoomNames(names);
      }
      if (data.type === 'room-created') {
        // console.log('[room-created] data.password:', data.password);
        setCreatedRoomId(data.roomId);
        setCreatedRoomPassword(data.password || null);
        setIsCreateDialogOpen(false);
        setError(null);
        // Store password in sessionStorage for chat header (creator only)
        if (data.password && data.roomId) {
          sessionStorage.setItem('room_password_' + data.roomId, data.password);
          setShowPasswordAlert(true);
          // console.debug('[Room Created] Password:', data.password, 'RoomId:', data.roomId);
        }
        // Use closure variable for joinRoom
        const roomNameForJoin = window._lastRoomNameForJoin || '';
        if (username && data.roomId) {
          joinRoom(data.roomId, data.password, roomNameForJoin);
        }
        // Clear closure variable
        window._lastRoomNameForJoin = undefined;
        window._lastPasswordProtectedForJoin = undefined;
        // Fetch the room name from backend to ensure accuracy
        wsRef.current?.send(JSON.stringify({ type: 'get-room-meta', payload: { roomId: data.roomId } }));
      }
      if (data.type === 'room-meta') {
        setIsJoining(false);
        // After fetching room meta, join the room with the correct name
        setRoomNames((prev) => ({ ...prev, [data.roomId]: data.name }));
        onStartChat('room', data.roomId, data.name);
      }
      if (data.type === 'room-info') {
        
        const roomInfo = {
          id: data.roomId,
          name: data.name || data.roomId,
          isSecure: data.isSecure,
          isPrivate: data.isPrivate,
          memberCount: 0,
          description: data.description || ''
        };
        
        if (data.isSecure) {
          setPendingRoom(roomInfo);
          setPasswordPrompt({ open: true, error: "", roomId: data.roomId, loading: false });
          setPasswordInput("");
          setIsJoining(false);
        } else {
          joinRoom(data.roomId, undefined, data.name);
        }
        
        // Clear the stored room ID
        setJoinRoomId("");
      }
      if (data.type === 'room-info-error') {
        setError(`Failed to get room information: ${data.error}`);
        setJoinRoomId("");
        setIsJoining(false);
      }
      if (data.type === 'join-error') {
        
        // Clear validation timeout
        if (validationTimeoutRef.current) {
          clearTimeout(validationTimeoutRef.current);
          validationTimeoutRef.current = null;
        }
        
        // Keep dialog open and show error - don't navigate to chat
        setPasswordPrompt(prev => ({ ...prev, open: true, error: data.error, loading: false }));
        setIsJoining(false);
        return; // Don't proceed to chat interface
      }
      if (data.type === 'user-joined' && pendingRoom) {
        // Check if this is the user who was trying to join with password
        if (data.userId === username || data.roomId === pendingRoom.id) {
          // Clear validation timeout
          if (validationTimeoutRef.current) {
            clearTimeout(validationTimeoutRef.current);
            validationTimeoutRef.current = null;
          }
          
          // Password was correct - close dialog and navigate to chat
          setPasswordPrompt({ open: false, error: '', roomId: undefined, loading: false });
          const roomName = pendingRoom.name;
          const roomId = pendingRoom.id;
          const password = passwordInput;
          // Clean up state
          setPasswordInput('');
          setPendingRoom(null);
          // Navigate to chat interface
          onStartChat('room', roomId, roomName, password);
        }
      }
      if (data.type === 'error') {
        setError(data.error);
      }
    };
    return () => wsRef.current?.close();
  }, []);

  // Cleanup validation timeout on unmount
  useEffect(() => {
    return () => {
      if (validationTimeoutRef.current) {
        clearTimeout(validationTimeoutRef.current);
      }
    };
  }, []);

  const handleCreateRoom = () => {
    if (!username) return;
    if (newRoom.name.trim() && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      // Capture room name and passwordProtected in local variables
      const roomNameForJoin = newRoom.name;
      const passwordProtectedForJoin = newRoom.passwordProtected;
      // Store in closure variables for use after room creation
      window._lastRoomNameForJoin = roomNameForJoin;
      window._lastPasswordProtectedForJoin = passwordProtectedForJoin;
      const payload = {
        type: 'create-room',
        payload: {
          name: newRoom.name,
          isPublic: !newRoom.isPrivate,
          passwordProtected: newRoom.passwordProtected,
          createdBy: username,
          description: newRoom.description,
        },
      };
      wsRef.current.send(JSON.stringify(payload));
      setNewRoom({ name: "", description: "", isPrivate: false, passwordProtected: false });
      setError(null);
    } else {
      setError('WebSocket not connected or room name missing.');
    }
  };

  // Ref to store last room creation info
  const lastRoomCreateRef = useRef<{ roomName: string; passwordProtected: boolean } | null>(null);

  const handleJoinRoom = (room: Room) => {
    setIsJoining(true);
    // Always check isSecure for password prompt
    if (room.isSecure) {
      setPendingRoom(room);
      setPasswordPrompt({ open: true, error: "", roomId: room.id, loading: false });
      setPasswordInput("");
      setIsJoining(false);
      return;
    }
    joinRoom(room.id, undefined, room.name);
  };

  const joinRoom = (roomId: string, password?: string, roomName?: string) => {
    
    if (!username) return;
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      const joinMsg: any = {
        type: 'join',
        roomId,
        userId: username,
      };
      if (password) joinMsg.password = password;
      
      wsRef.current.send(JSON.stringify(joinMsg));
      
      // Only navigate immediately if there's no password (non-protected room)
      // For password-protected rooms, wait for validation response
      if (!password) {
        // If we know the name, use it; otherwise, fetch from backend
        if (roomName) {
          setIsJoining(false);
          onStartChat('room', roomId, roomName, password);
        } else {
          wsRef.current.send(JSON.stringify({ type: 'get-room-meta', payload: { roomId } }));
        }
      } else {
      }
      // For password-protected rooms, navigation happens in the WebSocket response handler
    } else {
      setError('WebSocket not connected.');
      setIsJoining(false);
    }
  };

  const handlePasswordSubmit = () => {
    if (pendingRoom && !passwordPrompt.loading) {
      // Clear any existing timeout
      if (validationTimeoutRef.current) {
        clearTimeout(validationTimeoutRef.current);
      }
      
      // Don't close dialog yet - wait for server validation
      setPasswordPrompt(prev => ({ ...prev, error: '', loading: true }));
      joinRoom(pendingRoom.id, passwordInput, pendingRoom.name);
      
      // Capture current state for timeout
      const roomToJoin = pendingRoom;
      const passwordToUse = passwordInput;
      
      // Add timeout fallback to close dialog if stuck
      validationTimeoutRef.current = setTimeout(() => {
        setPasswordPrompt({ open: false, error: '', roomId: undefined, loading: false });
        setPasswordInput('');
        setPendingRoom(null);
        // Navigate to chat interface anyway - user might already be in the room
        onStartChat('room', roomToJoin.id, roomToJoin.name, passwordToUse);
             }, 1000); // 1 second timeout
    }
  };

  const handleJoinById = () => {
    if (joinRoomId.trim()) {
      
      // Try to find the room in the rooms list first
      const foundRoom = rooms.find(r => r.id === joinRoomId.trim());
      
      if (foundRoom) {
        if (foundRoom.isSecure) {
          setPendingRoom(foundRoom);
          setPasswordPrompt({ open: true, error: "", roomId: foundRoom.id, loading: false });
          setPasswordInput("");
          setJoinRoomId("");
          setIsJoinDialogOpen(false);
          return;
        } else {
          // Public room, join directly
          joinRoom(foundRoom.id, undefined, foundRoom.name);
          setJoinRoomId("");
          setIsJoinDialogOpen(false);
          return;
        }
      }
      
      // Room not in public list, get room info from server
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ 
          type: 'get-room-info', 
          payload: { roomId: joinRoomId.trim() } 
        }));
        // Store the room ID temporarily
        setJoinRoomId(joinRoomId.trim());
      }
      setIsJoinDialogOpen(false);
    }
  };

  const handleJoinByIdFromDialog = () => {
    if (joinRoomId.trim()) {
      
      // Try to find the room in the rooms list first
      const foundRoom = rooms.find(r => r.id === joinRoomId.trim());
      
      if (foundRoom) {
        if (foundRoom.isSecure) {
          setPendingRoom(foundRoom);
          setPasswordPrompt({ open: true, error: "", roomId: foundRoom.id, loading: false });
          setPasswordInput("");
          setJoinRoomId("");
          setIsJoinDialogOpen(false);
          return;
        } else {
          // Public room, join directly
          joinRoom(foundRoom.id, undefined, foundRoom.name);
          setJoinRoomId("");
          setIsJoinDialogOpen(false);
          return;
        }
      }
      
      // Room not in public list, get room info from server
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ 
          type: 'get-room-info', 
          payload: { roomId: joinRoomId.trim() } 
        }));
        // Store the room ID temporarily
        setJoinRoomId(joinRoomId.trim());
      }
      setIsJoinDialogOpen(false);
    }
  };

  // Remove defaultRooms and allRooms logic, use rooms from backend

  // If userId is not set yet, render nothing (or a loading spinner)
  if (!username) return null;

  return (
    <div className="relative">
      {/* Loading Spinner Overlay */}
      {isJoining && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="flex flex-col items-center">
            <Loader2 className="h-10 w-10 animate-spin text-primary mb-2" />
            <span className="text-primary text-sm font-medium">Joining room...</span>
          </div>
        </div>
      )}
      {/* Password Alert Dialog */}
      <AlertDialog open={showPasswordAlert && !!createdRoomPassword} onOpenChange={setShowPasswordAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Room Password</AlertDialogTitle>
          </AlertDialogHeader>
          <div className="space-y-2">
            <div className="text-base font-semibold">Copy and save this password. You will need it to invite others to join this room.</div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-lg">{createdRoomPassword}</span>
              <Button size="sm" onClick={async () => {
                const success = await copyWithFeedback(createdRoomPassword!, 
                  () => alert('✅ Password copied to clipboard!'),
                  () => alert('❌ Failed to copy password. Please try again.')
                );
              }}>Copy Password</Button>
            </div>
            <div className="text-xs text-destructive">You will not be able to see this password again if you close this tab or clear your browser session.</div>
          </div>
        </AlertDialogContent>
      </AlertDialog>
      {/* Create/Join Actions */}
      <div className="flex flex-row gap-4 items-start">
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
              <Button className="h-12 min-w-[140px] sm:min-w-[280px]" size="lg">
                <Plus className="h-4 w-4 mr-2" />
                Create Room
              </Button>
            </motion.div>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Room</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="room-name">Room Name</Label>
                <Input
                  id="room-name"
                  value={newRoom.name}
                  onChange={(e) => setNewRoom({ ...newRoom, name: e.target.value })}
                  placeholder="Enter room name"
                />
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="private-room"
                  checked={newRoom.isPrivate}
                  onCheckedChange={(checked) => setNewRoom({ ...newRoom, isPrivate: checked })}
                />
                <Label htmlFor="private-room">Private Room</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="password-protected-room"
                  checked={newRoom.passwordProtected}
                  onCheckedChange={(checked) => setNewRoom({ ...newRoom, passwordProtected: checked })}
                />
                <Label htmlFor="password-protected-room">Password Protect Room</Label>
              </div>
              <Button onClick={handleCreateRoom} className="w-full">
                Create Room
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Desktop: Inline input and button */}
        <div className="hidden sm:flex flex-row gap-2 items-center">
          <Input value={joinRoomId} onChange={(e) => setJoinRoomId(e.target.value)} placeholder="Room ID" className="h-12" />
          <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
            <Button onClick={handleJoinById} variant="outline" className="h-12 bg-transparent min-w-[140px]">
              Join by ID
            </Button>
          </motion.div>
        </div>

        {/* Mobile: Dialog trigger button */}
        <Dialog open={isJoinDialogOpen} onOpenChange={setIsJoinDialogOpen}>
          <DialogTrigger asChild>
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="sm:hidden">
              <Button variant="outline" className="h-12 min-w-[200px] sm:min-w-[300px]" size="lg">
                Join by ID
              </Button>
            </motion.div>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Join Room by ID</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="join-room-id">Room ID</Label>
                <Input
                  id="join-room-id"
                  value={joinRoomId}
                  onChange={(e) => setJoinRoomId(e.target.value)}
                  placeholder="Enter room ID"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleJoinByIdFromDialog();
                    }
                  }}
                />
              </div>
              <Button onClick={handleJoinByIdFromDialog} className="w-full">
                Join Room
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Show created roomId with copy button */}
      {createdRoomId && (
        <div className="flex items-center gap-2 p-2 bg-muted rounded-lg">
          <span className="font-mono text-xs">Room ID: {createdRoomId}</span>
          <Button size="sm" onClick={async () => {
            const success = await copyWithFeedback(createdRoomId, 
              () => alert('✅ Room ID copied to clipboard!'),
              () => alert('❌ Failed to copy room ID. Please try again.')
            );
          }}>Copy</Button>
          {createdRoomPassword && (
            <>
              <span className="font-mono text-xs ml-4">Password: {createdRoomPassword}</span>
              <Button size="sm" onClick={async () => {
                const success = await copyWithFeedback(createdRoomPassword, 
                  () => alert('✅ Password copied to clipboard!'),
                  () => alert('❌ Failed to copy password. Please try again.')
                );
              }}>Copy Password</Button>
            </>
          )}
        </div>
      )}



      {/* Available Rooms */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Available Rooms</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {/* Empty State for No Rooms */}
            {rooms.length === 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col items-center justify-center py-12 text-center"
              >
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.2, duration: 0.6 }}
                  className="relative mb-6"
                >
                  <div className="w-32 h-32 mx-auto opacity-70">
                    <img
                      src="/illustrations/emptystates-empty-cart.png"
                      alt="No rooms available"
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
                  <h3 className="text-lg font-semibold text-foreground">No rooms available</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    No public rooms are currently available. Create a new room to get started!
                  </p>
                </motion.div>
              </motion.div>
            )}
            
            <AnimatePresence>
              {rooms.map((room, index) => (
                <motion.div
                  key={room.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ delay: index * 0.1 }}
                  className="flex items-center justify-between p-3 rounded-lg border border-border/50 hover:border-border transition-colors"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      {room.isSecure ? (
                        <span title="Password Protected"><Lock className="h-4 w-4 text-primary" /></span>
                      ) : room.isPrivate ? (
                        <span title="Private Room"><Lock className="h-4 w-4 text-muted-foreground opacity-60" /></span>
                      ) : (
                        <span title="Public Room"><Globe className="h-4 w-4 text-muted-foreground" /></span>
                      )}
                      <span className="font-medium">{room.name}</span>
                      {/* Only show member count if not Retro Realm */}
                      {room.id !== 'retro-realm' && (
                        <Badge variant="secondary" className="text-xs">
                          <Users className="h-3 w-3 mr-1" />
                          {room.memberCount}
                        </Badge>
                      )}
                    </div>
                    {room.description && <p className="text-sm text-muted-foreground">{room.description}</p>}
                  </div>
                  <Button size="sm" onClick={() => handleJoinRoom(room)} className="ml-4">
                    Join
                  </Button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </CardContent>
      </Card>

      {/* Password Prompt Dialog for Private Room */}
      <Dialog open={passwordPrompt.open} onOpenChange={open => {
        if (!open && !passwordPrompt.loading) {
          setPasswordPrompt({ open: false, error: "", loading: false });
          setPasswordInput("");
          setPendingRoom(null);
        }
      }}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader className="pb-2">
            <DialogTitle className="text-lg font-semibold">Enter Password for Room</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground mb-1">Room is password protected.</div>
            <input
              type="password"
              className="w-full rounded-lg border bg-muted px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-primary transition disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder="Password"
              value={passwordInput}
              onChange={e => setPasswordInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !passwordPrompt.loading) handlePasswordSubmit(); }}
              disabled={passwordPrompt.loading}
              autoFocus
            />
            {passwordPrompt.error && <p className="text-destructive text-xs mb-1">{passwordPrompt.error}</p>}
            {passwordPrompt.loading && (
              <div className="space-y-1">
                <p className="text-primary text-xs mb-1">Validating password...</p>
                <button 
                  className="text-xs text-muted-foreground underline hover:text-foreground"
                  onClick={() => {
                    // Clear timeout and force close
                    if (validationTimeoutRef.current) {
                      clearTimeout(validationTimeoutRef.current);
                    }
                    setPasswordPrompt({ open: false, error: "", loading: false });
                    setPasswordInput('');
                    if (pendingRoom) {
                      onStartChat('room', pendingRoom.id, pendingRoom.name, passwordInput);
                    }
                    setPendingRoom(null);
                  }}
                >
                  Join anyway
                </button>
              </div>
            )}
            <div className="flex gap-2 justify-end pt-2">
              <Button 
                size="sm" 
                variant="outline" 
                className="rounded-lg" 
                disabled={passwordPrompt.loading}
                onClick={() => {
                  setPasswordPrompt({ open: false, error: "", loading: false });
                  setPasswordInput("");
                  setPendingRoom(null);
                }}
              >
                Cancel
              </Button>
              <Button 
                size="sm" 
                className="rounded-lg" 
                disabled={passwordPrompt.loading}
                onClick={handlePasswordSubmit}
              >
                {passwordPrompt.loading ? "Validating..." : "Join"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {error && <div className="text-red-500 text-xs p-2">{error}</div>}
    </div>
  )
}
