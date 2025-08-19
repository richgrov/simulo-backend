package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"fmt"
	"os"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

type S3Client struct {
	client *minio.Client
	bucket string
}

func NewS3Client(endpoint, accessKeyID, secretAccessKey, bucket string) (*S3Client, error) {
	minioClient, err := minio.New(endpoint, &minio.Options{
		Creds:           credentials.NewStaticV4(accessKeyID, secretAccessKey, ""),
		Secure:          true,
		TrailingHeaders: true,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to initialize MinIO client: %v", err)
	}

	return &S3Client{
		client: minioClient,
		bucket: bucket,
	}, nil
}

func (s *S3Client) UploadFile(name, filePath string) error {
	data, err := os.ReadFile(filePath)
	if err != nil {
		return fmt.Errorf("failed to read file: %w", err)
	}

	return s.UploadBuffer(name, data)
}

func (s *S3Client) UploadBuffer(name string, data []byte) error {
	// Determine content type based on file extension
	contentType := "application/octet-stream"
	if len(name) > 4 && name[len(name)-4:] == ".png" {
		contentType = "image/png"
	}

	_, err := s.client.PutObject(context.Background(), s.bucket, name, bytes.NewReader(data), int64(len(data)), minio.PutObjectOptions{
		ContentType: contentType,
		Checksum:    minio.ChecksumSHA256,
	})

	if err != nil {
		return fmt.Errorf("failed to upload file: %w", err)
	}

	return nil
}

func (s *S3Client) Delete(name string) error {
	err := s.client.RemoveObject(context.Background(), s.bucket, name, minio.RemoveObjectOptions{})
	if err != nil {
		return fmt.Errorf("failed to delete object: %w", err)
	}

	return nil
}

func (s *S3Client) PresignURL(name string, expiresIn time.Duration) (string, error) {
	url, err := s.client.PresignedGetObject(context.Background(), s.bucket, name, expiresIn, nil)
	if err != nil {
		return "", fmt.Errorf("failed to presign URL: %w", err)
	}

	return url.String(), nil
}

func (s *S3Client) GetHash(name string) ([]byte, error) {
	info, err := s.client.StatObject(context.Background(), s.bucket, name, minio.StatObjectOptions{
		Checksum: true,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to get object metadata: %w", err)
	}

	hash, err := base64.StdEncoding.DecodeString(info.ChecksumSHA256)
	if err != nil {
		return nil, fmt.Errorf("failed to decode checksum: %w", err)
	}

	if len(hash) != 32 {
		return nil, fmt.Errorf("invalid checksum length: %d", len(hash))
	}

	return hash, nil
}
