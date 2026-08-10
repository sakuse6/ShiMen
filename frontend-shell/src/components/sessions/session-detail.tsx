import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Pencil } from "lucide-react";
import { MessageView } from "./message-view";
import { RenameSessionDialog } from "./rename-session-dialog";
import type { Message } from "@/types";

interface SessionDetailProps {
  sessionId: string;
  displayName: string;
  messages: Message[];
  onBack: () => void;
  onRenamed: () => void;
}

export function SessionDetail({ sessionId, displayName, messages, onBack, onRenamed }: SessionDetailProps) {
  const [renameOpen, setRenameOpen] = useState(false);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h3 className="font-medium">{displayName}</h3>
          <span className="text-xs text-muted-foreground">{sessionId.slice(0, 8)}</span>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setRenameOpen(true)}>
          <Pencil className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex-1 overflow-hidden">
        <MessageView messages={messages} />
      </div>
      <RenameSessionDialog
        open={renameOpen}
        onOpenChange={setRenameOpen}
        sessionId={sessionId}
        currentName={displayName}
        onRenamed={onRenamed}
      />
    </div>
  );
}
