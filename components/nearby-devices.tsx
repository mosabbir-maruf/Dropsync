"use client"

import { useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { MessageCircle, Smartphone, Laptop, Tablet } from "lucide-react"
import { useUserProfile, AVATARS } from "@/hooks/useUserProfile";

interface Device {
  id: string
  name: string
  type: string
  isOnline: boolean
  lastSeen: string
  avatar?: string
  status?: string
}

interface NearbyDevicesProps {
  onStartChat: (otherUserName: string) => void
  userName: string
  users: Device[]
}

function DeviceAvatar({ id }: { id: string }) {
  const [initial, setInitial] = useState('?');
  useEffect(() => {
    if (typeof id === 'string' && id.length > 0) {
      setInitial(id.charAt(0).toUpperCase());
    } else {
      setInitial('?');
    }
  }, [id]);
  return <AvatarFallback className="text-sm">{initial}</AvatarFallback>;
}

export function NearbyDevices({ onStartChat, userName, users }: NearbyDevicesProps) {
  const { username, avatar } = useUserProfile();

  // Helper to get a deterministic avatar for a user (other than self)
  function getAvatarForUser(id: string) {
    if (id === userName) return avatar ?? "/placeholder.svg";
    // Deterministically pick an avatar based on user name hash
    let hash = 0;
    for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
    const idx = Math.abs(hash) % AVATARS.length;
    return AVATARS[idx];
  }

  // Use the users prop directly as devices
  let devices = users;
  // Always add Mosabbir device last
  devices = [
    ...devices,
    {
      id: 'Mosabbir Maruf',
      name: 'Mosabbir Maruf',
      type: 'unknown',
      isOnline: true,
      lastSeen: 'now',
      avatar: '/admin.png',
      status: 'Online',
    },
  ];

  const getDeviceIcon = (type: string) => {
    switch (type) {
      case "phone":
        return <Smartphone className="h-4 w-4" />
      case "laptop":
        return <Laptop className="h-4 w-4" />
      case "tablet":
        return <Tablet className="h-4 w-4" />
      default:
        return <Smartphone className="h-4 w-4" />
    }
  }

  const getInitials = (name: string) => {
    return name.split(" ")[0].charAt(0).toUpperCase()
  }

  return (
    <Card className="h-fit">
      <CardContent className="p-6">
        <div className="space-y-4">
          {/* Empty State for No Devices */}
          {devices.length === 0 && (
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
                    src="/illustrations/empty-state-no-user-found.png"
                    alt="No nearby devices"
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
                <h3 className="text-lg font-semibold text-foreground">No nearby devices</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  No other users are currently online. Try refreshing or check back later.
                </p>
              </motion.div>
            </motion.div>
          )}
          
          <AnimatePresence>
            {devices.map((device, index) => (
              <motion.div
                key={device.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ delay: index * 0.1 }}
                className="flex items-center justify-between p-3 rounded-lg border border-border/50 hover:border-border transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={device.avatar} alt={device.name} />
                      <DeviceAvatar id={device.id} />
                    </Avatar>
                    <motion.div
                      animate={{
                        scale: device.isOnline ? [1, 1.2, 1] : 1,
                      }}
                      transition={{
                        duration: 2,
                        repeat: device.isOnline ? Number.POSITIVE_INFINITY : 0,
                      }}
                      className={`absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-background ${
                        device.isOnline ? "bg-green-500" : "bg-gray-400"
                      }`}
                    />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{device.name}</span>
                      {device.name === 'Mosabbir Maruf' && (
                        <img
                          src="/verified.png"
                          alt="Verified"
                          style={{ width: 18, height: 18, display: 'inline', marginLeft: 0, verticalAlign: 'middle', pointerEvents: 'none', userSelect: 'none' }}
                          draggable={false}
                        />
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant={device.isOnline ? "default" : "secondary"} className="text-xs">
                        {device.status}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{device.lastSeen}</span>
                    </div>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onStartChat(device.id)}
                  disabled={!device.isOnline || device.status === "In Chat" || device.status === "In Room"}
                  className="h-8 w-8 p-0"
                >
                  <MessageCircle className="h-4 w-4" />
                </Button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </CardContent>
    </Card>
  )
}
