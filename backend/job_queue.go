package main

import (
	"crypto/rand"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
)

const WORK_DIR = "workdir"
const TEMPLATE_DIR = "template"

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
	id := "a" + generateRandomHex(16)
	fmt.Printf("Running job %s\n", id)

	dir := filepath.Join(WORK_DIR, id)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create directory: %v", err)
	}

	if err := copyDir(TEMPLATE_DIR, dir); err != nil {
		return nil, fmt.Errorf("failed to copy templates: %v", err)
	}

	srcDir := filepath.Join(dir, "src")

	if err := os.WriteFile(filepath.Join(srcDir, "game.rs"), []byte(code), 0644); err != nil {
		return nil, fmt.Errorf("failed to write game.rs: %v", err)
	}

	cmd := exec.Command("cargo", "build", "--target", "wasm32-unknown-unknown", "--release")
	cmd.Dir = dir
	output, err := cmd.CombinedOutput()
	if err != nil {
		return &JobResult{Status: StatusCompileError, Result: string(output)}, nil
	}

	wasmPath := filepath.Join(dir, "target", "wasm32-unknown-unknown", "release", "program.wasm")

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

func copyDir(src, dst string) error {
	entries, err := os.ReadDir(src)
	if err != nil {
		return err
	}

	for _, entry := range entries {
		srcPath := filepath.Join(src, entry.Name())
		dstPath := filepath.Join(dst, entry.Name())
		if entry.IsDir() {
			if err := os.MkdirAll(dstPath, 0755); err != nil {
				return err
			}

			if err := copyDir(srcPath, dstPath); err != nil {
				return err
			}
		} else {
			if err := copyFile(srcPath, dstPath); err != nil {
				return err
			}
		}
	}
	return nil
}
