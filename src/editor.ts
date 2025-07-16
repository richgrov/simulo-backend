import { supabase } from "./auth/supabase";
import * as ui from "./ui";
import * as canvas from "./canvas";
import { RetryWebsocket } from "./websocket";

const promptInput =
  document.querySelector<HTMLTextAreaElement>("#prompt-input")!;
const promptMessage = document.querySelector<HTMLElement>("#prompt-message")!;
const editorControls = document.querySelector<HTMLElement>("#editor-controls")!;
const fileDropOverlay =
  document.querySelector<HTMLElement>("#file-drop-overlay")!;
const promptImages = document.querySelector<HTMLElement>("#prompt-images")!;

let projectId: string;
let websocket: RetryWebsocket | undefined;

export function init(project: string) {
  projectId = project;
  editorControls.style["display"] = "flex";

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
      },
      (event) => {
        if (typeof event.data !== "string") {
          console.error("Invalid message type", event.data);
          return;
        }

        const parts = event.data.split("|");
        if (parts[0] === "scene") {
          canvas.init(parts[1]);
        } else if (parts[0] === "machineonline") {
          canvas.setMachineOnline(parseInt(parts[1], 10), parts[2] === "true");
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
    const response = await fetch(
      import.meta.env.VITE_BACKEND + `/project/${projectId}/agent`,
      {
        method: "POST",
        headers: {
          Authorization: data.session.access_token,
        },
        body: promptInput.value,
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

document.addEventListener("drop", (event) => {
  if (typeof websocket === "undefined") {
    return;
  }

  event.preventDefault();
  dragStack--;
  setTimeout(updateDragIndicator, 0);

  const files = event.dataTransfer?.files;
  if (files) {
    for (const file of files) {
      const url = URL.createObjectURL(file);
      const img = document.createElement("img");
      img.src = url;
      promptImages.appendChild(img);
    }
  }
});
