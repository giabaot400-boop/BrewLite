type ActivationPorts = {
  storage: { migrateToV2: () => Promise<unknown> };
  controller: { start: () => () => void };
  onError: (error: unknown) => void;
};

/** Called by the flag-selected provider effect; storage owns validation and the Web Lock. */
export function activateCartV2({ storage, controller, onError }: ActivationPorts): () => void {
  let active = true;
  let stop: (() => void) | undefined;
  void Promise.resolve()
    .then(() => { if (active) return storage.migrateToV2(); })
    .then(() => { if (active) stop = controller.start(); })
    .catch(error => { if (active) onError(error); });
  return () => { active = false; stop?.(); };
}
