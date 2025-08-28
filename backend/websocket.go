package main

import (
	"context"
	"crypto/ed25519"
	"crypto/x509"
	"database/sql"
	"encoding/json"
	"encoding/pem"
	"log"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/nedpals/supabase-go"

	"simulo.tech/backend/m/v2/protocol"
)

type WebSocketData interface {
	GetType() string
}

type MachineData struct {
	MachineID int
}

func (m *MachineData) GetType() string {
	return "machine"
}

type UserData struct {
	UserID    string
	ProjectID string
}

func (u *UserData) GetType() string {
	return "user"
}

type WebSocketHandler struct {
	server         *Server
	supabaseCli    *supabase.Client
	s3Client       *S3Client
	conn           *websocket.Conn
	onlineMachines *OnlineMachines
}

type OnlineMachines struct {
	machines map[int]bool
	mutex    sync.RWMutex
}

func NewOnlineMachines() *OnlineMachines {
	return &OnlineMachines{
		machines: make(map[int]bool),
	}
}

func (om *OnlineMachines) Add(machineID int) {
	om.mutex.Lock()
	defer om.mutex.Unlock()
	om.machines[machineID] = true
}

func (om *OnlineMachines) Remove(machineID int) {
	om.mutex.Lock()
	defer om.mutex.Unlock()
	delete(om.machines, machineID)
}

func (om *OnlineMachines) Has(machineID int) bool {
	om.mutex.RLock()
	defer om.mutex.RUnlock()
	return om.machines[machineID]
}

func NewWebSocketHandler(server *Server, supabaseCli *supabase.Client, s3Client *S3Client, conn *websocket.Conn) *WebSocketHandler {
	return &WebSocketHandler{
		server:         server,
		supabaseCli:    supabaseCli,
		s3Client:       s3Client,
		conn:           conn,
		onlineMachines: NewOnlineMachines(),
	}
}

func (ws *WebSocketHandler) Handle() {
	var data WebSocketData

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go ws.pingRoutine(ctx)

	for {
		messageType, message, err := ws.conn.ReadMessage()
		if err != nil {
			log.Printf("WebSocket read error: %v", err)
			break
		}

		if data == nil {
			// Authentication phase
			if messageType == websocket.TextMessage {
				data = ws.tryUserAuth(string(message))
			} else if messageType == websocket.BinaryMessage {
				data = ws.tryMachineAuth(message)
			}

			if data == nil {
				ws.conn.Close()
				break
			}
		} else {
			// Handle authenticated messages
			switch d := data.(type) {
			case *MachineData:
				log.Printf("[machine %d] %v", d.MachineID, string(message))
			case *UserData:
				ws.handleUserMessage(d, message)
			}
		}
	}

	// Cleanup on disconnect
	if machineData, ok := data.(*MachineData); ok {
		ws.onlineMachines.Remove(machineData.MachineID)
	}
}

func (ws *WebSocketHandler) tryMachineAuth(message []byte) WebSocketData {
	if len(message) < 1+1+64 || len(message) > 1+64+64 {
		ws.conn.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(4001, "invalid message length"))
		return nil
	}

	idLength := int(message[0])
	if len(message) != 1+idLength+64 {
		ws.conn.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(4002, "message length mismatch"))
		return nil
	}

	idBuffer := message[1 : 1+idLength]
	signature := message[1+idLength:]
	idString := string(idBuffer)

	machineID, err := strconv.Atoi(idString)
	if err != nil {
		ws.conn.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(4003, "invalid machine ID"))
		return nil
	}

	query := "SELECT public_key FROM machines WHERE id = $1"

	var publicKey string
	err = ws.server.db.QueryRow(query, machineID).Scan(&publicKey)
	if err != nil {
		if err == sql.ErrNoRows {
			ws.conn.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(4005, "not authorized"))
			return nil
		}
		ws.conn.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(1011, "machine not found"))
		return nil
	}

	if !ws.verifySignature(idString, publicKey, signature) {
		ws.conn.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(4005, "not authorized"))
		return nil
	}

	ws.onlineMachines.Add(machineID)
	log.Printf("Machine %d authenticated", machineID)

	ws.sendMachineProject(machineID)

	return &MachineData{MachineID: machineID}
}

func (ws *WebSocketHandler) tryUserAuth(message string) WebSocketData {
	parts := strings.Split(message, "|")
	if len(parts) != 2 {
		ws.conn.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(4007, "invalid auth format"))
		return nil
	}

	user, err := ws.supabaseCli.Auth.User(context.Background(), parts[0])
	if err != nil {
		ws.conn.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(4000, "unauthorized"))
		return nil
	}

	projectData, err := ws.server.GetProject(parts[1])
	if err != nil {
		ws.conn.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(4009, "project not found"))
		return nil
	}

	if projectData.Owner != user.ID {
		ws.conn.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(4008, "not project owner"))
		return nil
	}

	log.Printf("User %s authenticated", user.ID)

	// Send scene data
	ws.conn.WriteMessage(websocket.TextMessage, protocol.S2EInitScene(projectData.Scene))

	// Send machine online status
	var sceneData []map[string]interface{}
	json.Unmarshal([]byte(projectData.Scene), &sceneData)

	for _, object := range sceneData {
		if object["type"] == "machine" {
			if machineID, ok := object["id"].(float64); ok {
				online := ws.onlineMachines.Has(int(machineID))
				ws.conn.WriteMessage(websocket.TextMessage, protocol.S2EMachineOnline(int(machineID), online))
			}
		}
	}

	if len(sceneData) > 0 {
		if promptImages, ok := sceneData[0]["promptImages"].([]interface{}); ok {
			for _, imageID := range promptImages {
				if idStr, ok := imageID.(string); ok {
					url, err := ws.s3Client.PresignURL(idStr, 5*time.Minute)
					if err == nil {
						ws.conn.WriteMessage(websocket.BinaryMessage, protocol.S2EAddPromptImage(url))
					}
				}
			}
		}
	}

	return &UserData{UserID: user.ID, ProjectID: parts[1]}
}

