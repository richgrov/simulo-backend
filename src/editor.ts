import { supabase } from "./auth/supabase";
import * as ui from "./ui";
import * as canvas from "./canvas";
import { getRootElement } from "./dom-utils";

function getEditorElements() {
  const root = getRootElement();
  return {
    promptInput: root.querySelector("#prompt-input")! as HTMLTextAreaElement,
    promptMessage: root.querySelector("#prompt-message")! as HTMLElement,
    editorControls: root.querySelector("#editor-controls")! as HTMLElement,
    promptSubmitBtn: root.querySelector("#prompt-submit")! as HTMLButtonElement,
  };
}

let projectId: string;

export function init(project: string) {
  projectId = project;
  const { editorControls } = getEditorElements();
  editorControls.style.display = "flex";
  canvas.init(projectId);
  
  // Initialize event listeners when init is called
  initializeEventListeners();
}

// Initialize event listeners
function initializeEventListeners() {
  const { promptSubmitBtn, promptMessage, promptInput } = getEditorElements();
  
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
}
