import { supabase } from "./auth/supabase";
import { escape } from "./ui";

const projectList = document.getElementById("project-list")!;

interface Project {
  id: string;
  name: string;
}

export async function init() {
  const projects = await fetchProjects();
  projectList.innerHTML = "";

  for (const { id, name } of projects) {
    const status = "NOT DEPLOYED";
    const color = "gray";

    projectList.innerHTML += `<div style="position: relative; width: 350px; height: 160px">
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="-1 -1 102 42"
            width="100%"
            style="
                stroke: #c0c9cf;
                fill: rgba(0, 0, 0, 0.5);
                stroke-width: 1;
                position: absolute;
                top: 0;
                z-index: -1;
            "
        >
            <path
                d="M5 0 L100 0 L100 35 L95 40 L0 40 L0 5 Z"
                vector-effect="non-scaling-stroke"
            />
        </svg>
        <div style="padding: 0 24px">
            <h2 style="display: inline-block">${escape(name)}</h2>
            <button
                style="
                    display: inline-block;
                    margin: 20px 0;
                    float: right;
                    font-size: 1.5rem;
                "
            >
                &vellip;
            </button>
        </div>
        <p
            style="
                color: ${escape(color)};
                position: absolute;
                left: 24px;
                top: 36px;
            "
        >
            &#9679; ${escape(status)}
        </p>
        <a
            class="highlight"
            style="position: absolute; right: 30px; bottom: 0"
            href="?${id}"
        >
            LAUNCH
        </a>
    </div>`;
  }
}

async function fetchProjects(): Promise<Project[]> {
  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession();

  if (sessionError) {
    throw sessionError;
  }

  const response = await fetch(import.meta.env.VITE_BACKEND + "/projects", {
    headers: {
      Authorization: sessionData.session!.access_token,
    },
  });
  if (!response.ok) {
    throw new Error(response.statusText);
  }

  return await response.json();
}
