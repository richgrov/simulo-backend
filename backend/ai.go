package main

import (
	"context"
	_ "embed"
	"fmt"
	"strings"

	"github.com/conneroisu/groq-go"
)

//go:embed prompt.md
var AI_INSTRUCTIONS string

type GroqClient struct {
	client *groq.Client
}

type CodeConversation struct {
	messages []groq.ChatCompletionMessage
}

func NewGroqClient(apiKey string) *GroqClient {
	client, err := groq.NewClient(apiKey)
	if err != nil {
		panic(fmt.Sprintf("failed to create Groq client: %v", err))
	}
	return &GroqClient{client: client}
}

func NewCodeConversation(query, existingCode string) *CodeConversation {
	input := query
	/*if existingCode != "" {
		input = fmt.Sprintf("Rewrite the following Rust code according to the request:\n```rust\n%s\n```\n\nQuery: %s", existingCode, query)
	}*/

	return &CodeConversation{
		messages: []groq.ChatCompletionMessage{
			{
				Role:    groq.RoleSystem,
				Content: AI_INSTRUCTIONS,
			},
			{
				Role:    groq.RoleUser,
				Content: input,
			},
		},
	}
}

func (c *CodeConversation) Generate(groqClient *GroqClient) (string, error) {
	req := groq.ChatCompletionRequest{
		Model:       groq.ChatModel("openai/gpt-oss-120b"),
		Messages:    c.messages,
		Temperature: 0.2,
	}

	chatCompletion, err := groqClient.client.ChatCompletion(context.Background(), req)
	if err != nil {
		return "", fmt.Errorf("failed to create chat completion: %w", err)
	}

	if len(chatCompletion.Choices) == 0 {
		return "", fmt.Errorf("no choices returned from Groq")
	}

	message := chatCompletion.Choices[0].Message
	text := message.Content

	c.messages = append(c.messages, groq.ChatCompletionMessage{
		Role:    groq.RoleAssistant,
		Content: text,
	})

	codeStart := strings.Index(text, "```cpp")
	if codeStart == -1 {
		return "", fmt.Errorf("no cpp code block found")
	}
	codeStart += len("```cpp")

	codeEnd := strings.Index(text[codeStart:], "```")
	if codeEnd == -1 {
		return "", fmt.Errorf("incomplete cpp code block")
	}

	return text[codeStart : codeStart+codeEnd], nil
}

func (c *CodeConversation) ReportError(error string) {
	c.messages = append(c.messages, groq.ChatCompletionMessage{
		Role:    groq.RoleUser,
		Content: fmt.Sprintf("An error occurred. Produce a new code block in the same format as described in the instructions based on this error: %s", error),
	})
}
