import { supabase } from "./auth/supabase";
import * as ui from "./ui";
import * as canvas from "./canvas";

const promptInput = document.querySelector(
  "#prompt-input",
)! as HTMLTextAreaElement;
const promptMessage = document.querySelector("#prompt-message")! as HTMLElement;
const editorControls = document.querySelector(
  "#editor-controls",
)! as HTMLElement;

let projectId: string;
let websocket: WebSocket | undefined;

export function init(project: string) {
  projectId = project;
  editorControls.style["display"] = "flex";
  canvas.init(projectId);

  if (!websocket) {
    websocket = new WebSocket(import.meta.env.VITE_BACKEND);
    websocket.onopen = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        console.error(error);
        return;
      }

      websocket!.send(data.session!.access_token!);
    };

    websocket.onclose = (event) => {
      websocket = undefined;
      console.log("WebSocket closed", event.code, event.reason);
    };
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
          Authorization: `${data.session.access_token}`,
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
