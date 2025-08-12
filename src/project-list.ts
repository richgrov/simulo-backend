import { supabase } from "./auth/supabase";
import { html } from "./ui";

import * as canvas from "./canvas/canvas";
import LocationsScene from "./canvas/locations-scene";
import { Location } from "./models";

const projectList = document.getElementById("project-list")!;

interface Project {
  id: number;
  name: string;
}

export async function init() {
  const projects = await fetchProjects();
  const locations = await fetchLocations();

  const locationsScene = new LocationsScene(canvas.renderer);
  locationsScene.addLocations(locations);
  canvas.setScene(locationsScene);

  projectList.innerHTML = "";
}
// Export refresh function so it can be called from other parts of the app
export async function refreshProjectList() {
  await refreshProjects();
}

async function refreshProjects() {
  try {
    const projects = await fetchProjects();
    
    projectList.innerHTML = "";

    const createProjectCard = html`<div
      id="create-project-card"
      style="position: relative; width: 350px; height: 160px; cursor: pointer"
    >
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
        <h2 style="display: inline-block">Create New Project</h2>
      </div>
    </div>`;
    projectList.appendChild(createProjectCard);
    createProjectCard.addEventListener("click", handleCreateProject);

    for (const { id, name } of projects) {
      // Ensure we have valid data
      if (id == null || name == null) {
        continue;
      }
      
      const status = "NOT DEPLOYED";
      const color = "gray";

      projectList.appendChild(
        html`<div style="position: relative; width: 350px; height: 160px">
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
            <h2 style="display: inline-block">${String(name)}</h2>
            <button
              id="project-menu-${String(id)}"
              class="project-menu-btn"
              data-project-id="${String(id)}"
              data-project-name="${String(name)}"
              style="
                      display: inline-block;
                      margin: 20px 0;
                      float: right;
                      font-size: 1.5rem;
                      cursor: pointer;
                      background: none;
                      border: none;
                      color: #c0c9cf;
                  "
            >
              &vellip;
            </button>
          </div>
          <p
            style="
                  color: ${color};
                  position: absolute;
                  left: 24px;
                  top: 36px;
              "
          >
            &#9679; ${status}
          </p>
          <a
            class="highlight"
            style="position: absolute; right: 30px; bottom: 0"
            href="?${String(id)}"
          >
            LAUNCH
          </a>
        </div>`,
      );
    }

    addProjectMenuEventListeners();

    if (projects.length === 0) {
      const noProjectsMsg = html`<div style="
        text-align: center; 
        color: #c0c9cf; 
        margin-top: 40px; 
        font-style: italic;
      ">
        No projects yet. Click "Create New Project" to get started!
      </div>`;
      projectList.appendChild(noProjectsMsg);
    }
  } catch (error) {
    console.error("Error in refreshProjects:", error);
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

async function fetchLocations(): Promise<Location[]> {
  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession();

  if (sessionError) {
    throw sessionError;
  }

  const response = await fetch(import.meta.env.VITE_BACKEND + "/locations", {
    headers: {
      Authorization: sessionData.session!.access_token,
    },
  });
  if (!response.ok) {
    throw new Error(response.statusText);
  }

  return await response.json();
}

async function handleCreateProject() {
  try {
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
      const errorText = await response.text();
      console.error("Failed to fetch projects:", response.status, errorText);
      throw new Error(`Failed to fetch projects: ${response.statusText}`);
    }

    const projects = await response.json();
    
    return projects || [];
  } catch (error) {
    console.error("Error fetching projects:", error);
    throw error;
  }
}

async function handleCreateProject() {
  try {
    const { data: sessionData, error: sessionError } =
      await supabase.auth.getSession();

    if (sessionError) {
      throw sessionError;
    }

    const response = await fetch(import.meta.env.VITE_BACKEND + "/projects/create", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: sessionData.session!.access_token,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Failed to create project:", response.status, errorText);
      throw new Error(`Failed to create project: ${response.statusText}`);
    }

    const newProject = await response.json();
    
    window.location.href = `?${newProject.id}`;
  } catch (error) {
    console.error("Create project error:", error);
    alert("Failed to create project. Please try again.");
  }
}

// Project management functions
function addProjectMenuEventListeners(): void {
  const menuButtons = document.querySelectorAll('.project-menu-btn');
  menuButtons.forEach(button => {
    button.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const projectId = button.getAttribute('data-project-id');
      const projectName = button.getAttribute('data-project-name');
      if (projectId && projectName) {
        showProjectMenu(parseInt(projectId), projectName, button as HTMLElement);
      }
    });
  });
}

