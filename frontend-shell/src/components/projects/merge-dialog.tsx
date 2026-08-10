import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { invokeCommand } from "@/hooks/use-invoke";

interface MergeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedProjects: string[];
  projectNames: Record<string, string>;
  onMergeComplete: () => void;
}

export function MergeDialog({ open, onOpenChange, selectedProjects, projectNames, onMergeComplete }: MergeDialogProps) {
  const { t } = useTranslation();
  const [primary, setPrimary] = useState(selectedProjects[0]);
  const [loading, setLoading] = useState(false);

  const secondaries = selectedProjects.filter(p => p !== primary);
  const getDisplayName = (encoded: string) => {
    const parts = encoded.split("-");
    return parts.length > 1 ? parts.slice(1).join("/") : encoded;
  };

  const handleMerge = async () => {
    setLoading(true);
    try {
      await invokeCommand("merge_projects_logical", {
        primary,
        secondaries,
      });
      onMergeComplete();
      onOpenChange(false);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("projects.mergeTitle")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <p className="text-sm text-muted-foreground mb-3">{t("projects.mergeSelectPrimary")}</p>
            <div className="space-y-2">
              {selectedProjects.map((encoded) => (
                <label
                  key={encoded}
                  className="flex items-center gap-3 rounded-md border px-3 py-2 cursor-pointer hover:bg-accent/50 transition-colors"
                >
                  <input
                    type="radio"
                    name="primary-project"
                    checked={primary === encoded}
                    onChange={() => setPrimary(encoded)}
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">
                      {projectNames[encoded] || getDisplayName(encoded)}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">{encoded}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>
          <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            {t("projects.mergeLogicalHint")}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button onClick={handleMerge} disabled={loading}>
            {loading ? t("projects.merging") : t("projects.mergeConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
