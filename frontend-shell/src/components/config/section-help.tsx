import { HelpCircle } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface SectionHelpProps {
  content: string;
}

export function SectionHelp({ content }: SectionHelpProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="inline-flex items-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors ml-1 -mt-0.5"
          onClick={(e) => e.stopPropagation()}
        >
          <HelpCircle className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="right"
        align="start"
        className="w-80 p-3 text-xs"
      >
        <pre className="whitespace-pre-wrap font-mono leading-relaxed text-muted-foreground">
          {content}
        </pre>
      </PopoverContent>
    </Popover>
  );
}
