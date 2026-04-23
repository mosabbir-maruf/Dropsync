'use client';

import { useUserProfile } from "@/hooks/useUserProfile";

export function UserNavbar() {
  const { username, avatar } = useUserProfile();

  return (
    <nav className="w-full flex items-center justify-between px-4 py-2 border-b bg-background/80 backdrop-blur-md sticky top-0 z-50">
      <div className="flex items-center gap-2">
        <img
          src={avatar ?? "/placeholder-user.jpg"}
          alt="User Avatar"
          className="h-10 w-10 rounded-full object-cover border"
        />
        <span className="font-semibold text-base truncate max-w-[120px] sm:max-w-xs">{username ?? "Loading..."}</span>
      </div>
      <span className="hidden sm:block font-bold text-lg tracking-tight">ChatConnect</span>
    </nav>
  );
} 