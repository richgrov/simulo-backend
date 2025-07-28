package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"fmt"
	"os"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
)

type S3Client struct {
	client *s3.Client
	bucket string
}

func NewS3Client(endpoint, accessKeyID, secretAccessKey, bucket string) *S3Client {
	cfg, err := config.LoadDefaultConfig(context.Background(),
		config.WithRegion("auto"),
		config.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(
			accessKeyID,
			secretAccessKey,
			"",
		)),
	)
	if err != nil {
		panic(fmt.Sprintf("failed to load AWS config: %v", err))
	}

	client := s3.NewFromConfig(cfg, func(o *s3.Options) {
		o.BaseEndpoint = aws.String(endpoint)
		o.UsePathStyle = true
	})

	return &S3Client{
		client: client,
		bucket: bucket,
	}
}

func (s *S3Client) UploadFile(name, filePath string) error {
	data, err := os.ReadFile(filePath)
	if err != nil {
		return fmt.Errorf("failed to read file: %w", err)
	}

	return s.UploadBuffer(name, data)
}

func (s *S3Client) UploadBuffer(name string, data []byte) error {
	_, err := s.client.PutObject(context.Background(), &s3.PutObjectInput{
		Bucket:            aws.String(s.bucket),
		Key:               aws.String(name),
		Body:              bytes.NewReader(data),
		ChecksumAlgorithm: types.ChecksumAlgorithmSha256,
	})

	if err != nil {
		return fmt.Errorf("failed to upload file: %w", err)
	}

	return nil
}

func (s *S3Client) PresignURL(name string, expiresIn time.Duration) (string, error) {
	presignClient := s3.NewPresignClient(s.client)

	request, err := presignClient.PresignGetObject(context.Background(), &s3.GetObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(name),
	}, func(opts *s3.PresignOptions) {
		opts.Expires = expiresIn
	})

	if err != nil {
		return "", fmt.Errorf("failed to presign URL: %w", err)
	}

	return request.URL, nil
}

func (s *S3Client) GetHash(name string) ([]byte, error) {
	response, err := s.client.HeadObject(context.Background(), &s3.HeadObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(name),
	})

	if err != nil {
		return nil, fmt.Errorf("failed to get object metadata: %w", err)
	}

	if response.ChecksumSHA256 == nil {
		return nil, fmt.Errorf("no SHA256 checksum available")
	}

	hash, err := base64.StdEncoding.DecodeString(*response.ChecksumSHA256)
	if err != nil {
		return nil, fmt.Errorf("failed to decode checksum: %w", err)
	}

	return hash, nil
}
