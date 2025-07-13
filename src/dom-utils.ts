// Global variable to hold the root element reference
let globalRootElement: HTMLElement | null = null;

// Function to set the root element (called from React)
export function setRootElement(element: HTMLElement): void {
  globalRootElement = element;
}

// Helper function to get root element for existing modules
export function getRootElement(): HTMLElement {
  if (!globalRootElement) {
    throw new Error('Root element not initialized');
  }
  return globalRootElement;
}