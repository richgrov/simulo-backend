package main

import (
	"crypto/rand"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
)

const WORK_DIR = "workdir"

type Job struct {
	Code string
	Done chan *JobResult
}

const (
	StatusSuccess = iota
	StatusCompileError
	StatusInternalError
)

type JobSuccess struct {
	ID       string
	WasmPath string
	Output   string
}

type JobResult struct {
	Status int
	Result any
}

type JobQueue struct {
	queue   []*Job
	mutex   sync.Mutex
	running bool
}

func NewJobQueue() *JobQueue {
	// Create work directory if it doesn't exist
	if err := os.MkdirAll(WORK_DIR, 0755); err != nil {
		panic(fmt.Sprintf("failed to create work directory: %v", err))
	}

	return &JobQueue{
		queue: make([]*Job, 0),
	}
}

func (jq *JobQueue) Enqueue(code string) *JobResult {
	job := &Job{
		Code: code,
		Done: make(chan *JobResult, 1),
	}

	jq.mutex.Lock()
	jq.queue = append(jq.queue, job)
	if !jq.running {
		jq.running = true
		go jq.process()
	}
	jq.mutex.Unlock()

	result := <-job.Done
	return result
}

func (jq *JobQueue) process() {
	for {
		jq.mutex.Lock()
		if len(jq.queue) == 0 {
			jq.running = false
			jq.mutex.Unlock()
			return
		}

		job := jq.queue[0]
		jq.queue = jq.queue[1:]
		jq.mutex.Unlock()

		result, err := jq.runJob(job.Code)
		if err != nil {
			result = &JobResult{Status: StatusInternalError, Result: err}
		}
		job.Done <- result
	}
}

func (jq *JobQueue) runJob(code string) (*JobResult, error) {
	// Generate random ID starting with 'a'
	id := "a" + generateRandomHex(16)
	fmt.Printf("Running job %s\n", id)

	dir := filepath.Join(WORK_DIR, id)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create directory: %v", err)
	}

	// Initialize cargo project
	cmd := exec.Command("cargo", "init", "--lib")
	cmd.Dir = dir
	if err := cmd.Run(); err != nil {
		os.RemoveAll(dir)
		return nil, fmt.Errorf("failed to init cargo project: %v", err)
	}

	// Update Cargo.toml
	cargoToml := `[package]
name = "` + id + `"
version = "0.1.0"
edition = "2021"

[dependencies]
glam = "0.30.4"

[lib]
crate-type = ["cdylib"]
`
	if err := os.WriteFile(filepath.Join(dir, "Cargo.toml"), []byte(cargoToml), 0644); err != nil {
		os.RemoveAll(dir)
		return nil, fmt.Errorf("failed to write Cargo.toml: %v", err)
	}

	// Copy template files
	srcDir := filepath.Join(dir, "src")
	templateDir := filepath.Join("backend", "template")

	if err := copyFile(filepath.Join(templateDir, "lib.rs"), filepath.Join(srcDir, "lib.rs")); err != nil {
		os.RemoveAll(dir)
		return nil, fmt.Errorf("failed to copy lib.rs: %v", err)
	}

	if err := copyFile(filepath.Join(templateDir, "simulo.rs"), filepath.Join(srcDir, "simulo.rs")); err != nil {
		os.RemoveAll(dir)
		return nil, fmt.Errorf("failed to copy simulo.rs: %v", err)
	}

	// Write game code
	if err := os.WriteFile(filepath.Join(srcDir, "game.rs"), []byte(code), 0644); err != nil {
		os.RemoveAll(dir)
		return nil, fmt.Errorf("failed to write game.rs: %v", err)
	}

	// Build the project
	cmd = exec.Command("cargo", "build", "--target", "wasm32-unknown-unknown", "--release")
	cmd.Dir = dir
	output, err := cmd.CombinedOutput()
	if err != nil {
		os.RemoveAll(dir)
		return &JobResult{Status: StatusCompileError, Result: string(output)}, nil
	}

	// Construct WASM path
	crateName := strings.ReplaceAll(id, "-", "_")
	wasmPath := filepath.Join(dir, "target", "wasm32-unknown-unknown", "release", crateName+".wasm")

	fmt.Printf("Job %s completed\n", id)
	return &JobResult{Status: StatusSuccess, Result: JobSuccess{ID: id, WasmPath: wasmPath}}, nil
}

func (jr *JobSuccess) Cleanup() {
	dir := filepath.Join(WORK_DIR, jr.ID)
	os.RemoveAll(dir)
}

func generateRandomHex(length int) string {
	bytes := make([]byte, length)
	if _, err := rand.Read(bytes); err != nil {
		panic(fmt.Sprintf("failed to generate random bytes: %v", err))
	}
	return fmt.Sprintf("%x", bytes)
}

func copyFile(src, dst string) error {
	sourceFile, err := os.Open(src)
	if err != nil {
		return err
	}
	defer sourceFile.Close()

	destFile, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer destFile.Close()

	_, err = io.Copy(destFile, sourceFile)
	return err
}
