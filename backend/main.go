package main

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
	"github.com/nedpals/supabase-go"
)

// Database types
type User struct {
	ID    string `json:"id"`
	Email string `json:"email"`
}

type Project struct {
	ID   int    `json:"id"`
	Name string `json:"name"`
}

type ProjectData struct {
	Owner string `json:"owner"`
	Scene string `json:"scene"`
}

type Server struct {
	supabaseCli  *supabase.Client
	db           *sql.DB
	s3Client     *S3Client
	groqClient   *GroqClient
	compileQueue *JobQueue
	upgrader     websocket.Upgrader
}

func (s *Server) UpdateProjectScene(projectID, scene string) error {
	query := "UPDATE projects SET scene = $1 WHERE id = $2"
	_, err := s.db.Exec(query, scene, projectID)
	if err != nil {
		return fmt.Errorf("failed to update project scene: %w", err)
	}
	return nil
}

func (s *Server) GetProject(projectID string) (*ProjectData, error) {
	query := "SELECT owner, scene FROM projects WHERE id = $1"

	var project ProjectData
	err := s.db.QueryRow(query, projectID).Scan(&project.Owner, &project.Scene)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("project not found")
		}
		return nil, fmt.Errorf("failed to get project: %w", err)
	}

	return &project, nil
}

func (s *Server) Deploy(locationId int64, data string) error {
	query := `
		WITH new_deployment AS (
			INSERT INTO deployments (data) VALUES ($1) RETURNING id
		)
		UPDATE locations SET latest_deployment = (SELECT id FROM new_deployment) WHERE id = $2
	`

	_, err := s.db.Exec(query, data, locationId)
	if err != nil {
		return fmt.Errorf("failed to deploy: %w", err)
	}

	return nil
}

func main() {
	// Load environment variables
	if err := godotenv.Load(); err != nil {
		log.Println(".env not loaded")
	}

	supabaseCli := supabase.CreateClient(os.Getenv("SUPABASE_URL"), os.Getenv("SUPABASE_API_KEY"))

	// Initialize clients
	db, err := sql.Open("postgres", os.Getenv("POSTGRES_URL"))
	if err != nil {
		log.Fatal("Failed to initialize database:", err)
	}

	if err := db.Ping(); err != nil {
		log.Fatal("Failed to ping database:", err)
	}

	s3Client, err := NewS3Client(
		os.Getenv("S3_ENDPOINT"),
		os.Getenv("S3_ACCESS_KEY_ID"),
		os.Getenv("S3_SECRET_ACCESS_KEY"),
		os.Getenv("S3_BUCKET"),
	)
	if err != nil {
		log.Fatal("failed to initialize S3 client: ", err)
	}

	groqClient := NewGroqClient(os.Getenv("GROQ_API_KEY"))
	compileQueue := NewJobQueue()

	cors := os.Getenv("CORS")

	server := &Server{
		supabaseCli:  supabaseCli,
		db:           db,
		s3Client:     s3Client,
		groqClient:   groqClient,
		compileQueue: compileQueue,
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool {
				origin := r.Header.Get("Origin")
				return origin == "" || origin == cors
			},
		},
	}

	http.HandleFunc("/projects", server.handleProjects)
	http.HandleFunc("/projects/{id}/assets", server.handleAssets)
	http.HandleFunc("/machines/{id}/project", server.handleMachineProject)
	http.HandleFunc("/", server.handleWebSocket)

	port := os.Getenv("PORT")
	if port == "" {
		port = "3000"
	}

	fmt.Printf("Server running on port %s\n", port)
	log.Fatal(http.ListenAndServe(":"+port, nil))
}

func (s *Server) setCORSHeaders(w http.ResponseWriter) {
	cors := os.Getenv("CORS")
	if cors == "" {
		cors = "*"
	}
	w.Header().Set("Access-Control-Allow-Origin", cors)
	w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
	w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, DELETE")
}

