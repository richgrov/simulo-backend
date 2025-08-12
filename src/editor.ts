import { supabase } from "./auth/supabase";
import * as ui from "./ui";
import * as canvas from "./canvas/canvas";
import EditorScene from "./canvas/editor-scene";
import { RetryWebsocket } from "./websocket";
import { Packet, PacketReader } from "../util/packet";

const promptInput =
  document.querySelector<HTMLTextAreaElement>("#prompt-input")!;
const promptMessage = document.querySelector<HTMLElement>("#prompt-message")!;
const editorControls = document.querySelector<HTMLElement>("#editor-controls")!;
const fileDropOverlay =
  document.querySelector<HTMLElement>("#file-drop-overlay")!;
const promptImages = document.querySelector<HTMLElement>("#prompt-images")!;

const uploadedImages = new Array<File>();

let projectId: string;
let websocket: RetryWebsocket | undefined;

// Helper functions for prompt persistence
function getPromptStorageKey(): string {
  return `simulo_prompt_${projectId}`;
}

function savePromptToStorage(): void {
  try {
    const key = getPromptStorageKey();
    const promptText = promptInput.value;
    localStorage.setItem(key, promptText);
    console.log("Prompt saved to localStorage:", promptText);
  } catch (error) {
    console.warn("Failed to save prompt to localStorage:", error);
  }
}

function loadSavedPrompt(): void {
  try {
    const key = getPromptStorageKey();
    const savedPrompt = localStorage.getItem(key);
    if (savedPrompt && savedPrompt.trim() !== "") {
      promptInput.value = savedPrompt;
      console.log("Prompt loaded from localStorage:", savedPrompt);
    }
  } catch (error) {
    console.warn("Failed to load prompt from localStorage:", error);
  }
}

function clearOldPromptData(): void {
  try {
    // Clear prompts from other projects to avoid interference
    const currentKey = getPromptStorageKey();
    const keysToRemove: string[] = [];
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('simulo_prompt_') && key !== currentKey) {
        keysToRemove.push(key);
      }
    }
    
    keysToRemove.forEach(key => {
      localStorage.removeItem(key);
      console.log("Cleared old prompt data:", key);
    });
  } catch (error) {
    console.warn("Failed to clear old prompt data:", error);
  }
}

export function init(project: string) {
  projectId = project;
  editorControls.style["display"] = "flex";
  const scene = new EditorScene(canvas.renderer);
  canvas.setScene(scene);

  clearOldPromptData();

  loadSavedPrompt();

  // auto-save functionality
  promptInput.addEventListener("input", () => {
    savePromptToStorage();
  });

  // Save prompt when page is about to unload
  window.addEventListener("beforeunload", () => {
    savePromptToStorage();
  });

  // Save prompt when page loses focus
  window.addEventListener("blur", () => {
    savePromptToStorage();
  });

  if (!websocket) {
    websocket = new RetryWebsocket(
      import.meta.env.VITE_BACKEND,
      async () => {
        const { data, error } = await supabase.auth.getSession();
        if (error) {
          console.error(error);
          return;
        }

        websocket!.send(data.session!.access_token! + "|" + projectId);
        promptImages.innerHTML = "";
      },
      (event) => {
        if (event.data instanceof ArrayBuffer) {
          const reader = new PacketReader(event.data);
          const id = reader.u8();
          switch (id) {
            case 1: {
              const url = reader.string();
              const element = document.createElement("div");
              const index = promptImages.children.length;
              element.innerHTML = `<img src="${url}" alt="uploaded image"><button class="delete-button">X</button>`;
              element.addEventListener("click", () => {
                const packet = new Packet();
                packet.u8(1);
                packet.u8(index);
                websocket!.send(packet.toBuffer());
              });
              promptImages.appendChild(element);
              break;
            }

            case 2: {
              const index = reader.u8()!;
              const element = promptImages.children[index];
              element?.remove();
              break;
            }

            default:
              console.error("Invalid message ID", id);
          }
        } else if (typeof event.data === "string") {
          const parts = event.data.split("|");
          if (parts[0] === "scene") {
            const sceneData = JSON.parse(parts[1]);
            promptInput.value = sceneData[0].prompt;
            scene.initSceneData(sceneData);
            // Save the updated prompt to localStorage
            savePromptToStorage();
          } else if (parts[0] === "machineonline") {
            scene.setMachineOnline(parseInt(parts[1], 10), parts[2] === "true");
          }
        } else {
          console.error("Invalid message type", event.data);
        }
      },
    );
  }
}

const promptSubmitBtn = document.querySelector(
  "#prompt-submit",
)! as HTMLButtonElement;

promptSubmitBtn.addEventListener("click", async () => {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.error(error);
    ui.showMessage(promptMessage, `Error: ${error.message}`, "error");
    return;
  }

  if (!data.session) {
    console.error("No session present");
    ui.showMessage(promptMessage, "Internal error.", "error");
    return;
  }

  let stopAnimation = ui.loadingText(promptSubmitBtn);

  try {
    const formData = new FormData();
    formData.append("prompt", promptInput.value);
    for (const file of uploadedImages) {
      formData.append("images", file);
    }

    const response = await fetch(
      import.meta.env.VITE_BACKEND + `/project/${projectId}/agent`,
      {
        method: "POST",
        headers: {
          Authorization: data.session.access_token,
        },
        body: formData,
      },
    );

    const text = await response.text();

    if (!response.ok) {
      ui.showMessage(promptMessage, `ERROR: ${text}`, "error");
    } else {
      ui.showMessage(promptMessage, "OPERATION SUCCESSFUL", "success");
    }
  } catch (error) {
    console.error("Fetch error:", error);
    ui.showMessage(
      promptMessage,
      `NETWORKING ERROR- VERIFY CONNECTION AND RETRY`,
      "error",
    );
  } finally {
    stopAnimation();
  }
});

let dragStack = 0;

function updateDragIndicator() {
  if (dragStack > 0) {
    fileDropOverlay.style.display = "flex";
  } else {
    fileDropOverlay.style.display = "none";
  }
}

document.addEventListener("dragenter", (event) => {
  if (typeof websocket === "undefined") {
    return;
  }

  event.preventDefault();

  dragStack++;
  setTimeout(updateDragIndicator, 0);
});

document.addEventListener("dragover", (event) => {
  event.preventDefault();
});

document.addEventListener("dragleave", (event) => {
  if (typeof websocket === "undefined") {
    return;
  }

  event.preventDefault();

  dragStack--;
  setTimeout(updateDragIndicator, 0);
});

document.addEventListener("drop", async (event) => {
  if (typeof websocket === "undefined") {
    return;
  }

  event.preventDefault();
  dragStack--;
  setTimeout(updateDragIndicator, 0);

  const files = event.dataTransfer?.files;
  if (!files) {
    return;
  }

  const fileData = await Promise.all(
    Array.from(files).map((file) => file.arrayBuffer()),
  );

  const packet = new Packet();
  packet.u8(0);
  packet.u8(fileData.length);

  for (const data of fileData) {
    packet.dynbytes(new Uint8Array(data));
  }

  websocket.send(packet.toBuffer());
});