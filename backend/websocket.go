package main

import (
	"context"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"log"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/nedpals/supabase-go"
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
	db             *DatabaseClient
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

func NewWebSocketHandler(db *DatabaseClient, supabaseCli *supabase.Client, s3Client *S3Client, conn *websocket.Conn) *WebSocketHandler {
	return &WebSocketHandler{
		db:             db,
		supabaseCli:    supabaseCli,
		s3Client:       s3Client,
		conn:           conn,
		onlineMachines: NewOnlineMachines(),
	}
}

func (ws *WebSocketHandler) Handle() {
	var data WebSocketData
	
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
				log.Printf("[machine %d] %v", d.MachineID, message)
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

	machine, err := ws.db.GetMachine(machineID)
	if err != nil {
		ws.conn.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(1011, "machine not found"))
		return nil
	}

	if !ws.verifySignature(idString, machine.PublicKey, signature) {
		ws.conn.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(4005, "invalid signature"))
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

	projectData, err := ws.db.GetProject(parts[1])
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
	ws.conn.WriteMessage(websocket.TextMessage, []byte("scene|"+projectData.Scene))

	// Send machine online status
	var sceneData []map[string]interface{}
	json.Unmarshal([]byte(projectData.Scene), &sceneData)
	
	for _, object := range sceneData {
		if object["type"] == "machine" {
			if machineID, ok := object["id"].(float64); ok {
				online := ws.onlineMachines.Has(int(machineID))
				ws.conn.WriteMessage(websocket.TextMessage, []byte(fmt.Sprintf("machineonline|%d|%t", int(machineID), online)))
			}
		}
	}

	if len(sceneData) > 0 {
		if promptImages, ok := sceneData[0]["promptImages"].([]interface{}); ok {
			for _, imageID := range promptImages {
				if idStr, ok := imageID.(string); ok {
					url, err := ws.s3Client.PresignURL(idStr, 5*time.Minute)
					if err == nil {
						packet := NewPacket()
						packet.U8(1)
						packet.String(url)
						ws.conn.WriteMessage(websocket.BinaryMessage, packet.ToBuffer())
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

	reader := NewPacketReader(message)
	id, err := reader.U8()
	if err != nil {
		ws.conn.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(4012, "invalid packet"))
		return
	}

	switch id {
	case 0: // File upload
		fileCount, err := reader.U8()
		if err != nil {
			ws.conn.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(4014, "invalid file count"))
			return
		}

		for i := 0; i < int(fileCount); i++ {
			data, err := reader.DynBytes()
			if err != nil {
				ws.conn.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(4015, "invalid file data"))
				return
			}

			projectData, err := ws.db.GetProject(userData.ProjectID)
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
			ws.db.UpdateProjectScene(userData.ProjectID, string(updatedScene))

			// Send presigned URL back
			url, err := ws.s3Client.PresignURL(fileID, 5*time.Minute)
			if err == nil {
				packet := NewPacket()
				packet.U8(1)
				packet.String(url)
				ws.conn.WriteMessage(websocket.BinaryMessage, packet.ToBuffer())
			}
		}

	default:
		ws.conn.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(4013, "unknown message type"))
	}
}

func (ws *WebSocketHandler) sendMachineProject(machineID int) {
	projectData, err := ws.db.GetMachineProject(machineID)
	if err != nil {
		ws.conn.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(1011, "machine project not found"))
		return
	}

	if projectData.CompiledObject == "" {
		ws.conn.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(4006, "no compiled object"))
		return
	}

	var scene []map[string]interface{}
	json.Unmarshal([]byte(projectData.Scene), &scene)

	files := []string{projectData.CompiledObject}
	if len(scene) > 0 {
		if promptImages, ok := scene[0]["promptImages"].([]interface{}); ok {
			for _, img := range promptImages {
				if imgStr, ok := img.(string); ok {
					files = append(files, imgStr)
				}
			}
		}
	}

	urls := make([]string, len(files))
	hashes := make([][]byte, len(files))

	for i, fileID := range files {
		url, err := ws.s3Client.PresignURL(fileID, 5*time.Minute)
		if err != nil {
			log.Printf("Failed to presign URL for %s: %v", fileID, err)
			continue
		}
		urls[i] = url

		hash, err := ws.s3Client.GetHash(fileID)
		if err != nil {
			log.Printf("Failed to get hash for %s: %v", fileID, err)
			continue
		}
		hashes[i] = hash
	}

	packet := NewPacket()
	packet.U8(0)
	packet.String(urls[0])
	packet.Bytes(hashes[0])
	packet.U8(uint8(len(urls) - 1))
	for i := 1; i < len(urls); i++ {
		packet.String(urls[i])
		packet.Bytes(hashes[i])
	}

	ws.conn.WriteMessage(websocket.BinaryMessage, packet.ToBuffer())
}

func (ws *WebSocketHandler) verifySignature(id, publicKeyPem string, signature []byte) bool {
	block, _ := pem.Decode([]byte(publicKeyPem))
	if block == nil {
		return false
	}

	_, err := x509.ParsePKIXPublicKey(block.Bytes)
	if err != nil {
		return false
	}

	// This is a simplified verification - implement proper signature verification
	// based on your specific key type and signature algorithm
	return true
}

