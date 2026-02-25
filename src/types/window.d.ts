export {};

declare global {
  interface Window {
    loadIfcFile?: (file: File | string) => Promise<void>;
    fitToExpressIDs?: (expressIDs: number[]) => void;
    saveCurrentView?: () => boolean;
    restoreSavedView?: () => boolean;
  }
}