/*func (s *Server) handleProjectAgent(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w)

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Extract project ID from URL
	projectID := s.parseProjectID(r.URL.Path)
	if projectID == "" {
		http.Error(w, "Project not found", http.StatusNotFound)
		return
	}

	// Parse form data
	if err := r.ParseMultipartForm(10 << 20); err != nil {
		http.Error(w, "Bad request", http.StatusBadRequest)
		return
	}

	prompt := r.FormValue("prompt")
	if len(prompt) < 1 {
		http.Error(w, "No prompt provided", http.StatusBadRequest)
		return
	}

	if len(prompt) > 2000 {
		http.Error(w, "Prompt too long", http.StatusBadRequest)
		return
	}

	// Authorize user
	_, err := s.authorize(r)
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Get project data
	query := `
		SELECT p.id, p.scene, COALESCE(d.source, '') as source, COALESCE(d.created_at::text, '') as created_at
		FROM projects p
		LEFT JOIN deployments d ON p.id = d.project_id
		WHERE p.id = $1
		ORDER BY d.created_at DESC
		LIMIT 1
	`

	var projectData ProjectWithDeployment
	err = s.db.QueryRow(query, projectID).Scan(
		&projectData.ID,
		&projectData.Scene,
		&projectData.Source,
		&projectData.CreatedAt,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			http.Error(w, "Project not found", http.StatusNotFound)
			return
		}
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	// Update project scene with new prompt
	var sceneData []map[string]interface{}
	if err := json.Unmarshal([]byte(projectData.Scene), &sceneData); err != nil {
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	if len(sceneData) > 0 {
		sceneData[0]["prompt"] = prompt
	}

	updatedScene, _ := json.Marshal(sceneData)
	if err := s.UpdateProjectScene(projectID, string(updatedScene)); err != nil {
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	// Generate code using AI
	conversation := NewCodeConversation(prompt, projectData.Source)
	var result JobSuccess
	var code string

Retry:
	for range 2 {
		code, err = conversation.Generate(s.groqClient)
		if err != nil {
			log.Printf("AI generation failed: %v", err)
			continue
		}

		log.Printf("AI generated code: %s", code)

		compileResult := s.compileQueue.Enqueue(code)
		switch compileResult.Status {
		case StatusSuccess:
			result = compileResult.Result.(JobSuccess)
			break Retry

		case StatusCompileError:
			conversation.ReportError(compileResult.Result.(string))
			log.Printf("Compile error: %s", compileResult.Result.(string))
			continue

		case StatusInternalError:
			log.Printf("Internal error: %s", compileResult.Result.(error).Error())
			break Retry
		}
	}

	defer result.Cleanup()

	if result.ID == "" {
		http.Error(w, "Job failed", http.StatusInternalServerError)
		return
	}

	if err := s.s3Client.UploadFile(result.ID, result.WasmPath); err != nil {
		log.Printf("WASM upload failed: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	// Save deployment
	query = "INSERT INTO deployments (project_id, source, compiled_object) VALUES ($1, $2, $3)"
	_, err = s.db.Exec(query, projectID, code, result.ID)
	if err != nil {
		log.Printf("Failed to save deployment: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	w.Write([]byte("OK"))
}*/

func (s *Server) handleProjects(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w)

	user, err := s.authorize(r)
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	switch r.Method {
	case "GET":
		query := "SELECT id, name FROM projects WHERE owner = $1"
		rows, err := s.db.Query(query, user.ID)
		if err != nil {
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		var projects []Project
		for rows.Next() {
			var project Project
			if err := rows.Scan(&project.ID, &project.Name); err != nil {
				http.Error(w, "Internal server error", http.StatusInternalServerError)
				return
			}
			projects = append(projects, project)
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(projects)

	case "POST":
		var request struct {
			Name string `json:"name"`
		}

		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			http.Error(w, "Bad request", http.StatusBadRequest)
			return
		}

		if request.Name == "" {
			http.Error(w, "Name required", http.StatusBadRequest)
			return
		}

		if len(request.Name) > 255 {
			http.Error(w, "Name too long", http.StatusBadRequest)
			return
		}

		query := `
			INSERT INTO projects (name, owner)
			SELECT $1, $2
			WHERE EXISTS (SELECT 1 FROM roles WHERE "user" = $2 AND role = 'developer')
			RETURNING id
		`

		var projectId int64
		err = s.db.QueryRow(query, request.Name, user.ID).Scan(&projectId)
		if err == sql.ErrNoRows {
			http.Error(w, "Forbidden", http.StatusForbidden)
			return
		}

		if err != nil {
			log.Printf("Failed to create project: %v", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]int64{"id": projectId})

	case "PUT":
		var request struct {
			ProjectID string `json:"project_id"`
			Name      string `json:"name"`
		}

		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			http.Error(w, "Bad request", http.StatusBadRequest)
			return
		}

		if request.ProjectID == "" {
			http.Error(w, "Project ID required", http.StatusBadRequest)
			return
		}

		if request.Name == "" {
			http.Error(w, "Name required", http.StatusBadRequest)
			return
		}

		if len(request.Name) > 255 {
			http.Error(w, "Name too long", http.StatusBadRequest)
			return
		}

		query := "UPDATE projects SET name = $1 WHERE id = $2 AND owner = $3"

		result, err := s.db.Exec(query, request.Name, request.ProjectID, user.ID)
		if err != nil {
			log.Printf("Failed to rename project: %v", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}

		rowsAffected, err := result.RowsAffected()
		if err != nil {
			log.Printf("Failed to get rows affected: %v", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}

		if rowsAffected == 0 {
			http.Error(w, "Project not found", http.StatusNotFound)
			return
		}

		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))

	case "DELETE":
		projectID := r.URL.Query().Get("id")
		if projectID == "" {
			http.Error(w, "Project ID required", http.StatusBadRequest)
			return
		}

		query := "DELETE FROM projects WHERE id = $1 AND owner = $2"

		result, err := s.db.Exec(query, projectID, user.ID)
		if err != nil {
			log.Printf("Failed to delete project: %v", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}

		rowsAffected, err := result.RowsAffected()
		if err != nil {
			log.Printf("Failed to get rows affected: %v", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}

		if rowsAffected == 0 {
			http.Error(w, "Project not found", http.StatusNotFound)
			return
		}

		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))

	case "OPTIONS":
		w.WriteHeader(http.StatusNoContent)
		return

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
}

