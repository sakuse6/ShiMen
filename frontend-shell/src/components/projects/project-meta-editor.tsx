import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { invokeCommand } from "@/hooks/use-invoke";
import { Pencil, CheckCircle2, XCircle, X, Plus } from "lucide-react";
import type { ProjectMeta } from "@/types";

interface ProjectMetaEditorProps {
  encodedName: string;
  meta?: ProjectMeta;
  allTags?: string[];
  onUpdate: () => void;
}

export function ProjectMetaEditor({ encodedName, meta, allTags, onUpdate }: ProjectMetaEditorProps) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(meta?.custom_name || "");
  const [notes, setNotes] = useState(meta?.notes || "");
  const [tags, setTags] = useState<string[]>(meta?.tags || []);
  const [tagInput, setTagInput] = useState("");

  const suggestions = useMemo(() => {
    const q = tagInput.trim().toLowerCase();
    const existing = new Set(tags);
    return (allTags ?? []).filter(t => !existing.has(t) && (q === "" || t.toLowerCase().includes(q)));
  }, [allTags, tags, tagInput]);

  const handleSave = async () => {
    await invokeCommand("save_project_meta", {
      encodedName,
      meta: {
        custom_name: name || undefined,
        tags: tags.length > 0 ? tags : undefined,
        notes: notes || undefined,
      },
    });
    setEditing(false);
    onUpdate();
  };

  const handleCancel = () => {
    setName(meta?.custom_name || "");
    setNotes(meta?.notes || "");
    setTags(meta?.tags || []);
    setEditing(false);
  };

  const addTag = () => {
    const trimmed = tagInput.trim();
    if (trimmed && !tags.includes(trimmed)) {
      setTags([...tags, trimmed]);
      setTagInput("");
    }
  };

  const removeTag = (tag: string) => {
    setTags(tags.filter(t => t !== tag));
  };

  if (!editing) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">{t("projectConfig.metaInfo")}</span>
          <Button variant="outline" size="sm" onClick={() => setEditing(true)} className="h-6 text-xs gap-1">
            <Pencil className="size-3" />
            {t("common.edit")}
          </Button>
        </div>
        {meta?.custom_name && (
          <div className="text-sm">
            <span className="text-muted-foreground">{t("projectConfig.customNameColon")}</span>
            {meta.custom_name}
          </div>
        )}
        {meta?.tags && meta.tags.length > 0 && (
          <div className="text-sm">
            <span className="text-muted-foreground">{t("projectConfig.tagsColon")}</span>
            <div className="flex gap-1 mt-1 flex-wrap">
              {meta.tags.map(tag => (
                <span key={tag} className="inline-flex items-center px-1.5 py-0.5 text-xs bg-secondary text-secondary-foreground rounded">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}
        {meta?.notes && (
          <div className="text-sm">
            <span className="text-muted-foreground">{t("projectConfig.notesColon")}</span>
            {meta.notes}
          </div>
        )}
        {!meta?.custom_name && !meta?.tags?.length && !meta?.notes && (
          <p className="text-xs text-muted-foreground">{t("projectConfig.addMetaHint")}</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{t("projectConfig.editMetaInfo")}</span>
        <div className="flex gap-1.5">
          <Button variant="outline" size="sm" onClick={handleCancel} className="h-6 text-xs gap-1 text-destructive border-destructive/40 hover:bg-destructive/10">
            <XCircle className="size-3" />
            {t("common.cancel")}
          </Button>
          <Button size="sm" onClick={handleSave} className="h-6 text-xs gap-1 bg-green-600 hover:bg-green-700 text-white">
            <CheckCircle2 className="size-3" />
            {t("common.save")}
          </Button>
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">{t("projectConfig.customName")}</Label>
        <Input value={name} onChange={e => setName(e.target.value)} placeholder={t("projectConfig.customNamePlaceholder")} className="h-8 text-sm" />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">{t("projectConfig.tags")}</Label>
        <div className="flex gap-1 flex-wrap mb-1">
          {tags.map(tag => (
            <span key={tag} className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs bg-secondary text-secondary-foreground rounded">
              {tag}
              <X className="h-2.5 w-2.5 cursor-pointer" onClick={() => removeTag(tag)} />
            </span>
          ))}
        </div>
        <div className="flex gap-1">
          <Input value={tagInput} onChange={e => setTagInput(e.target.value)} placeholder={t("projectConfig.tagInputPlaceholder")} className="h-7 text-xs" onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addTag(); }}} />
          <Button variant="outline" size="icon-xs" onClick={addTag}>
            <Plus className="h-3 w-3" />
          </Button>
        </div>
        {suggestions.length > 0 && (
          <div className="flex gap-1 flex-wrap">
            {suggestions.map(tag => (
              <button
                key={tag}
                type="button"
                className="inline-flex items-center px-1.5 py-0.5 text-xs border border-dashed rounded hover:bg-accent transition-colors"
                onClick={() => { setTags([...tags, tag]); setTagInput(""); }}
              >
                + {tag}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="space-y-1">
        <Label className="text-xs">{t("projectConfig.notes")}</Label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder={t("projectConfig.notesPlaceholder")} className="w-full min-h-[60px] text-sm border rounded-md px-2 py-1 resize-none" />
      </div>
    </div>
  );
}
