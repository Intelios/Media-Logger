const mutationListeners: Array<() => void> = [];

export function onEntriesMutated(fn: () => void): () => void {
  mutationListeners.push(fn);
  return () => {
    const index = mutationListeners.indexOf(fn);
    if (index !== -1) {
      mutationListeners.splice(index, 1);
    }
  };
}

export function notifyEntriesMutated(): void {
  mutationListeners.forEach((fn) => {
    try {
      fn();
    } catch (error) {
      console.error('Error in entry mutation listener:', error);
    }
  });
}