func (ws *WebSocketHandler) handleUserMessage(userData *UserData, message []byte) {
	if len(message) < 1 {
		ws.conn.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(4011, "empty message"))
		return
	}

	reader := protocol.NewPacketReader(message)
	id, err := reader.U8()
	if err != nil {
		ws.conn.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(4012, "invalid packet"))
		return
	}

	switch id {
	case protocol.E2SAddImagesId:
		var packet protocol.E2SAddImages
		if err := packet.Unmarshal(reader); err != nil {
			ws.conn.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(4014, "protocol error"))
			return
		}

		for _, data := range packet.Uploads {
			projectData, err := ws.server.GetProject(userData.ProjectID)
			if err != nil {
				ws.conn.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(4016, "project not found"))
				return
			}

			// Generate new UUID for the file
			fileID := generateRandomHex(16)

			// Parse and update scene
			var scene []map[string]interface{}
			json.Unmarshal([]byte(projectData.Scene), &scene)

			if len(scene) > 0 {
				if promptImages, ok := scene[0]["promptImages"].([]interface{}); ok {
					scene[0]["promptImages"] = append(promptImages, fileID)
				} else {
					scene[0]["promptImages"] = []interface{}{fileID}
				}
			}

			// Upload to S3
			if err := ws.s3Client.UploadBuffer(fileID, data); err != nil {
				log.Printf("S3 upload failed: %v", err)
				continue
			}

			// Update database
			updatedScene, _ := json.Marshal(scene)
			ws.server.UpdateProjectScene(userData.ProjectID, string(updatedScene))

			// Send presigned URL back
			url, err := ws.s3Client.PresignURL(fileID, 5*time.Minute)
			if err == nil {
				packet := protocol.NewPacket()
				packet.U8(1)
				packet.String(url)
				ws.conn.WriteMessage(websocket.BinaryMessage, packet.ToBuffer())
			}
		}

	case protocol.E2SDeleteImageId:
		var packet protocol.E2SDeleteImage
		if err := packet.Unmarshal(reader); err != nil {
			ws.conn.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(4014, "protocol error"))
			return
		}

		projectData, err := ws.server.GetProject(userData.ProjectID)
		if err != nil {
			ws.conn.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(4016, "project not found"))
			return
		}

		scene := []map[string]interface{}{}
		json.Unmarshal([]byte(projectData.Scene), &scene)

		if len(scene) > 0 {
			promptImages, ok := scene[0]["promptImages"].([]interface{})
			if ok {
				index := int(packet.Index)
				if index < len(promptImages) {
					_ = ws.s3Client.Delete(promptImages[index].(string))
					scene[0]["promptImages"] = append(promptImages[:index], promptImages[index+1:]...)
				}
			}
		}

		updatedScene, _ := json.Marshal(scene)
		ws.server.UpdateProjectScene(userData.ProjectID, string(updatedScene))

		ws.conn.WriteMessage(websocket.BinaryMessage, protocol.S2EDeletePromptImage(packet.Index))

	default:
		ws.conn.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(4013, "unknown message type"))
	}
}

func (ws *WebSocketHandler) sendMachineProject(machineID int) {
	query := `
		SELECT object, name
		FROM project_assets
		WHERE project = (
			SELECT project
			FROM machines
			WHERE id = $1
		)
	`

	rows, err := ws.server.db.Query(query, machineID)
	if err != nil {
		log.Printf("Failed to get project data: %v", err)
		return
	}
	defer rows.Close()

	var programUrl string
	var programHash []byte
	urls := []string{}
	names := []string{}
	hashes := [][]byte{}

	for rows.Next() {
		var object, name string
		if err := rows.Scan(&object, &name); err != nil {
			log.Printf("Failed to scan row: %v", err)
			return
		}

		url, err := ws.s3Client.PresignURL(object, 5*time.Minute)
		if err != nil {
			log.Printf("Failed to presign URL for %s: %v", object, err)
			return
		}

		s3Hash, err := ws.s3Client.GetHash(object)
		if err != nil {
			log.Printf("Failed to get hash for %s: %v", object, err)
			return
		}

		if name == "main.wasm" {
			programUrl = url
			programHash = s3Hash
		} else {
			urls = append(urls, url)
			names = append(names, name)
			hashes = append(hashes, s3Hash)
		}
	}

	ws.conn.WriteMessage(websocket.BinaryMessage, protocol.S2MInitAssets(programUrl, programHash, names, urls, hashes))
}

func (ws *WebSocketHandler) pingRoutine(ctx context.Context) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := ws.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				log.Printf("WebSocket ping error: %v", err)
				return
			}
		}
	}
}

func (ws *WebSocketHandler) verifySignature(id, publicKeyPem string, signature []byte) bool {
	block, _ := pem.Decode([]byte(publicKeyPem))
	if block == nil {
		return false
	}

	publicKey, err := x509.ParsePKIXPublicKey(block.Bytes)
	if err != nil {
		return false
	}

	ed25519PubKey, ok := publicKey.(ed25519.PublicKey)
	if !ok {
		return false
	}

	message := []byte(id)
	return ed25519.Verify(ed25519PubKey, message, signature)
}
