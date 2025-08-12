export function showMessage(
  element: HTMLElement,
  message: string,
  type: "success" | "error",
) {
  if (type === "error") {
    element.classList.add("negative");
  } else {
    element.classList.remove("negative");
  }
  element.classList.add("message");

  let i = 0;
  const interval = setInterval(() => {
    element.innerText = message.substring(0, i++);
    if (i > message.length) {
      clearInterval(interval);
    }
  }, 15);
}

export function escape(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function html(strings: TemplateStringsArray, ...values: any[]): Element {
  const element = document.createElement("template");
  element.innerHTML = strings.reduce((acc, str, i) => {
    const value = values[i];
    const escapedValue = value != null ? escape(String(value)) : "";
    return acc + str + escapedValue;
  }, "");
  return element.content.firstElementChild!;
}

export function loadingText(element: HTMLElement): () => void {
  let initialText = element.innerText;

  const animation = [
    "PROCESSING",
    "< PROCESSING >",
    "<< PROCESSING >>",
    "<<< PROCESSING >>>",
  ];
  let index = 0;
  const interval = setInterval(() => {
    element.innerText = animation[index++ % animation.length];
  }, 200);

  return () => {
    clearInterval(interval);
    element.innerText = initialText;
  };
}
