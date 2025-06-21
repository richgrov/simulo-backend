import { supabase } from "./auth/supabase";
import { showMessage } from "./ui";
import * as canvas from "./canvas";

canvas.init();

const promptInput = document.querySelector(
  "#prompt-input",
)! as HTMLTextAreaElement;
const promptMessage = document.querySelector("#prompt-message")! as HTMLElement;
const editorControls = document.querySelector(
  "#editor-controls",
)! as HTMLElement;

let projectId: string;

export function init(project: string) {
  projectId = project;
  editorControls.style.removeProperty("display");
}

document
  .querySelector("#prompt-submit")!
  .addEventListener("click", async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      console.error(error);
      showMessage(promptMessage, `Error: ${error.message}`, "error");
      return;
    }

    if (!data.session) {
      console.error("No session present");
      showMessage(promptMessage, "Internal error.", "error");
      return;
    }

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

      if (!response.ok) {
        const error = await response.text();
        showMessage(promptMessage, `API ERROR: ${error}`, "error");
      } else {
        const output = await response.blob();
        showMessage(promptMessage, "INITIALIZING DOWNLOAD", "success");
        const url = URL.createObjectURL(output);
        const a = document.createElement("a");
        a.href = url;
        a.download = "program.wasm";
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error("Fetch error:", error);
      showMessage(
        promptMessage,
        `NETWORKING ERROR- VERIFY CONNECTION AND RETRY`,
        "error",
      );
    }
  });
