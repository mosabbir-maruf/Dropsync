"use client"

import { useState, useEffect, useRef } from "react"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Square, Send, X } from "lucide-react"
import { getAudioConstraints } from "@/lib/media-config"
import { useToast } from "@/hooks/use-toast"
import { useIsMobile, useSafeAreaInsets } from "@/hooks/use-mobile"

interface VoiceRecorderProps {
  onRecorded: (duration: number, audioBlob: Blob) => void
  onCancel: () => void
}

export function VoiceRecorder({ onRecorded, onCancel }: VoiceRecorderProps) {
  const [duration, setDuration] = useState(0)
  const [isRecording, setIsRecording] = useState(true)
  const [mediaBlob, setMediaBlob] = useState<Blob | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const { toast } = useToast()
  const isMobile = useIsMobile()
  const safeAreaInsets = useSafeAreaInsets()

  useEffect(() => {
    if (isRecording && typeof window !== 'undefined') {
      setDuration(0);
      timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
      
      // Check if mediaDevices is available
      if (!navigator.mediaDevices) {
        toast({
          title: "Microphone Not Supported",
          description: "Please use a modern browser with microphone support.",
          variant: "destructive",
        });
        onCancel();
        return;
      }

      const audioConstraints = getAudioConstraints('direct'); // Use crystal clear quality for voice notes
      navigator.mediaDevices.getUserMedia(audioConstraints)
        .then((stream) => {
          const mediaRecorder = new MediaRecorder(stream)
          mediaRecorderRef.current = mediaRecorder
          mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) {
              chunksRef.current.push(e.data)
            }
          }
          mediaRecorder.onstop = () => {
            const blob = new Blob(chunksRef.current, { type: "audio/webm" })
            setMediaBlob(blob)
            chunksRef.current = []
          }
          mediaRecorder.start()
        })
        .catch((err) => {
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
          
          toast({
            title: errorTitle,
            description: errorDescription,
            variant: "destructive",
          });
          onCancel();
        });
    }
    return () => {
      mediaRecorderRef.current?.stop()
      if (timerRef.current) clearInterval(timerRef.current);
    }
  }, [isRecording, toast])

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  const handleStop = () => {
    setIsRecording(false)
    mediaRecorderRef.current?.stop()
    if (timerRef.current) clearInterval(timerRef.current);
  }

  const handleSend = () => {
    if (mediaBlob) {
      onRecorded(duration, mediaBlob)
    }
  }

  const handleCancel = () => {
    setIsRecording(false)
    onCancel()
    if (timerRef.current) clearInterval(timerRef.current);
  }

  // Calculate bottom position based on mobile and safe area
  const getBottomPosition = () => {
    if (isMobile) {
      // On mobile, position it above the input area with safe area consideration
      // Add extra padding to ensure it's not cut off
      const basePosition = 5 // 5rem base
      const safeAreaBottom = safeAreaInsets.bottom || 0
      const extraPadding = 1 // 1rem extra padding
      
      // Use CSS env() function for better mobile support
      return `calc(${basePosition}rem + env(safe-area-inset-bottom, ${safeAreaBottom}px) + ${extraPadding}rem)`
    }
    return '5rem' // 20 units in Tailwind
  }

  // Get dynamic positioning for mobile
  const getMobilePositioning = () => {
    if (!isMobile) return {}
    
    // Get viewport height for very small screens
    const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 0
    const isSmallScreen = viewportHeight < 600 // Very small mobile screens
    
    return {
      position: 'fixed' as const,
      bottom: getBottomPosition(),
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 9999,
      maxWidth: isSmallScreen ? 'calc(100vw - 1rem)' : 'calc(100vw - 2rem)',
      width: isSmallScreen ? 'calc(100vw - 1rem)' : 'calc(100vw - 2rem)',
      margin: isSmallScreen ? '0 0.5rem' : '0 1rem',
      // Ensure it's above all other elements
      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
      // For very small screens, reduce padding
      ...(isSmallScreen && {
        padding: '0.75rem',
        fontSize: '0.875rem',
      }),
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className={`fixed left-1/2 -translate-x-1/2 z-[9999] ${isMobile ? 'voice-recorder-container' : ''}`}
      style={{
        ...getMobilePositioning(),
        // Fallback for non-mobile
        ...(isMobile ? {} : {
          bottom: getBottomPosition(),
          maxWidth: '400px',
          width: 'auto',
          margin: '0',
        }),
      }}
    >
      <Card className={`bg-background/95 backdrop-blur-sm border-border/50 shadow-xl rounded-2xl ${
        isMobile ? 'min-w-full' : 'min-w-[300px]'
      } ${isMobile && typeof window !== 'undefined' && window.innerHeight < 600 ? 'p-3' : 'p-4'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
            <motion.div
              animate={{ scale: isRecording ? [1, 1.2, 1] : 1 }}
              transition={{ duration: 1, repeat: isRecording ? Number.POSITIVE_INFINITY : 0 }}
              className={`h-3 w-3 rounded-full flex-shrink-0 ${isRecording ? "bg-red-500" : "bg-muted"}`}
            />
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 min-w-0 flex-1">
              <span className="text-sm font-medium truncate">{isRecording ? "Recording..." : "Voice Note"}</span>
              <span className="text-sm text-muted-foreground flex-shrink-0">{formatDuration(duration)}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {isRecording ? (
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Button variant="destructive" size="sm" onClick={handleStop} className="h-8 w-8 p-0 rounded-full">
                  <Square className="h-4 w-4" />
                </Button>
              </motion.div>
            ) : (
              <>
                <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                  <Button variant="ghost" size="sm" onClick={handleCancel} className="h-8 w-8 p-0 rounded-full">
                    <X className="h-4 w-4" />
                  </Button>
                </motion.div>
                <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                  <Button variant="default" size="sm" onClick={handleSend} className="h-8 w-8 p-0">
                    <Send className="h-4 w-4" />
                  </Button>
                </motion.div>
              </>
            )}
          </div>
        </div>

        {/* Waveform visualization */}
        {isRecording && (
          <div className="flex items-center justify-center gap-1 mt-3">
            <div className="w-8 h-8 mr-2 opacity-60">
              <img
                src="/illustrations/voice-wave.png"
                alt="Voice recording"
                className="w-full h-full object-contain"
              />
            </div>
            {Array.from({ length: isMobile ? 15 : 20 }).map((_, i) => (
              <motion.div
                key={i}
                className="w-1 bg-primary rounded-full"
                animate={{
                  height: [4, Math.random() * 20 + 4, 4],
                }}
                transition={{
                  duration: 0.5,
                  repeat: Number.POSITIVE_INFINITY,
                  delay: i * 0.1,
                }}
              />
            ))}
          </div>
        )}
      </Card>
    </motion.div>
  )
}