function showProjectMenu(projectId: number, projectName: string, buttonElement: HTMLElement): void {
  const existingMenu = document.querySelector('.project-menu-dropdown');
  if (existingMenu) {
    existingMenu.remove();
  }

  const menu = html`<div class="project-menu-dropdown" style="
    position: absolute;
    top: 100%;
    right: 0;
    background: #2a2a2a;
    border: 1px solid #c0c9cf;
    border-radius: 4px;
    padding: 8px 0;
    z-index: 1000;
    min-width: 120px;
    box-shadow: 0 4px 8px rgba(0,0,0,0.3);
  ">
    <button class="menu-option rename-option" data-project-id="${projectId}" data-project-name="${projectName}" style="
      display: block;
      width: 100%;
      padding: 8px 16px;
      background: none;
      border: none;
      color: #c0c9cf;
      text-align: left;
      cursor: pointer;
      font-size: 14px;
      transition: background-color 0.2s;
    " onmouseover="this.style.backgroundColor='#3a3a3a'" onmouseout="this.style.backgroundColor='transparent'">Rename</button>
    <button class="menu-option delete-option" data-project-id="${projectId}" data-project-name="${projectName}" style="
      display: block;
      width: 100%;
      padding: 8px 16px;
      background: none;
      border: none;
      color: #ff6b6b;
      text-align: left;
      cursor: pointer;
      font-size: 14px;
      transition: background-color 0.2s;
    " onmouseover="this.style.backgroundColor='#3a3a3a'" onmouseout="this.style.backgroundColor='transparent'">Delete</button>
  </div>`;

  const projectCard = buttonElement.closest('[style*="position: relative"]') as HTMLElement;
  if (projectCard) {
    projectCard.style.position = 'relative';
    projectCard.appendChild(menu);
    
    const menuElement = projectCard.querySelector('.project-menu-dropdown') as HTMLElement;
    if (menuElement) {
      menuElement.style.position = 'absolute';
      menuElement.style.top = '40px';
      menuElement.style.right = '24px';
    }
  }


  const renameOption = menu.querySelector('.rename-option');
  const deleteOption = menu.querySelector('.delete-option');

  renameOption?.addEventListener('click', () => {
    handleRenameProject(projectId, projectName);
    menu.remove();
  });

  deleteOption?.addEventListener('click', () => {
    handleDeleteProject(projectId, projectName);
    menu.remove();
  });

  setTimeout(() => {
    document.addEventListener('click', function closeMenu(e) {
      if (!menu.contains(e.target as Node) && !buttonElement.contains(e.target as Node)) {
        menu.remove();
        document.removeEventListener('click', closeMenu);
      }
    });
  }, 0);
}

async function handleRenameProject(projectId: number, currentName: string): Promise<void> {
  const newName = prompt('Enter new project name:', currentName);
  if (newName === null || newName.trim() === '') return;
  
  if (newName === currentName) return;

  try {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;

    const requestBody = {
      project_id: String(projectId),
      name: newName.trim()
    };

    const response = await fetch(import.meta.env.VITE_BACKEND + "/projects/rename", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: sessionData.session!.access_token,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Rename failed:", response.status, errorText);
      alert(`Failed to rename project: ${errorText}`);
      return;
    }

    await refreshProjects();
  } catch (error) {
    console.error("Rename project error:", error);
    alert("Failed to rename project. Please try again.");
  }
}

async function handleDeleteProject(projectId: number, projectName: string): Promise<void> {
  const confirmed = confirm(`Are you sure you want to delete "${projectName}"? This action cannot be undone.`);
  if (!confirmed) return;

  try {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;

    const deleteUrl = import.meta.env.VITE_BACKEND + `/projects/delete?id=${projectId}`;

    const response = await fetch(deleteUrl, {
      method: "DELETE",
      headers: {
        Authorization: sessionData.session!.access_token,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Delete failed:", response.status, errorText);
      alert(`Failed to delete project: ${errorText}`);
      return;
    }

    await refreshProjects();
  } catch (error) {
    console.error("Delete project error:", error);
    alert("Failed to delete project. Please try again.");
  }
}
