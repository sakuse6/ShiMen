import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { invokeCommand } from "@/hooks/use-invoke";
import { useTranslation } from "react-i18next";

interface RenameSessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  currentName: string;
  onRenamed: () => void;
}

export function RenameSessionDialog({ open, onOpenChange, sessionId, currentName, onRenamed }: RenameSessionDialogProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(currentName);

  useEffect(() => {
    setName(currentName);
  }, [currentName, open]);

  const handleSubmit = async () => {
    if (name.trim()) {
      await invokeCommand("rename_session", { sessionId, name: name.trim() });
    } else {
      await invokeCommand("delete_session_name", { sessionId });
    }
    onRenamed();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("sessions.renameTitle")}</DialogTitle>
        </DialogHeader>
        <div className="py-4">
          <Input
            placeholder={t("sessions.renamePlaceholder")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          />
          <p className="mt-2 text-xs text-muted-foreground">{t("sessions.sessionId")}{sessionId.slice(0, 16)}...</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button onClick={handleSubmit}>{t("common.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
