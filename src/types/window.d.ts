export {};

declare global {
  interface Window {
    loadIfcFile?: (file: File | string) => Promise<void>;
  }
}
