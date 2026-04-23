"use client"

import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { FileText, ImageIcon, Music, Archive, Code } from "lucide-react"

interface FileAttachmentProps {
  onFileSelect: (accept: string) => void
  onClose: () => void
}

const fileTypes = [
  {
    label: "Photos & Videos",
    icon: <ImageIcon className="h-5 w-5" />,
    accept: "image/*,video/*",
    color: "text-blue-500",
  },
  {
    label: "Documents",
    icon: <FileText className="h-5 w-5" />,
    accept: ".pdf,.doc,.docx,.txt,.rtf",
    color: "text-green-500",
  },
  {
    label: "Audio",
    icon: <Music className="h-5 w-5" />,
    accept: "audio/*",
    color: "text-purple-500",
  },
  {
    label: "Archives",
    icon: <Archive className="h-5 w-5" />,
    accept: ".zip,.rar,.7z,.tar,.gz",
    color: "text-orange-500",
  },
  {
    label: "Code Files",
    icon: <Code className="h-5 w-5" />,
    accept: ".js,.ts,.jsx,.tsx,.html,.css,.json,.xml",
    color: "text-red-500",
  },
]

export function FileAttachment({ onFileSelect, onClose }: FileAttachmentProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.95 }}
      className="absolute bottom-full left-0 mb-2 z-50"
    >
      <Card className="w-64 p-3 bg-background/95 backdrop-blur-sm border-border/50">
        <div className="space-y-1">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium">Attach File</h4>
            <Button variant="ghost" size="sm" onClick={onClose} className="h-6 w-6 p-0">
              ×
            </Button>
          </div>

          {/* File Upload Illustration */}
          <div className="flex justify-center mb-3">
            <div className="w-16 h-16 opacity-60">
              <img
                src="/illustrations/file-upload.png"
                alt="File upload"
                className="w-full h-full object-contain"
              />
            </div>
          </div>

          {fileTypes.map((type) => (
            <motion.div key={type.label} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
              <Button
                variant="ghost"
                onClick={() => onFileSelect(type.accept)}
                className="w-full justify-start h-auto p-3 hover:bg-accent"
              >
                <div className={`mr-3 ${type.color}`}>{type.icon}</div>
                <div className="text-left">
                  <p className="text-sm font-medium">{type.label}</p>
                  <p className="text-xs text-muted-foreground">{type.accept}</p>
                </div>
              </Button>
            </motion.div>
          ))}

          <div className="border-t border-border/50 pt-2 mt-2">
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
              <Button
                variant="ghost"
                onClick={() => onFileSelect("*/*")}
                className="w-full justify-start h-auto p-3 hover:bg-accent"
              >
                <div className="mr-3 text-gray-500">
                  <FileText className="h-5 w-5" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium">Browse Files</p>
                  <p className="text-xs text-muted-foreground">Select any file type</p>
                </div>
              </Button>
            </motion.div>
          </div>
        </div>
      </Card>
    </motion.div>
  )
}
