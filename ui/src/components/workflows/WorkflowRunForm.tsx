import { useState, useCallback } from "react";
import { X, Play, Loader2 } from "lucide-react";
import type { TriggerInput } from "@paperclipai/shared";

interface Props {
  inputs: TriggerInput[];
  onSubmit: (payload: Record<string, unknown>) => void;
  onCancel: () => void;
  isPending: boolean;
}

export function WorkflowRunForm({ inputs, onSubmit, onCancel, isPending }: Props) {
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const defaults: Record<string, unknown> = {};
    for (const input of inputs) {
      if (input.defaultValue !== undefined) defaults[input.key] = input.defaultValue;
    }
    return defaults;
  });

  const setValue = useCallback((key: string, value: unknown) => {
    setValues(prev => ({ ...prev, [key]: value }));
  }, []);

  const isVisible = (input: TriggerInput) => {
    if (!input.showWhen) return true;
    return values[input.showWhen.field] === input.showWhen.value;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Validate required fields
    const missing = inputs
      .filter(inp => isVisible(inp) && inp.required && (values[inp.key] === undefined || values[inp.key] === ""))
      .map(inp => inp.label);
    if (missing.length > 0) {
      alert(`Missing required fields: ${missing.join(", ")}`);
      return;
    }
    onSubmit(values);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background border border-border rounded-lg shadow-xl w-full max-w-lg max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="text-sm font-semibold">Start Workflow Run</h3>
          <button onClick={onCancel} className="p-1 rounded-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {inputs.map(input => {
            if (!isVisible(input)) return null;

            return (
              <div key={input.key}>
                <label className="text-xs font-medium text-muted-foreground">
                  {input.label}
                  {input.required && <span className="text-red-500 ml-0.5">*</span>}
                </label>

                {input.type === "text" && (
                  <input
                    type="text"
                    className="w-full mt-1 px-2.5 py-1.5 text-sm border border-border rounded-md bg-background focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-colors"
                    placeholder={input.placeholder}
                    value={(values[input.key] as string) ?? ""}
                    onChange={(e) => setValue(input.key, e.target.value)}
                  />
                )}

                {input.type === "password" && (
                  <input
                    type="password"
                    className="w-full mt-1 px-2.5 py-1.5 text-sm border border-border rounded-md bg-background focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-colors"
                    placeholder={input.placeholder}
                    value={(values[input.key] as string) ?? ""}
                    onChange={(e) => setValue(input.key, e.target.value)}
                  />
                )}

                {input.type === "textarea" && (
                  <textarea
                    className="w-full mt-1 px-2.5 py-1.5 text-sm border border-border rounded-md bg-background resize-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-colors"
                    rows={3}
                    placeholder={input.placeholder}
                    value={(values[input.key] as string) ?? ""}
                    onChange={(e) => setValue(input.key, e.target.value)}
                  />
                )}

                {input.type === "boolean" && (
                  <label className="flex items-center gap-2 mt-1">
                    <input
                      type="checkbox"
                      checked={!!values[input.key]}
                      onChange={(e) => setValue(input.key, e.target.checked)}
                      className="rounded border-border"
                    />
                    <span className="text-sm text-muted-foreground">{input.placeholder ?? "Enable"}</span>
                  </label>
                )}

                {input.type === "select" && (
                  <select
                    className="w-full mt-1 px-2.5 py-1.5 text-sm border border-border rounded-md bg-background focus:ring-1 focus:ring-indigo-500 outline-none transition-colors"
                    value={(values[input.key] as string) ?? ""}
                    onChange={(e) => setValue(input.key, e.target.value)}
                  >
                    <option value="">Select...</option>
                    {input.options?.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                )}
              </div>
            );
          })}

          <div className="flex items-center gap-2 pt-2 border-t border-border">
            <button
              type="submit"
              disabled={isPending}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-indigo-500 text-white rounded-md hover:bg-indigo-600 disabled:opacity-50 transition-colors"
            >
              {isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
              {isPending ? "Starting..." : "Start Run"}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-sm font-medium text-muted-foreground border border-border rounded-md hover:bg-accent transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
