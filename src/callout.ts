import { escape } from "./ui";

/**
 * Shows a callout box pointing at specific screen coordinates
 * @param screenX The x-coordinate of the target position
 * @param screenY The y-coordinate of the target position
 */
export function showCallout(screenX: number, screenY: number) {
  // Calculate optimal position based on available screen space
  const boxWidth = 280; // Estimated width of box
  const boxHeight = 100; // Estimated height of box
  const padding = 20; // Padding from edges
  const lineThickness = 2;
  const lineLength = 30;

  // Determine available space in different directions
  const spaceRight = window.innerWidth - screenX - padding;
  const spaceLeft = screenX - padding;
  const spaceBelow = window.innerHeight - screenY - padding;
  const spaceAbove = screenY - padding;

  // Position variables
  let boxX, boxY;
  let lineStartX, lineStartY, lineEndX, lineEndY;
  let lineAngle, lineActualLength;

  // Determine best position for callout box
  if (spaceRight >= boxWidth || spaceRight >= spaceLeft) {
    // Position to the right
    boxX = screenX + lineLength;
    lineStartX = screenX;
    lineEndX = boxX;
  } else {
    // Position to the left
    boxX = screenX - lineLength - boxWidth;
    lineStartX = screenX;
    lineEndX = boxX + boxWidth;
  }

  if (spaceBelow >= boxHeight || spaceBelow >= spaceAbove) {
    // Position below
    boxY = screenY + lineLength;
    lineStartY = screenY;
    lineEndY = boxY;
  } else {
    // Position above
    boxY = screenY - lineLength - boxHeight;
    lineStartY = screenY;
    lineEndY = boxY + boxHeight;
  }

  // Calculate the line properties
  const dx = lineEndX - lineStartX;
  const dy = lineEndY - lineStartY;
  lineActualLength = Math.sqrt(dx * dx + dy * dy);
  lineAngle = Math.atan2(dy, dx) * (180 / Math.PI);

  // Create container using template string
  const calloutContainer = document.createElement("div");

  // Message content - using escape() for any user-provided content
  const message = escape("Device information");

  // Set HTML using template literal
  calloutContainer.innerHTML = `
    <div style="
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 1000;
      overflow: hidden;
    ">
      <div class="callout-box" style="
        position: absolute;
        left: ${boxX}px;
        top: ${boxY}px;
        background-color: var(--secondary-bg, #0c0d15);
        color: var(--secondary-text, #bbc5ff);
        border: 1px solid var(--border-color, #4054c8);
        padding: 12px;
        border-radius: 4px;
        max-width: 280px;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
        z-index: 1001;
        pointer-events: auto;
      ">
        <div>${message}</div>
        <div class="close-button" style="
          position: absolute;
          top: 5px;
          right: 5px;
          cursor: pointer;
          color: var(--secondary, #c0c9cf);
          font-size: 14px;
          font-weight: bold;
          pointer-events: auto;
        ">×</div>
      </div>
      <div style="
        position: absolute;
        background-color: var(--primary-color, #4de8fc);
        width: ${lineActualLength}px;
        height: ${lineThickness}px;
        left: ${lineStartX}px;
        top: ${lineStartY}px;
        transform: rotate(${lineAngle}deg);
        transform-origin: 0 0;
        z-index: 1000;
      "></div>
    </div>
  `;

  // Add container to body
  document.body.appendChild(calloutContainer);

  // Add close functionality
  const closeButton = calloutContainer.querySelector(".close-button");
  if (closeButton) {
    closeButton.addEventListener("click", () => {
      document.body.removeChild(calloutContainer);
    });
  }

  // Return the container for potential further manipulations
  return calloutContainer;
}
