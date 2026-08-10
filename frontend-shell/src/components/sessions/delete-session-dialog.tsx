import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface DeleteSessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  sessionLabel: string;
  confirmationText?: string;
  busy?: boolean;
  onConfirm: () => Promise<void>;
}

export function DeleteSessionDialog({
  open,
  onOpenChange,
  title,
  sessionLabel,
  busy = false,
  onConfirm,
}: DeleteSessionDialogProps) {
  const handleConfirm = async () => {
    await onConfirm();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {"\u5220\u9664\u540e\u4f1a\u79fb\u9664\u672c\u5730\u4f1a\u8bdd\u8bb0\u5f55\u4e0e\u5bf9\u5e94\u6587\u4ef6\uff0c\u6b64\u64cd\u4f5c\u65e0\u6cd5\u64a4\u9500\u3002"}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          <p>{"\u786e\u8ba4\u5220\u9664\u8fd9\u4e2a\u4f1a\u8bdd\uff1f"}</p>
          <p className="mt-1 break-all">{`\u4f1a\u8bdd\uff1a${sessionLabel}`}</p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {"\u53d6\u6d88"}
          </Button>
          <Button variant="destructive" onClick={() => void handleConfirm()} disabled={busy}>
            {"\u5220\u9664"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
