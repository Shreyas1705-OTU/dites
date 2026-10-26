import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { GENERAL_ROOM_ID } from "@/lib/chat/data";

// Same message whether the room is missing or private: telling them apart
// would reveal that a private room exists.
export default function RoomNotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="font-heading text-3xl">Room not found</p>
      <p className="max-w-sm text-muted-foreground">It doesn&apos;t exist, or you don&apos;t have access to it.</p>
      <Link href={`/chat/${GENERAL_ROOM_ID}`} className={buttonVariants()}>
        Go to Global chat
      </Link>
    </div>
  );
}
