import { supabase } from "./auth/supabase";
import * as ui from "./ui";
import * as canvas from "./canvas";
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
        if (event.data instanceof ArrayBuffer) {
          const reader = new PacketReader(event.data);
          const id = reader.u8();
          if (id === 1) {
            const url = reader.string();
            promptImages.innerHTML += `<img src="${url}" alt="uploaded image" />`;
          } else {
            console.error("Invalid message ID", id);
          }
        } else if (typeof event.data === "string") {
          const parts = event.data.split("|");
          if (parts[0] === "scene") {
            const sceneData = JSON.parse(parts[1]);
            promptInput.value = sceneData[0].prompt;
            canvas.init(sceneData);
          } else if (parts[0] === "machineonline") {
            canvas.setMachineOnline(
              parseInt(parts[1], 10),
              parts[2] === "true",
            );
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
