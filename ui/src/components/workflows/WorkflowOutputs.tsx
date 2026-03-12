import { FileText, Image, Download, ExternalLink } from "lucide-react";
import type { WorkflowStepRun } from "@paperclipai/shared";

interface Props {
  stepRuns: (WorkflowStepRun & { step?: { name: string; stepType: string; stepOrder: number } | null })[];
}

export function WorkflowOutputs({ stepRuns }: Props) {
  // Find the last succeeded step run (highest step_order)
  const succeededRuns = stepRuns
    .filter(sr => sr.status === "succeeded" && sr.output && Object.keys(sr.output).length > 0)
    .sort((a, b) => (b.step?.stepOrder ?? 0) - (a.step?.stepOrder ?? 0));

  const lastRun = succeededRuns[0];
  if (!lastRun?.output) {
    return <p className="text-xs text-muted-foreground">No output available.</p>;
  }

  const output = lastRun.output as Record<string, unknown>;
  const files = output.files as Array<{ name: string; content?: string; mimeType?: string; size?: number; url?: string }> | undefined;

  if (Array.isArray(files) && files.length > 0) {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {files.map((file, idx) => {
          const isHtml = file.mimeType?.includes("html") || file.name?.endsWith(".html");
          const isImage = file.mimeType?.startsWith("image/") || /\.(png|jpg|jpeg|gif|svg|webp)$/i.test(file.name ?? "");

          return (
            <div
              key={idx}
              className="border border-border rounded-lg p-3 space-y-2 bg-muted/20"
            >
              <div className="flex items-center gap-2">
                {isImage ? (
                  <Image className="h-4 w-4 text-green-500 shrink-0" />
                ) : (
                  <FileText className="h-4 w-4 text-blue-500 shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium truncate">{file.name}</p>
                  {file.size && (
                    <p className="text-[10px] text-muted-foreground">
                      {file.size > 1024 ? `${(file.size / 1024).toFixed(1)} KB` : `${file.size} B`}
                    </p>
                  )}
                </div>
              </div>

              {isHtml && file.content && (
                <div className="space-y-1">
                  <iframe
                    srcDoc={file.content}
                    className="w-full h-48 border border-border rounded bg-white"
                    sandbox="allow-scripts"
                    title={file.name}
                  />
                  <button
                    onClick={() => {
                      const blob = new Blob([file.content!], { type: "text/html" });
                      const url = URL.createObjectURL(blob);
                      window.open(url, "_blank");
                    }}
                    className="flex items-center gap-1 text-[10px] text-indigo-600 hover:underline"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Open in new tab
                  </button>
                </div>
              )}

              {isImage && file.content && (
                <img
                  src={file.content.startsWith("data:") ? file.content : `data:${file.mimeType ?? "image/png"};base64,${file.content}`}
                  alt={file.name}
                  className="w-full h-32 object-contain rounded border border-border bg-white"
                />
              )}

              {file.url && (
                <a
                  href={file.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[10px] text-indigo-600 hover:underline"
                >
                  <Download className="h-3 w-3" />
                  Download
                </a>
              )}

              {file.content && !isHtml && !isImage && (
                <button
                  onClick={() => {
                    const blob = new Blob([file.content!], { type: file.mimeType ?? "application/octet-stream" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = file.name;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  className="flex items-center gap-1 text-[10px] text-indigo-600 hover:underline"
                >
                  <Download className="h-3 w-3" />
                  Download
                </button>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // Fallback: JSON view
  return (
    <div>
      <p className="text-[10px] text-muted-foreground mb-1">
        Output from: {lastRun.step?.name ?? "Final step"}
      </p>
      <pre className="text-[11px] font-mono bg-muted/50 rounded-md p-3 overflow-x-auto whitespace-pre-wrap max-h-60">
        {JSON.stringify(output, null, 2)}
      </pre>
    </div>
  );
}
