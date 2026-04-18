import { useEffect, type RefObject } from "react";
import { usePapeeTargetRegistryOptional, type PapeeTargetCategory } from "../context/PapeeTargetRegistry";

interface UsePapeeTargetOptions {
  id: string;
  label: string;
  category: PapeeTargetCategory;
  priority?: number;
  enabled?: boolean;
}

/**
 * Register a DOM element as a Papee target. Automatically unregisters on unmount.
 * No-op if PapeeTargetRegistry is not mounted.
 */
export function usePapeeTarget(
  ref: RefObject<HTMLElement | null>,
  options: UsePapeeTargetOptions,
) {
  const registry = usePapeeTargetRegistryOptional();

  useEffect(() => {
    if (!registry || !ref.current || options.enabled === false) return;

    const element = ref.current;
    registry.registerTarget({
      id: options.id,
      label: options.label,
      category: options.category,
      priority: options.priority ?? 0,
      element,
    });

    return () => {
      registry.unregisterTarget(options.id);
    };
  }, [registry, ref, options.id, options.label, options.category, options.priority, options.enabled]);
}