func (s *Server) handleAssets(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w)

	user, err := s.authorize(r)
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	projectId := r.PathValue("id")
	projectIdInt, err := strconv.ParseInt(projectId, 10, 64)
	if err != nil {
		http.Error(w, "Invalid project ID", http.StatusBadRequest)
		return
	}

	switch r.Method {
	case "GET":
		existingFiles, err := s.getExistingAssets(projectIdInt, user.ID)
		if err != nil {
			log.Printf("failed to get existing assets: %v", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}

		assets := make(map[string]string)
		for name, asset := range existingFiles {
			assets[name] = asset.Hash
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(assets)

	case "POST":
		if err := r.ParseMultipartForm(1024 * 1024 * 10); err != nil {
			http.Error(w, "Bad request", http.StatusBadRequest)
			return
		}

		newFiles := make(map[string]string)
		if err := json.Unmarshal([]byte(r.FormValue("hashes")), &newFiles); err != nil {
			http.Error(w, "Bad request", http.StatusBadRequest)
			return
		}

		existingFiles, err := s.getExistingAssets(projectIdInt, user.ID)
		if err != nil {
			log.Printf("failed to get existing assets: %v", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}

		complete := false
		createdFiles := map[string]Asset{}
		defer func() {
			if !complete {
				for _, file := range createdFiles {
					if err := s.s3Client.Delete(file.Object); err != nil {
						log.Printf("failed to rollback file: %v", err)
					}
				}
			}
		}()

		for name, clientHash := range newFiles {
			if len(name) == 0 || len(name) > 255 {
				http.Error(w, "file name has invalid length", http.StatusBadRequest)
				return
			}

			if name != "main.wasm" && !strings.HasSuffix(name, ".png") {
				http.Error(w, "only main.wasm and .png files can be uploaded", http.StatusBadRequest)
				return
			}

			existingFile, ok := existingFiles[name]
			needsUpload := !ok || existingFile.Hash != clientHash
			if !needsUpload {
				continue
			}

			s3Name := uuid.New().String()
			uploadedFile, _, err := r.FormFile(name)
			if err == http.ErrMissingFile {
				http.Error(w, "Upload missing", http.StatusBadRequest)
				return
			}

			if err != nil {
				log.Printf("failed to parse uploaded file: %v", err)
				http.Error(w, "Internal server error", http.StatusInternalServerError)
				return
			}

			data, err := io.ReadAll(uploadedFile)
			if err != nil {
				log.Printf("failed to read uploaded file: %v", err)
				http.Error(w, "Internal server error", http.StatusInternalServerError)
				return
			}

			hash := sha256.Sum256(data)
			hashString := hex.EncodeToString(hash[:])
			if hashString != clientHash {
				http.Error(w, "Hash mismatch", http.StatusBadRequest)
				return
			}

			if err := s.s3Client.UploadBuffer(s3Name, data); err != nil {
				log.Printf("failed to upload file: %v", err)
				http.Error(w, "Internal server error", http.StatusInternalServerError)
				return
			}

			createdFiles[name] = Asset{Hash: hashString, Object: s3Name}
		}

		tx, err := s.db.BeginTx(r.Context(), nil)
		if err != nil {
			log.Printf("failed to begin transaction: %v", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}
		defer tx.Rollback()

		for name, file := range createdFiles {
			query := `
				INSERT INTO project_assets (name, hash, object, project)
				VALUES ($1, $2, $3, $4)
				ON CONFLICT (name, project) DO UPDATE SET hash = $2, object = $3
			`
			_, err := tx.Exec(query, name, file.Hash, file.Object, projectIdInt)
			if err != nil {
				log.Printf("failed to insert file: %v", err)
				http.Error(w, "Internal server error", http.StatusInternalServerError)
				return
			}
		}

		toDelete := []string{}
		for name, existingFile := range existingFiles {
			newAsset, ok := newFiles[name]
			if ok && newAsset == existingFile.Hash {
				continue
			}

			query := "DELETE FROM project_assets WHERE name = $1 AND project = $2 AND hash = $3"
			_, err := tx.Exec(query, name, projectIdInt, existingFile.Hash)
			if err != nil && err != sql.ErrNoRows {
				log.Printf("failed to delete file: %v", err)
				http.Error(w, "Internal server error", http.StatusInternalServerError)
				return
			}

			toDelete = append(toDelete, existingFile.Object)
		}

		if err := tx.Commit(); err != nil {
			log.Printf("failed to commit transaction: %v", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}

		complete = true
		s.s3Client.ParallelDelete(toDelete)

	case "OPTIONS":
		w.WriteHeader(http.StatusNoContent)
		return

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
}

func (s *Server) handleMachineProject(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w)

	machineId := r.PathValue("id")
	machineIdInt, err := strconv.Atoi(machineId)
	if err != nil {
		http.Error(w, "Not found", http.StatusNotFound)
		return
	}

	switch r.Method {
	case "POST":
		user, err := s.authorize(r)
		if err != nil {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		var request struct {
			ProjectId string `json:"project_id"`
		}

		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			http.Error(w, "Bad request", http.StatusBadRequest)
			return
		}

		query := `
			UPDATE machines SET project = $1
			WHERE id = $2 AND EXISTS (
				SELECT 1 FROM machines
				JOIN locations ON machines.location = locations.id
				WHERE locations.owner = $3 AND machines.id = $2
			) AND EXISTS (
				SELECT 1 FROM projects WHERE projects.id = $1 AND projects.owner = $3
			)
		`

		if _, err = s.db.Exec(query, request.ProjectId, machineIdInt, user.ID); err != nil {
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}

	case "OPTIONS":
		w.WriteHeader(http.StatusNoContent)
		return
	}
}

func (s *Server) handleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := s.upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade failed: %v", err)
		return
	}
	defer conn.Close()

	ws := NewWebSocketHandler(s, s.supabaseCli, s.s3Client, conn)
	ws.Handle()
}

func (s *Server) authorize(r *http.Request) (*supabase.User, error) {
	auth := r.Header.Get("Authorization")
	if auth == "" {
		return nil, fmt.Errorf("no authorization header")
	}

	user, err := s.supabaseCli.Auth.User(context.Background(), auth)
	if err != nil {
		return nil, fmt.Errorf("failed to get user: %w", err)
	}

	return user, nil
}

type Asset struct {
	Hash   string `json:"hash"`
	Object string `json:"object"`
}

func (s *Server) getExistingAssets(projectId int64, userId string) (map[string]Asset, error) {
	query := `
		SELECT name, hash, object
		FROM project_assets
		WHERE project = $1 AND EXISTS (
			SELECT 1 FROM projects WHERE projects.id = project_assets.project
				AND projects.owner = $2
		)
	`

	rows, err := s.db.Query(query, projectId, userId)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	existingFiles := map[string]Asset{}
	for rows.Next() {
		var name, hash, object string
		if err := rows.Scan(&name, &hash, &object); err != nil {
			return nil, err
		}

		existingFiles[name] = Asset{Hash: hash, Object: object}
	}

	return existingFiles, nil
}
