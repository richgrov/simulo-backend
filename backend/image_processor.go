package main

import (
	"bytes"
	"fmt"
	"image"
	"image/gif"
	"image/jpeg"
	"image/png"
	"net/http"

	// Note: WebP support would require golang.org/x/image/webp
)

// isValidImage checks if the given data is a valid image file
func isValidImage(data []byte) bool {
	// Check if it's a valid image by trying to decode it
	_, _, err := image.Decode(bytes.NewReader(data))
	return err == nil
}

// convertToPNG converts an image of any supported format to PNG
// Returns the PNG data as bytes, or an error if conversion fails
func convertToPNG(data []byte) ([]byte, error) {
	// Detect the image format first
	contentType := http.DetectContentType(data)
	
	// Check if it's already PNG
	if contentType == "image/png" {
		// Validate it's actually a valid PNG by decoding it
		if isValidImage(data) {
			return data, nil
		}
		return nil, fmt.Errorf("invalid PNG data")
	}
	
	// Check if it's a supported image format
	if !isValidImage(data) {
		return nil, fmt.Errorf("unsupported or invalid image format")
	}
	
	// Decode the image
	img, format, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return nil, fmt.Errorf("failed to decode image: %w", err)
	}
	
	// Supported formats: jpeg, gif, png (webp would require additional package)
	switch format {
	case "jpeg", "gif", "png":
		// Convert to PNG
		var buf bytes.Buffer
		if err := png.Encode(&buf, img); err != nil {
			return nil, fmt.Errorf("failed to encode PNG: %w", err)
		}
		return buf.Bytes(), nil
	default:
		return nil, fmt.Errorf("unsupported image format: %s", format)
	}
}

// validateAndConvertImage validates that the data is an image and converts it to PNG
func validateAndConvertImage(data []byte) ([]byte, error) {
	if len(data) == 0 {
		return nil, fmt.Errorf("empty data")
	}
	
	// Convert to PNG (this also validates it's a valid image)
	pngData, err := convertToPNG(data)
	if err != nil {
		return nil, fmt.Errorf("image validation/conversion failed: %w", err)
	}
	
	return pngData, nil
}