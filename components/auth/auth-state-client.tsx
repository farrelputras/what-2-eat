"use client";

import type { User } from "firebase/auth";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

import { subscribeAuthUser } from "@/lib/firebase/client";

import { LogoutButtonClient } from "./logout-button-client";

function initialsOf(displayName: string | null, email: string | null): string {
  const source = displayName ?? email ?? "?";
  return source.trim().charAt(0).toUpperCase() || "?";
}

export function AuthStateClient() {
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => subscribeAuthUser(setUser), []);

  if (user === undefined) {
    return <span aria-hidden className="size-5 rounded-full bg-muted" />;
  }
  if (user === null) {
    return (
      <Link
        className="text-sm font-medium text-foreground transition-colors hover:text-foreground/80"
        href="/login"
      >
        Sign in
      </Link>
    );
  }
  return (
    <span className="flex items-center gap-2.5">
      {user.photoURL ? (
        <Image
          alt=""
          className="size-5 rounded-full object-cover"
          height={20}
          referrerPolicy="no-referrer"
          src={user.photoURL}
          width={20}
        />
      ) : (
        <span
          aria-hidden
          className="flex size-5 items-center justify-center rounded-full bg-muted text-[11px] font-medium"
        >
          {initialsOf(user.displayName, user.email)}
        </span>
      )}
      <span className="hidden max-w-32 truncate text-sm text-muted-foreground sm:inline">
        {user.displayName ?? user.email}
      </span>
      <LogoutButtonClient />
      <span className="sr-only">{`Signed in as ${user.displayName ?? user.email ?? "you"}`}</span>
    </span>
  );
}
