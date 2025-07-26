# Go Backend CI/CD

This document describes the GitHub Actions workflow for building and testing the Go backend.

## Workflow Overview

The CI/CD pipeline is defined in `.github/workflows/go-backend.yml` and includes the following jobs:

### 1. Test Job
- **Runs on**: Ubuntu Latest
- **Go Version**: 1.24.3
- **Database**: PostgreSQL 15 (for integration tests)

**Steps:**
- Checkout code
- Set up Go environment with caching
- Download and verify dependencies
- Run `go vet` for static analysis
- Check code formatting with `gofmt`
- Run `staticcheck` for additional static analysis
- Execute tests with race detection and coverage
- Generate HTML coverage report
- Check coverage threshold (70% minimum)

### 2. Build Job
- **Runs on**: Ubuntu Latest
- **Depends on**: Test job success
- **Cross-compilation targets**:
  - Linux AMD64
  - macOS AMD64 & ARM64
  - Windows AMD64

**Features:**
- Static linking (CGO_ENABLED=0)
- Binary size optimization (-ldflags="-w -s")
- Upload build artifacts

### 3. Security Job
- **Runs on**: Ubuntu Latest
- **Tools**: Gosec security scanner (installed via Go)
- **Output**: SARIF format for GitHub Security tab
- **Error handling**: Non-blocking (continues on security findings)

### 4. Dependency Check Job
- **Runs on**: Ubuntu Latest
- **Tool**: govulncheck for vulnerability scanning (binary mode)
- **Error handling**: Non-blocking (continues on vulnerabilities)
- **Additional**: Basic dependency pattern checking

## Triggers

The workflow runs on:
- Push to `main` or `develop` branches
- Pull requests to `main` or `develop` branches
- Only when files in `backend/` directory or the workflow file itself are changed

## Environment Variables

The test job sets up the following environment variables:
- `DATABASE_URL`: PostgreSQL connection string for tests
- `GO_ENV`: Set to "test" for test runs

## Coverage Requirements

- Minimum coverage threshold: 70%
- Coverage reports are uploaded as artifacts
- HTML coverage reports are generated for detailed analysis

## Local Testing

To run the same checks locally:

```bash
cd backend

# Download dependencies
go mod download

# Run static analysis
go vet ./...
go install honnef.co/go/tools/cmd/staticcheck@latest
staticcheck ./...

# Check formatting
gofmt -s -l .

# Run tests with coverage
go test -v -race -coverprofile=coverage.out ./...
go tool cover -html=coverage.out -o coverage.html

# Build binary
go build -o bin/backend .

# Security scan
go install github.com/securecodewarrior/gosec/v2/cmd/gosec@latest
gosec -fmt sarif -out gosec.sarif ./...

# Vulnerability check
go install golang.org/x/vuln/cmd/govulncheck@latest
govulncheck -mode=binary .
```

## Artifacts

The workflow generates the following artifacts:
- **coverage-report**: HTML coverage report
- **backend-binaries**: Cross-compiled binaries for multiple platforms

## Notes

- The workflow uses Go module caching to speed up builds
- PostgreSQL service is available for integration tests
- All binaries are statically linked for better portability
- Security scanning results are uploaded to GitHub's Security tab